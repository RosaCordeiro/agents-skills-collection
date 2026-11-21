import fs from 'node:fs';
import path from 'node:path';
import {
  apagarDescoberta,
  argumentosIcacls,
  contaAtual,
  caminhoDescoberta,
  gravarDescoberta,
  lerDescoberta,
  type Descoberta,
} from '../../src/infraestructure/descoberta/arquivo-descoberta';
import { criarLoggerEspiao } from '../simulador/apoio';
import { pastaTemporaria, removerPasta } from '../simulador/rest-apoio';

const dados: Descoberta = {
  porta: 47821,
  token: 'a'.repeat(64),
  pid: 4242,
  iniciado_em: '2026-11-19T12:00:00.000Z',
  versao: '0.1.0',
};

describe('arquivo de descoberta (ARCH §7.2)', () => {
  let dir: string;
  beforeEach(() => {
    dir = path.join(pastaTemporaria(), 'sub', 'servico');
  });
  afterEach(() => removerPasta(path.dirname(path.dirname(dir))));

  it('grava servico.json com os cinco campos e lê de volta', async () => {
    await gravarDescoberta(dir, dados, { restringirAcl: false });
    expect(JSON.parse(fs.readFileSync(path.join(dir, 'servico.json'), 'utf8'))).toEqual(dados);
    expect(lerDescoberta(dir)).toEqual(dados);
  });

  it('restringe a ACL da PASTA ANTES de gravar o arquivo (sem janela de exposição)', async () => {
    const chamadas: Array<{ args: string[]; arquivoExistia: boolean }> = [];
    await gravarDescoberta(dir, dados, {
      restringirAcl: true,
      conta: 'DOM\\fulano',
      executarIcacls: async (args) => {
        chamadas.push({ args, arquivoExistia: fs.existsSync(caminhoDescoberta(dir)) });
      },
    });
    expect(chamadas).toHaveLength(1);
    expect(chamadas[0].arquivoExistia).toBe(false);
    expect(chamadas[0].args).toEqual([dir, '/inheritance:r', '/grant:r', 'DOM\\fulano:(OI)(CI)F']);
    expect(fs.existsSync(caminhoDescoberta(dir))).toBe(true);
  });

  it('contaAtual: com domínio vira DOMINIO-barra-usuario (sem texto literal de template); sem domínio, só o usuário', () => {
    expect(contaAtual({ USERDOMAIN: 'CLAMED', USERNAME: 'fulano' })).toBe('CLAMED\\fulano');
    expect(contaAtual({ USERNAME: 'fulano' })).toBe('fulano');
    expect(contaAtual({ USERDOMAIN: 'CLAMED', USERNAME: 'fulano' })).not.toContain('${');
  });

  (process.platform === 'win32' ? it : it.skip)(
    'icacls REAL numa pasta temporária termina com sucesso com a conta de contaAtual() e o arquivo é gravado',
    async () => {
      const logger = criarLoggerEspiao();
      const r = await gravarDescoberta(dir, dados, { logger, restringirAcl: true });
      expect(r.aclAplicada).toBe(true);
      expect(logger.registros.some((x) => x.nivel === 'warn')).toBe(false);
      expect(lerDescoberta(dir)).toEqual(dados);
    },
  );

  it('grava de forma atômica: nenhum .tmp sobra e um leitor nunca vê arquivo truncado (rename)', async () => {
    await gravarDescoberta(dir, dados, { restringirAcl: false });
    expect(fs.readdirSync(dir)).toEqual(['servico.json']);
    const renomear = jest.spyOn(fs, 'renameSync');
    await gravarDescoberta(dir, { ...dados, porta: 1234 }, { restringirAcl: false });
    expect(renomear).toHaveBeenCalledTimes(1);
    renomear.mockRestore();
    expect(lerDescoberta(dir)?.porta).toBe(1234);
  });

  it('argumentos do icacls: pasta, sem herança e acesso total só ao usuário', () => {
    expect(argumentosIcacls('C:\\x', 'U')).toEqual(['C:\\x', '/inheritance:r', '/grant:r', 'U:(OI)(CI)F']);
  });

  it('falha do icacls só gera warn: o arquivo é gravado mesmo assim e o token não vai ao log', async () => {
    const logger = criarLoggerEspiao();
    const r = await gravarDescoberta(dir, dados, {
      logger,
      restringirAcl: true,
      executarIcacls: async () => {
        throw new Error(`falhou ${dados.token}`);
      },
    });
    expect(r.aclAplicada).toBe(false);
    expect(lerDescoberta(dir)).toEqual(dados);
    expect(logger.registros.some((x) => x.nivel === 'warn')).toBe(true);
    expect(logger.texto()).not.toContain(dados.token);
    expect(logger.texto()).not.toContain('falhou');
  });

  it('apagar remove o arquivo; apagar de novo não falha; ler ausente devolve null', async () => {
    await gravarDescoberta(dir, dados, { restringirAcl: false });
    apagarDescoberta(dir);
    expect(fs.existsSync(caminhoDescoberta(dir))).toBe(false);
    expect(() => apagarDescoberta(dir)).not.toThrow();
    expect(lerDescoberta(dir)).toBeNull();
  });

  it.each([
    ['JSON inválido', '{nao-json'],
    ['sem token', JSON.stringify({ ...dados, token: undefined })],
    ['porta em texto', JSON.stringify({ ...dados, porta: '47821' })],
    ['token vazio', JSON.stringify({ ...dados, token: '' })],
    ['não é objeto', '[]'],
  ])('arquivo fora do formato (%s) → null', (_n, conteudo) => {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(caminhoDescoberta(dir), conteudo);
    expect(lerDescoberta(dir)).toBeNull();
  });

  it('aceita arquivo com BOM', () => {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(caminhoDescoberta(dir), `\uFEFF${JSON.stringify(dados)}`);
    expect(lerDescoberta(dir)).toEqual(dados);
  });
});
