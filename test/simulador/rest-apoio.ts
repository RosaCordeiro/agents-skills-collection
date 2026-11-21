import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { lerDescoberta } from '../../src/infraestructure/descoberta/arquivo-descoberta';
import type { OpcoesContainer, Substitutos } from '../../src/shared/container';
import { iniciarServico, type ServicoEmExecucao } from '../../src/servico';
import { criarLoggerEspiao, sentinela, type LoggerEspiao } from './apoio';
import { AbridorEspiao, AgendadorManual, RelogioTeste, postarLogin } from './sessao-apoio';
import { NotificadorEspiao } from './consulta-apoio';
import type { SoftdeskSimulado } from './softdesk-simulado';

/** Ajudantes dos testes de REST e do serviço (fragmento 5). */

export async function portaLivre(): Promise<number> {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.once('error', reject);
    s.listen(0, '127.0.0.1', () => {
      const porta = (s.address() as net.AddressInfo).port;
      s.close(() => resolve(porta));
    });
  });
}

export function pastaTemporaria(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'softdesk-local-teste-'));
}

export function removerPasta(dir: string): void {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    // ignora
  }
}

/** `true` se nada escuta mais na porta (porta liberada). */
export function portaFechada(porta: number): Promise<boolean> {
  return new Promise((resolve) => {
    const s = net.connect({ host: '127.0.0.1', port: porta });
    s.once('connect', () => {
      s.destroy();
      resolve(false);
    });
    s.once('error', () => resolve(true));
  });
}

export interface RespostaRest {
  status: number;
  headers: Headers;
  texto: string;
  json: any;
}

export interface Servico {
  svc: ServicoEmExecucao;
  dir: string;
  porta: number;
  token: string;
  base: string;
  logger: LoggerEspiao;
  relogio: RelogioTeste;
  abridor: AbridorEspiao;
  agendador: AgendadorManual;
  notificador: NotificadorEspiao;
  /** Tudo o que o REST respondeu (corpo e cabeçalhos), para a busca de vazamento. */
  respostas: string[];
  /** Chama o REST com o token certo (ou outro, ou nenhum, com `token: null`). */
  chamar(caminho: string, opcoes?: ChamadaRest): Promise<RespostaRest>;
  /** Faz o login pelo REST: `POST /v1/sessao/entrar` + formulário da janela. */
  entrarPeloRest(opcoes?: { senha?: string; usuario?: string }): Promise<RespostaRest>;
  encerrar(): Promise<void>;
}

export interface ChamadaRest {
  metodo?: string;
  corpo?: unknown;
  corpoBruto?: string;
  headers?: Record<string, string>;
  /** `null` não envia `Authorization`; `undefined` usa o token do serviço. */
  token?: string | null;
  sinal?: AbortSignal;
}

export interface OpcoesSubirServico {
  env?: Record<string, string>;
  opcoesContainer?: OpcoesContainer;
  substitutos?: Substitutos;
}

/** Sobe o serviço no próprio processo (container real, REST real) contra o simulador. */
export async function subirServico(
  sim: Pick<SoftdeskSimulado, 'url'>,
  opcoes: OpcoesSubirServico = {},
): Promise<Servico> {
  const dir = pastaTemporaria();
  const porta = await portaLivre();
  const logger = criarLoggerEspiao();
  const relogio = new RelogioTeste();
  const abridor = new AbridorEspiao();
  const agendador = new AgendadorManual();
  const notificador = new NotificadorEspiao();
  const svc = await iniciarServico({
    env: {
      SOFTDESK_LOCAL_DIR: dir,
      SOFTDESK_LOCAL_BASE_URL: sim.url,
      SOFTDESK_LOCAL_PORTA: String(porta),
      SOFTDESK_LOCAL_NOTIFICAR: 'false',
      ...(opcoes.env ?? {}),
    },
    // Os testes não mexem na ACL do diretório temporário.
    restringirAcl: false,
    substitutos: { logger, relogio, abridorNavegador: abridor, notificador, ...(opcoes.substitutos ?? {}) },
    opcoesContainer: { timeoutSoftdeskMs: 5000, agendarJanela: agendador.agendar, saudeAutomatica: false, ...opcoes.opcoesContainer },
  });
  const desc = lerDescoberta(dir);
  if (!desc) throw new Error('arquivo de descoberta não foi gravado');
  const base = `http://127.0.0.1:${desc.porta}`;
  const respostas: string[] = [];

  const chamar = async (caminho: string, o: ChamadaRest = {}): Promise<RespostaRest> => {
    const headers: Record<string, string> = { ...(o.headers ?? {}) };
    const token = o.token === undefined ? desc.token : o.token;
    if (token !== null) headers.Authorization = `Bearer ${token}`;
    let body: string | undefined = o.corpoBruto;
    if (body === undefined && o.corpo !== undefined) body = JSON.stringify(o.corpo);
    if (body !== undefined) headers['Content-Type'] ??= 'application/json';
    const r = await fetch(`${base}${caminho}`, { method: o.metodo ?? 'GET', headers, body, signal: o.sinal });
    const texto = await r.text();
    respostas.push(texto, JSON.stringify([...r.headers.entries()]));
    let json: unknown;
    try {
      json = JSON.parse(texto);
    } catch {
      json = undefined;
    }
    return { status: r.status, headers: r.headers, texto, json };
  };

  const entrarPeloRest = async (o: { senha?: string; usuario?: string } = {}): Promise<RespostaRest> => {
    const pedido = chamar('/v1/sessao/entrar', { metodo: 'POST' });
    // O endereço vem do próprio container (como o navegador o receberia), sem passar pelo REST.
    let url: string | null = null;
    for (let i = 0; i < 300 && !url; i++) {
      url = svc.container.janelaLogin.enderecoManual();
      if (!url) await new Promise((r) => setTimeout(r, 10));
    }
    if (!url) throw new Error('a janela de login não abriu');
    await postarLogin(url, { u: o.usuario ?? sentinela('USU'), s: o.senha ?? sentinela('SENHA') });
    return pedido;
  };

  const encerrar = async (): Promise<void> => {
    await svc.parar();
    removerPasta(dir);
  };

  return {
    svc,
    dir,
    porta: desc.porta,
    token: desc.token,
    base,
    logger,
    relogio,
    abridor,
    agendador,
    notificador,
    respostas,
    chamar,
    entrarPeloRest,
    encerrar,
  };
}

export const novoUuid = (): string => randomUUID();
