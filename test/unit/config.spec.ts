import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  carregarConfig,
  ErroConfig,
  PADRAO,
  resolverDiretorio,
  VARIAVEIS_AMBIENTE,
} from '../../src/infraestructure/config/carregar-config';

/** Ambiente mínimo, sem herdar nada do processo real. */
function env(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  return { SOFTDESK_LOCAL_DIR: path.join(os.tmpdir(), 'sdl-teste-inexistente'), ...extra };
}

/** `lerArquivo` falso: devolve o conteúdo informado como se fosse o config.json. */
function arquivo(conteudo: unknown) {
  const texto = typeof conteudo === 'string' ? conteudo : JSON.stringify(conteudo);
  return () => texto;
}

function problemasDe(fn: () => unknown): string[] {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(ErroConfig);
    return (e as ErroConfig).problemas;
  }
  throw new Error('era esperado ErroConfig, mas carregarConfig não lançou');
}

describe('carregarConfig (VAL-18, RN-12)', () => {
  describe('padrões', () => {
    it('sem env e sem arquivo usa os padrões da tabela §8.2', () => {
      const c = carregarConfig({ env: env(), lerArquivo: () => null });
      expect(c).toMatchObject({
        baseUrl: 'https://helpdesk.clamed.com.br',
        cdAtendente: 393,
        perfilPadrao: 'A',
        esperaLoginSegundos: 120,
        porta: 47821,
        prazoVarreduraSegundos: 90,
        notificarWindows: true,
        nivelLog: 'info',
      });
      expect(PADRAO.cdAtendente).toBe(393);
    });
  });

  describe('precedência env > arquivo > padrão', () => {
    it('arquivo vence o padrão', () => {
      const c = carregarConfig({
        env: env(),
        lerArquivo: arquivo({ cdAtendente: 500, baseUrl: 'https://outro.clamed.com.br', porta: 50000 }),
      });
      expect(c.cdAtendente).toBe(500);
      expect(c.baseUrl).toBe('https://outro.clamed.com.br');
      expect(c.porta).toBe(50000);
      // o que o arquivo não diz continua no padrão
      expect(c.esperaLoginSegundos).toBe(120);
    });

    it('variável de ambiente vence o arquivo e o padrão, chave por chave', () => {
      const c = carregarConfig({
        env: env({ SOFTDESK_LOCAL_CD_ATENDENTE: '700', SOFTDESK_LOCAL_PERFIL_PADRAO: 'u' }),
        lerArquivo: arquivo({ cdAtendente: 500, perfilPadrao: 'T', porta: 50000 }),
      });
      expect(c.cdAtendente).toBe(700); // env
      expect(c.perfilPadrao).toBe('U'); // env (normalizado para maiúscula)
      expect(c.porta).toBe(50000); // arquivo
      expect(c.prazoVarreduraSegundos).toBe(90); // padrão
    });

    it('cada chave tem a sua variável (tabela §8.2)', () => {
      const c = carregarConfig({
        env: env({
          SOFTDESK_LOCAL_BASE_URL: 'http://127.0.0.1:9999',
          SOFTDESK_LOCAL_CD_ATENDENTE: '11',
          SOFTDESK_LOCAL_PERFIL_PADRAO: 'T',
          SOFTDESK_LOCAL_ESPERA_LOGIN_S: '5',
          SOFTDESK_LOCAL_PORTA: '48000',
          SOFTDESK_LOCAL_PRAZO_VARREDURA_S: '30',
          SOFTDESK_LOCAL_NOTIFICAR: 'false',
          LOG_LEVEL: 'debug',
        }),
        lerArquivo: () => null,
      });
      expect(c).toMatchObject({
        baseUrl: 'http://127.0.0.1:9999',
        cdAtendente: 11,
        perfilPadrao: 'T',
        esperaLoginSegundos: 5,
        porta: 48000,
        prazoVarreduraSegundos: 30,
        notificarWindows: false,
        nivelLog: 'debug',
      });
      expect(Object.keys(VARIAVEIS_AMBIENTE)).toHaveLength(8);
    });

    it('variável vazia é tratada como ausente', () => {
      const c = carregarConfig({
        env: env({ SOFTDESK_LOCAL_CD_ATENDENTE: '  ' }),
        lerArquivo: arquivo({ cdAtendente: 500 }),
      });
      expect(c.cdAtendente).toBe(500);
    });

    it('valor inválido no ambiente não cai para o arquivo: impede o início', () => {
      const p = problemasDe(() =>
        carregarConfig({
          env: env({ SOFTDESK_LOCAL_CD_ATENDENTE: 'abc' }),
          lerArquivo: arquivo({ cdAtendente: 500 }),
        }),
      );
      expect(p).toHaveLength(1);
      expect(p[0]).toContain('SOFTDESK_LOCAL_CD_ATENDENTE');
    });
  });

  describe('schema estrito', () => {
    it('chave desconhecida no arquivo impede o início e é nomeada', () => {
      const p = problemasDe(() =>
        carregarConfig({ env: env(), lerArquivo: arquivo({ cdAtendente: 393, senha: 'x', porTa: 1 }) }),
      );
      expect(p.join('|')).toContain('senha');
      expect(p.join('|')).toContain('porTa');
      expect(p.every((m) => m.includes('chave desconhecida'))).toBe(true);
    });

    it('JSON inválido impede o início sem repetir trecho do conteúdo', () => {
      const p = problemasDe(() =>
        carregarConfig({ env: env(), lerArquivo: arquivo('{ "cdAtendente": SEGREDO-DO-ARQUIVO') }),
      );
      expect(p).toEqual(['config.json: não é um JSON válido']);
      expect(p.join('')).not.toContain('SEGREDO-DO-ARQUIVO');
    });

    it('raiz do arquivo que não é objeto impede o início', () => {
      expect(problemasDe(() => carregarConfig({ env: env(), lerArquivo: arquivo('[1,2]') })).length).toBeGreaterThan(0);
      expect(problemasDe(() => carregarConfig({ env: env(), lerArquivo: arquivo('null') })).length).toBeGreaterThan(0);
    });

    it('aceita arquivo com BOM (PowerShell grava assim)', () => {
      const c = carregarConfig({ env: env(), lerArquivo: arquivo('\uFEFF{"cdAtendente": 42}') });
      expect(c.cdAtendente).toBe(42);
    });

    it('tipo errado no arquivo (número como texto) é recusado', () => {
      const p = problemasDe(() => carregarConfig({ env: env(), lerArquivo: arquivo({ cdAtendente: '393' }) }));
      expect(p[0]).toContain('cdAtendente');
    });
  });

  describe('faixas de valor (arquivo e ambiente)', () => {
    const casos: Array<{ chave: string; variavel: string; ok: Array<unknown>; ruim: Array<unknown> }> = [
      { chave: 'cdAtendente', variavel: 'SOFTDESK_LOCAL_CD_ATENDENTE', ok: [1, 393], ruim: [0, -5, 1.5] },
      { chave: 'porta', variavel: 'SOFTDESK_LOCAL_PORTA', ok: [1024, 65535], ruim: [1023, 65536, 80] },
      {
        chave: 'esperaLoginSegundos',
        variavel: 'SOFTDESK_LOCAL_ESPERA_LOGIN_S',
        ok: [1, 280],
        ruim: [0, 281, 300],
      },
      {
        chave: 'prazoVarreduraSegundos',
        variavel: 'SOFTDESK_LOCAL_PRAZO_VARREDURA_S',
        ok: [20, 300],
        ruim: [19, 301, 0],
      },
      { chave: 'perfilPadrao', variavel: 'SOFTDESK_LOCAL_PERFIL_PADRAO', ok: ['A', 'U', 'T'], ruim: ['X', 'AA', 1] },
      { chave: 'nivelLog', variavel: 'LOG_LEVEL', ok: ['trace', 'info', 'fatal'], ruim: ['verbose', 'INFO2', 3] },
      { chave: 'notificarWindows', variavel: 'SOFTDESK_LOCAL_NOTIFICAR', ok: [true, false], ruim: ['sim', 1] },
    ];

    for (const caso of casos) {
      it(`${caso.chave}: bordas válidas passam pelo arquivo`, () => {
        for (const v of caso.ok) {
          const c = carregarConfig({ env: env(), lerArquivo: arquivo({ [caso.chave]: v }) });
          expect((c as unknown as Record<string, unknown>)[caso.chave]).toBe(v);
        }
      });

      it(`${caso.chave}: valores fora da faixa são recusados no arquivo, nomeando a chave e não o valor`, () => {
        for (const v of caso.ruim) {
          const p = problemasDe(() => carregarConfig({ env: env(), lerArquivo: arquivo({ [caso.chave]: v }) }));
          expect(p).toHaveLength(1);
          expect(p[0]).toContain(caso.chave);
        }
      });

      it(`${caso.chave}: valores fora da faixa são recusados no ambiente, nomeando a variável`, () => {
        for (const v of caso.ruim) {
          const p = problemasDe(() =>
            carregarConfig({ env: env({ [caso.variavel]: String(v) }), lerArquivo: () => null }),
          );
          expect(p).toHaveLength(1);
          expect(p[0]).toContain(caso.variavel);
        }
      });
    }

    it('número com lixo no ambiente ("12abc", "1e3", "-1") é recusado', () => {
      for (const v of ['12abc', '1e3', '-1', '1.5']) {
        expect(
          problemasDe(() => carregarConfig({ env: env({ SOFTDESK_LOCAL_PORTA: v }), lerArquivo: () => null })),
        ).toHaveLength(1);
      }
    });

    it('vários problemas são reportados juntos', () => {
      const p = problemasDe(() =>
        carregarConfig({
          env: env({ SOFTDESK_LOCAL_PORTA: '1', SOFTDESK_LOCAL_CD_ATENDENTE: '0' }),
          lerArquivo: () => null,
        }),
      );
      expect(p).toHaveLength(2);
    });
  });

  describe('baseUrl', () => {
    it('https é aceito e normalizado para a origem', () => {
      const c = carregarConfig({ env: env({ SOFTDESK_LOCAL_BASE_URL: 'https://helpdesk.clamed.com.br/' }), lerArquivo: () => null });
      expect(c.baseUrl).toBe('https://helpdesk.clamed.com.br');
    });

    it('http só para 127.0.0.1 e localhost', () => {
      expect(carregarConfig({ env: env({ SOFTDESK_LOCAL_BASE_URL: 'http://127.0.0.1:5555' }), lerArquivo: () => null }).baseUrl).toBe('http://127.0.0.1:5555');
      expect(carregarConfig({ env: env({ SOFTDESK_LOCAL_BASE_URL: 'http://localhost:5555' }), lerArquivo: () => null }).baseUrl).toBe('http://localhost:5555');
      for (const ruim of ['http://helpdesk.clamed.com.br', 'http://127.0.0.2:80', 'http://localhost.evil.com']) {
        expect(
          problemasDe(() => carregarConfig({ env: env({ SOFTDESK_LOCAL_BASE_URL: ruim }), lerArquivo: () => null })),
        ).toHaveLength(1);
      }
    });

    it('recusa texto que não é URL, outros esquemas, credencial, caminho e query', () => {
      for (const ruim of [
        'helpdesk.clamed.com.br',
        'ftp://helpdesk.clamed.com.br',
        'https://usuario:senha@helpdesk.clamed.com.br',
        'https://helpdesk.clamed.com.br/api',
        'https://helpdesk.clamed.com.br/?a=1',
      ]) {
        const p = problemasDe(() => carregarConfig({ env: env(), lerArquivo: arquivo({ baseUrl: ruim }) }));
        expect(p.length).toBeGreaterThan(0);
        // mensagem não repete a URL (pode ter credencial)
        expect(p.join('')).not.toContain('usuario:senha');
      }
    });
  });

  describe('diretório (SOFTDESK_LOCAL_DIR)', () => {
    it('SOFTDESK_LOCAL_DIR define o diretório e é onde o config.json é procurado', () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sdl-cfg-'));
      try {
        fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify({ cdAtendente: 808 }));
        const c = carregarConfig({ env: { SOFTDESK_LOCAL_DIR: dir } });
        expect(c.diretorio).toBe(path.resolve(dir));
        expect(c.cdAtendente).toBe(808); // veio do arquivo lido do disco
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    });

    it('sem config.json no disco usa o padrão (arquivo é opcional)', () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sdl-cfg-'));
      try {
        expect(carregarConfig({ env: { SOFTDESK_LOCAL_DIR: dir } }).cdAtendente).toBe(393);
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    });

    it('sem SOFTDESK_LOCAL_DIR usa %LOCALAPPDATA%\\softdesk-local', () => {
      expect(resolverDiretorio({ LOCALAPPDATA: 'C:\\Users\\x\\AppData\\Local' })).toBe(
        path.join('C:\\Users\\x\\AppData\\Local', 'softdesk-local'),
      );
    });

    it('o arquivo é lido no diretório informado', () => {
      let lido = '';
      carregarConfig({
        env: { SOFTDESK_LOCAL_DIR: path.join(os.tmpdir(), 'abc') },
        lerArquivo: (caminho) => {
          lido = caminho;
          return null;
        },
      });
      expect(lido).toBe(path.join(path.resolve(os.tmpdir(), 'abc'), 'config.json'));
    });
  });
});
