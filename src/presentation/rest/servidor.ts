import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { ErroSoftdesk, ehErroSoftdesk } from '../../core/domain/errors/erro-softdesk';
import { correlationIdOuNovo, executarComContexto } from '../../infraestructure/logger/contexto';
import type { Container } from '../../shared/container';
import { autenticar, type MotivoRecusa } from './autenticacao';
import * as chamados from './controllers/chamados.controller';
import * as fila from './controllers/fila.controller';
import * as saude from './controllers/saude.controller';
import * as servico from './controllers/servico.controller';
import * as sessao from './controllers/sessao.controller';
import {
  enviarEnvelope,
  montarEnvelopeErro,
  montarEnvelopeSucesso,
  statusHttpDoErro,
} from './envelope';
import { Roteador, type InfoServico, type RespostaRota } from './roteador';

/**
 * Servidor REST local (ARCH-001 §7.1, §7.2, RNF-02): `node:http` em `127.0.0.1`, porta fixa
 * configurável. Controllers finos sobre os mesmos casos de uso do MCP; o envelope é o mesmo.
 */

export const LIMITE_CORPO_REST_BYTES = 16 * 1024;
export const MENSAGEM_PORTA_OCUPADA = 'já existe um serviço rodando ou a porta está em uso';
const HOST = '127.0.0.1';

export class ErroPortaOcupada extends Error {
  constructor() {
    super(MENSAGEM_PORTA_OCUPADA);
    this.name = 'ErroPortaOcupada';
    Object.setPrototypeOf(this, ErroPortaOcupada.prototype);
  }
}

export const ROTAS = [
  { metodo: 'POST', caminho: '/v1/sessao/entrar', tratar: sessao.entrar },
  { metodo: 'GET', caminho: '/v1/sessao', tratar: sessao.estado },
  { metodo: 'GET', caminho: '/v1/sessao/janela', tratar: sessao.janela },
  { metodo: 'GET', caminho: '/v1/fila', tratar: fila.minhaFila },
  { metodo: 'POST', caminho: '/v1/chamados/pesquisa', tratar: chamados.pesquisar },
  { metodo: 'GET', caminho: '/v1/chamados/{codigo}', tratar: chamados.obter },
  { metodo: 'GET', caminho: '/v1/chamados/{codigo}/atividades', tratar: chamados.atividades },
  { metodo: 'GET', caminho: '/v1/saude', tratar: saude.saude },
  { metodo: 'GET', caminho: '/v1/servico', tratar: servico.info },
  { metodo: 'POST', caminho: '/v1/servico/parar', tratar: servico.parar },
] as const;

export interface OpcoesServidorRest {
  container: Container;
  token: string;
  /** Porta de escuta; `0` escolhe uma livre (testes). Padrão: `container.config.porta`. */
  porta?: number;
  info: InfoServico;
}

type ErroCorpo = { erro: ErroSoftdesk; status: number };

const erroCorpo = (status: number, mensagem: string): ErroCorpo => ({
  erro: new ErroSoftdesk('FILTRO_INVALIDO', { mensagem }),
  status,
});

export class ServidorRest {
  private readonly server: http.Server;
  private readonly roteador = new Roteador(ROTAS.map((r) => ({ ...r, tratar: r.tratar })));
  private portaReal = 0;

  constructor(private readonly op: OpcoesServidorRest) {
    this.server = http.createServer((req, res) => {
      this.tratar(req, res).catch(() => {
        // Última barreira: resposta fixa, sem detalhe.
        if (!res.headersSent) {
          res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8', Connection: 'close' }).end('Erro interno.');
        } else {
          res.end();
        }
      });
    });
    this.server.on('clientError', (_e, socket) => socket.destroy());
  }

  get porta(): number {
    return this.portaReal;
  }

  get http(): http.Server {
    return this.server;
  }

  /** Escuta só em `127.0.0.1`. Porta ocupada vira `ErroPortaOcupada` (instância única, §7.2). */
  iniciar(): Promise<void> {
    const alvo = this.op.porta ?? this.op.container.config.porta;
    return new Promise<void>((resolve, reject) => {
      const aoErro = (e: NodeJS.ErrnoException): void => {
        reject(e.code === 'EADDRINUSE' || e.code === 'EACCES' ? new ErroPortaOcupada() : e);
      };
      this.server.once('error', aoErro);
      this.server.listen({ port: alvo, host: HOST, exclusive: true }, () => {
        this.server.off('error', aoErro);
        this.portaReal = (this.server.address() as AddressInfo).port;
        resolve();
      });
    });
  }

  /** Fecha a escuta e as conexões abertas; a porta fica livre quando a promessa resolve. */
  parar(): Promise<void> {
    return new Promise<void>((resolve) => {
      if (!this.server.listening) return resolve();
      this.server.close(() => resolve());
      this.server.closeIdleConnections();
      const t = setTimeout(() => this.server.closeAllConnections(), 2000);
      t.unref();
    });
  }

  // --- requisição ----------------------------------------------------------------------

  private async tratar(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const cabecalhoCid = req.headers['x-correlation-id'];
    const correlationId = correlationIdOuNovo(typeof cabecalhoCid === 'string' ? cabecalhoCid : undefined);
    return executarComContexto({ correlationId, origem: 'rest' }, () => this.processar(req, res, correlationId));
  }

  private async processar(req: http.IncomingMessage, res: http.ServerResponse, cid: string): Promise<void> {
    const { container } = this.op;

    // 1. Autenticação (Host, Origin, token), antes de qualquer outra coisa.
    const auth = autenticar(req, { porta: this.portaReal, token: this.op.token });
    if (!auth.ok) {
      this.registrarRecusa(auth.motivo);
      enviarEnvelope(res, auth.status, montarEnvelopeErro(new ErroSoftdesk('NAO_AUTORIZADO'), cid));
      req.resume();
      return;
    }

    // 2. Cancelamento: a conexão fechou antes de a resposta terminar.
    const controle = new AbortController();
    res.once('close', () => {
      if (!res.writableFinished) controle.abort();
    });

    try {
      const url = new URL(req.url ?? '/', `http://${HOST}:${this.portaReal}`);
      const metodo = req.method ?? 'GET';
      const resolucao = this.roteador.resolver(metodo, url.pathname);
      if (resolucao.tipo === 'nao_encontrada') {
        return enviarEnvelope(
          res,
          404,
          montarEnvelopeErro(new ErroSoftdesk('NAO_ENCONTRADO', { mensagem: 'Rota não encontrada.', acao: 'Confira o endereço da rota.' }), cid),
        );
      }
      if (resolucao.tipo === 'metodo_nao_permitido') {
        return enviarEnvelope(
          res,
          405,
          montarEnvelopeErro(new ErroSoftdesk('NAO_ENCONTRADO', { mensagem: 'Método não permitido nesta rota.', acao: 'Confira o método da rota.' }), cid),
        );
      }

      const lido = await this.lerCorpo(req);
      if ('erro' in lido) return enviarEnvelope(res, lido.status, montarEnvelopeErro(lido.erro, cid));

      const resposta: RespostaRota = await resolucao.rota.tratar({
        container,
        servico: this.op.info,
        params: resolucao.params,
        query: url.searchParams,
        corpo: lido.corpo,
        sinal: controle.signal,
      });
      if (resposta.depois) res.once('finish', resposta.depois);
      enviarEnvelope(
        res,
        resposta.status ?? 200,
        montarEnvelopeSucesso(resposta.dados, cid, resposta.aviso_deriva),
      );
    } catch (e) {
      const erro = ehErroSoftdesk(e) ? e : new ErroSoftdesk('ERRO_INTERNO');
      enviarEnvelope(res, statusHttpDoErro(erro), montarEnvelopeErro(erro, cid));
    }
  }

  private registrarRecusa(motivo: MotivoRecusa): void {
    try {
      this.op.container.logger.warn('Requisição ao serviço recusada', {
        event: { name: 'rest', action: 'auth', outcome: 'failure' },
        keywords: ['rest_nao_autorizado'],
        motivo,
      });
    } catch {
      // log nunca derruba a resposta
    }
  }

  /** Corpo JSON de até 16 KB; sem corpo → `corpo: undefined`. Nada do conteúdo vai para log ou erro. */
  private lerCorpo(req: http.IncomingMessage): Promise<{ corpo: unknown } | ErroCorpo> {
    return new Promise((resolve) => {
      const declarado = Number(req.headers['content-length']);
      if (Number.isFinite(declarado) && declarado > LIMITE_CORPO_REST_BYTES) {
        req.resume();
        return resolve(erroCorpo(413, 'O corpo da requisição passa de 16 KB.'));
      }
      const partes: Buffer[] = [];
      let total = 0;
      let encerrado = false;
      req.on('data', (c: Buffer) => {
        if (encerrado) return;
        total += c.length;
        if (total > LIMITE_CORPO_REST_BYTES) {
          encerrado = true;
          partes.length = 0;
          resolve(erroCorpo(413, 'O corpo da requisição passa de 16 KB.'));
          return;
        }
        partes.push(c);
      });
      req.on('end', () => {
        if (encerrado) return;
        const texto = Buffer.concat(partes).toString('utf8').trim();
        if (texto === '') return resolve({ corpo: undefined });
        try {
          resolve({ corpo: JSON.parse(texto) as unknown });
        } catch {
          // A mensagem do JSON.parse traz trecho do corpo: não é repassada.
          resolve(erroCorpo(400, 'O corpo da requisição não é um JSON válido.'));
        }
      });
      req.on('error', () => {
        if (!encerrado) {
          encerrado = true;
          resolve(erroCorpo(400, 'Não foi possível ler o corpo da requisição.'));
        }
      });
    });
  }
}

export function criarServidorRest(op: OpcoesServidorRest): ServidorRest {
  return new ServidorRest(op);
}
