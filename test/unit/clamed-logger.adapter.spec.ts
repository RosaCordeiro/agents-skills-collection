import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import type { Config } from '../../src/core/domain/entities/config';
import { ErroSoftdesk } from '../../src/core/domain/errors/erro-softdesk';
import {
  ClamedLoggerAdapter,
  criarLoggerClamed,
  type DestinoLog,
} from '../../src/infraestructure/logger/clamed-logger.adapter';
import {
  contextoAtual,
  correlationIdAtual,
  correlationIdOuNovo,
  executarComContexto,
  novoCorrelationId,
} from '../../src/infraestructure/logger/contexto';

interface Registro {
  nivel: 'info' | 'warn' | 'error';
  msg: string;
  obj: Record<string, unknown>;
}

function espiao(): { destino: DestinoLog; registros: Registro[] } {
  const registros: Registro[] = [];
  const mk = (nivel: Registro['nivel']) => (msg: string, obj?: unknown) =>
    registros.push({ nivel, msg, obj: obj as Record<string, unknown> });
  return { destino: { info: mk('info'), warn: mk('warn'), error: mk('error') }, registros };
}

const sentinela = () => `SENT-${randomBytes(8).toString('hex')}`;

describe('ClamedLoggerAdapter (§8.3, RN-13)', () => {
  it('repassa os campos da lista de permissão e acrescenta cd_atendente', () => {
    const { destino, registros } = espiao();
    new ClamedLoggerAdapter(destino, 393).info('varredura', {
      event: { name: 'fila', action: 'scan', outcome: 'success' },
      keywords: ['softdesk_rede'],
      paginas_lidas: 3,
      abertos: 120,
      total_softdesk: 3100,
      incompleto: false,
      duracao_ms: 1500,
      filtros_usados: ['solicitante_nome', 'titulo_contem'],
    });
    expect(registros).toHaveLength(1);
    expect(registros[0].nivel).toBe('info');
    expect(registros[0].obj).toEqual({
      event: { name: 'fila', action: 'scan', outcome: 'success' },
      keywords: ['softdesk_rede'],
      paginas_lidas: 3,
      abertos: 120,
      total_softdesk: 3100,
      incompleto: false,
      duracao_ms: 1500,
      filtros_usados: ['solicitante_nome', 'titulo_contem'],
      cd_atendente: 393,
    });
  });

  it('descarta campo fora da lista de permissão, mesmo com valor inocente', () => {
    const { destino, registros } = espiao();
    const titulo = sentinela();
    const usuario = sentinela();
    const cookie = sentinela();
    new ClamedLoggerAdapter(destino, 393).info('x', {
      event: { name: 'chamado', action: 'get' },
      cd_chamado: 2482772,
      titulo,
      tt_chamado: titulo,
      usuario,
      nm_usuario: usuario,
      cookie,
      senha: sentinela(),
      token: sentinela(),
      solicitante_nome: 'rosangela',
      palavra_chave: 'fulano',
      campo_novo_qualquer: 'qualquer coisa',
    });
    const obj = registros[0].obj;
    expect(obj.cd_chamado).toBe(2482772);
    const serializado = JSON.stringify(obj);
    for (const proibido of [titulo, usuario, cookie, 'rosangela', 'fulano', 'qualquer coisa']) {
      expect(serializado).not.toContain(proibido);
    }
    expect(Object.keys(obj).sort()).toEqual(['cd_atendente', 'cd_chamado', 'event']);
  });

  it('nunca registra message de exceção, stack, err ou error (nada de exceção vai ao arquivo)', () => {
    const { destino, registros } = espiao();
    const corpo = sentinela();
    // simula o que o JSON.parse faz: a message traz o começo do corpo
    const excecao = new SyntaxError(`Unexpected token < in JSON at position 0: ${corpo}`);
    const erro = new ErroSoftdesk('CONTRATO_ROTA_MUDOU', { mensagem: `texto livre ${corpo}` });
    new ClamedLoggerAdapter(destino, 393).error('contrato', {
      event: { name: 'softdesk_http', action: 'request', outcome: 'failure' },
      codigo_erro: erro.codigo,
      message: excecao.message,
      stack: excecao.stack,
      err: excecao,
      error: erro,
      erro,
      exception: excecao,
    });
    const serializado = JSON.stringify(registros[0].obj);
    expect(serializado).not.toContain(corpo);
    expect(serializado).not.toContain('Unexpected token');
    expect(serializado).not.toContain('stack');
    expect(registros[0].obj.codigo_erro).toBe('CONTRATO_ROTA_MUDOU');
    expect(Object.keys(registros[0].obj).sort()).toEqual(['cd_atendente', 'codigo_erro', 'event']);
  });

  it('um valor permitido que seja objeto ou função é descartado (só escalares)', () => {
    const { destino, registros } = espiao();
    const corpo = sentinela();
    new ClamedLoggerAdapter(destino, 393).warn('x', {
      event: { name: 'sessao', action: 'status' },
      motivo: { corpo },
      perfil: new Error(corpo),
      codigo_erro: () => corpo,
      total: [1, 2],
    });
    expect(JSON.stringify(registros[0].obj)).not.toContain(corpo);
    expect(Object.keys(registros[0].obj).sort()).toEqual(['cd_atendente', 'event']);
  });

  it('filtros_usados só aceita nomes de campo, não valores', () => {
    const { destino, registros } = espiao();
    new ClamedLoggerAdapter(destino, 393).info('x', {
      event: { name: 'pesquisa', action: 'search' },
      filtros_usados: ['solicitante_nome', 'Rosângela Alves', 'titulo contem', 123, 'palavra_chave'],
    });
    expect(registros[0].obj.filtros_usados).toEqual(['solicitante_nome', 'palavra_chave']);
  });

  it('evidencia só mantém http_status, content_type e location_path, sem query string', () => {
    const { destino, registros } = espiao();
    const corpo = sentinela();
    new ClamedLoggerAdapter(destino, 393).error('x', {
      event: { name: 'softdesk_http', action: 'request', outcome: 'failure' },
      evidencia: {
        http_status: 302,
        content_type: 'text/html; charset=utf-8',
        location_path: '/login?next=/chamado&t=segredo',
        corpo,
        headers: { cookie: corpo },
        body: corpo,
      },
    });
    expect(registros[0].obj.evidencia).toEqual({
      http_status: 302,
      content_type: 'text/html; charset=utf-8',
      location_path: '/login',
    });
    expect(JSON.stringify(registros[0].obj)).not.toContain(corpo);
    expect(JSON.stringify(registros[0].obj)).not.toContain('segredo');
  });

  it('texto de campo permitido perde query string e é limitado em tamanho', () => {
    const { destino, registros } = espiao();
    new ClamedLoggerAdapter(destino, 393).info('x', {
      event: { name: 'softdesk_http', action: 'request' },
      rota: '/chamado/json?pesq_ds_chamado=fulano',
      motivo: 'a'.repeat(1000),
    });
    expect(registros[0].obj.rota).toBe('/chamado/json');
    expect((registros[0].obj.motivo as string).length).toBeLessThanOrEqual(200);
  });

  it('event só aceita nome/ação em formato seguro e outcome conhecido', () => {
    const { destino, registros } = espiao();
    new ClamedLoggerAdapter(destino, 393).info('x', {
      event: { name: 'Fulano de Tal', action: 'scan', outcome: 'talvez' as never },
    });
    expect(registros[0].obj.event).toEqual({ action: 'scan' });
  });

  it('o chamador não consegue sobrescrever cd_atendente, correlation_id nem origem', () => {
    const { destino, registros } = espiao();
    executarComContexto({ correlationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', origem: 'rest' }, () => {
      new ClamedLoggerAdapter(destino, 393).info('x', {
        event: { name: 'servico', action: 'start' },
        cd_atendente: 1,
        correlation_id: 'forjado',
        origem: 'mcp',
      });
    });
    expect(registros[0].obj.cd_atendente).toBe(393);
    expect(registros[0].obj.correlation_id).toBe('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
    expect(registros[0].obj.origem).toBe('rest');
  });

  it('se o destino falhar, a operação não é afetada', () => {
    const quebrado: DestinoLog = {
      info: () => {
        throw new Error('disco cheio');
      },
      warn: () => undefined,
      error: () => undefined,
    };
    expect(() =>
      new ClamedLoggerAdapter(quebrado, 393).info('x', { event: { name: 'servico', action: 'start' } }),
    ).not.toThrow();
  });
});

describe('correlation_id (AsyncLocalStorage)', () => {
  it('sem contexto não há correlation_id nem origem no log', () => {
    const { destino, registros } = espiao();
    new ClamedLoggerAdapter(destino, 393).info('x', { event: { name: 'servico', action: 'start' } });
    expect(registros[0].obj).not.toHaveProperty('correlation_id');
    expect(registros[0].obj).not.toHaveProperty('origem');
  });

  it('o correlation_id do contexto vai em todos os logs da operação, também depois de await', async () => {
    const { destino, registros } = espiao();
    const log = new ClamedLoggerAdapter(destino, 393);
    const id = novoCorrelationId();
    await executarComContexto({ correlationId: id, origem: 'mcp' }, async () => {
      log.info('inicio', { event: { name: 'fila', action: 'scan', outcome: 'started' } });
      await new Promise((r) => setTimeout(r, 5));
      await Promise.resolve();
      log.info('fim', { event: { name: 'fila', action: 'scan', outcome: 'success' } });
    });
    expect(registros.map((r) => r.obj.correlation_id)).toEqual([id, id]);
    expect(registros.map((r) => r.obj.origem)).toEqual(['mcp', 'mcp']);
    expect(correlationIdAtual()).toBeUndefined(); // não vaza para fora
  });

  it('operações concorrentes não misturam os correlation_id', async () => {
    const { destino, registros } = espiao();
    const log = new ClamedLoggerAdapter(destino, 393);
    const a = novoCorrelationId();
    const b = novoCorrelationId();
    const op = (id: string, ms: number, marca: string) =>
      executarComContexto({ correlationId: id }, async () => {
        await new Promise((r) => setTimeout(r, ms));
        log.info(marca, { event: { name: 'pesquisa', action: 'search' } });
      });
    await Promise.all([op(a, 20, 'a'), op(b, 5, 'b')]);
    const porMsg = Object.fromEntries(registros.map((r) => [r.msg, r.obj.correlation_id]));
    expect(porMsg).toEqual({ a, b });
    expect(a).not.toBe(b);
  });

  it('contextoAtual expõe o contexto e correlationIdOuNovo só aceita UUID', () => {
    const id = novoCorrelationId();
    executarComContexto({ correlationId: id }, () => {
      expect(contextoAtual()).toEqual({ correlationId: id });
    });
    expect(correlationIdOuNovo(id.toUpperCase())).toBe(id);
    const gerado = correlationIdOuNovo('nao-e-uuid');
    expect(gerado).toMatch(/^[0-9a-f-]{36}$/);
    expect(gerado).not.toBe('nao-e-uuid');
    expect(correlationIdOuNovo(undefined)).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe('criarLoggerClamed (@clamed/logger 1.0.7 real)', () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sdl-log-'));
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  function configTeste(): Config {
    return {
      baseUrl: 'http://127.0.0.1:1',
      cdAtendente: 393,
      perfilPadrao: 'A',
      esperaLoginSegundos: 120,
      porta: 47821,
      prazoVarreduraSegundos: 90,
      notificarWindows: false,
      nivelLog: 'info',
      diretorio: dir,
    };
  }

  async function lerLog(): Promise<string> {
    const arquivo = path.join(dir, 'logs', 'servico.log');
    for (let i = 0; i < 60; i++) {
      if (fs.existsSync(arquivo)) {
        const t = fs.readFileSync(arquivo, 'utf8');
        if (t.trim().split('\n').length >= 2) return t;
      }
      await new Promise((r) => setTimeout(r, 50));
    }
    return fs.existsSync(arquivo) ? fs.readFileSync(arquivo, 'utf8') : '';
  }

  it('grava servico.log em <diretório>/logs com os campos permitidos e sem dado proibido', async () => {
    const logger = criarLoggerClamed(configTeste());
    const id = novoCorrelationId();
    const proibido = sentinela();
    await executarComContexto({ correlationId: id, origem: 'rest' }, async () => {
      logger.info('inicio', { event: { name: 'chamado', action: 'get', outcome: 'started' }, cd_chamado: 77 });
      logger.error('fim', {
        event: { name: 'chamado', action: 'get', outcome: 'failure' },
        codigo_erro: 'NAO_ENCONTRADO',
        message: proibido,
        titulo: proibido,
        err: new Error(proibido),
      });
    });
    const texto = await lerLog();
    expect(texto).not.toBe('');
    expect(texto).not.toContain(proibido);
    const linhas = texto.trim().split('\n').map((l) => JSON.parse(l) as Record<string, unknown>);
    expect(linhas).toHaveLength(2);
    for (const l of linhas) {
      expect(l.correlation_id).toBe(id);
      expect(l.origem).toBe('rest');
      expect(l.cd_atendente).toBe(393);
      expect(l.service_type).toBe('softdesk-local');
      expect(l.environment).toBe('local');
    }
    expect((linhas[0].event as Record<string, string>).outcome).toBe('started');
    expect((linhas[1].event as Record<string, string>).outcome).toBe('failure');
    expect(linhas[1].codigo_erro).toBe('NAO_ENCONTRADO');
  });
});
