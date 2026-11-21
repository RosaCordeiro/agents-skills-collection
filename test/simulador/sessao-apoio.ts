import http from 'node:http';
import type { Config } from '../../src/core/domain/entities/config';
import type { IAbridorNavegador } from '../../src/core/domain/ports/abridor-navegador';
import type { IRelogio } from '../../src/core/domain/ports/relogio';
import type { Agendar } from '../../src/infraestructure/login/janela-login.server';
import { montarContainer, type Container, type OpcoesContainer, type Substitutos } from '../../src/shared/container';
import { criarLoggerEspiao, type LoggerEspiao } from './apoio';
import type { SoftdeskSimulado } from './softdesk-simulado';

/** Ajudantes dos testes de sessão e da janela de login (fragmento 3). */

export const configTeste = (baseUrl: string): Config => ({
  baseUrl,
  cdAtendente: 393,
  perfilPadrao: 'A',
  esperaLoginSegundos: 120,
  porta: 47821,
  prazoVarreduraSegundos: 90,
  notificarWindows: false,
  nivelLog: 'info',
  diretorio: 'nao-usado',
});

/** Relógio controlável. */
export class RelogioTeste implements IRelogio {
  constructor(private ms = Date.parse('2026-11-19T12:00:00Z')) {}
  agora(): Date {
    return new Date(this.ms);
  }
  avancar(ms: number): void {
    this.ms += ms;
  }
}

/** "Navegador" de teste: captura o endereço e não abre nada. */
export class AbridorEspiao implements IAbridorNavegador {
  readonly urls: string[] = [];
  constructor(private readonly resultado = true) {}
  async abrir(url: string): Promise<boolean> {
    this.urls.push(url);
    return this.resultado;
  }
}

/** Agendador manual: o teste decide quando o prazo da janela "passa". */
export class AgendadorManual {
  private readonly pendentes = new Map<number, () => void>();
  private proximo = 1;
  /** Prazos (ms) pedidos ao agendador, na ordem. */
  readonly prazos: number[] = [];
  readonly agendar: Agendar = (fn, ms) => {
    this.prazos.push(ms);
    const id = this.proximo++;
    this.pendentes.set(id, fn);
    return () => {
      this.pendentes.delete(id);
    };
  };
  get quantidade(): number {
    return this.pendentes.size;
  }
  disparar(): void {
    const fns = [...this.pendentes.values()];
    this.pendentes.clear();
    for (const f of fns) f();
  }
}

export interface Ambiente {
  c: Container;
  logger: LoggerEspiao;
  relogio: RelogioTeste;
  abridor: AbridorEspiao;
  agendador: AgendadorManual;
}

export function montarAmbiente(
  sim: Pick<SoftdeskSimulado, 'url'>,
  opcoes: OpcoesContainer = {},
  substitutos: Substitutos = {},
): Ambiente {
  const logger = criarLoggerEspiao();
  const relogio = new RelogioTeste();
  const abridor = new AbridorEspiao();
  const agendador = new AgendadorManual();
  const c = montarContainer(
    configTeste(sim.url),
    { logger, relogio, abridorNavegador: abridor, ...substitutos },
    { timeoutSoftdeskMs: 5000, agendarJanela: agendador.agendar, saudeAutomatica: false, ...opcoes },
  );
  return { c, logger, relogio, abridor, agendador };
}

export interface RespostaHttp {
  status: number;
  headers: http.IncomingHttpHeaders;
  corpo: string;
}

/** Requisição crua (permite escolher `Host`, o que o `fetch` não deixa). */
export function requisitar(
  endereco: string,
  opcoes: { metodo?: string; host?: string; corpo?: string; headers?: Record<string, string>; caminho?: string } = {},
): Promise<RespostaHttp> {
  const u = new URL(endereco);
  const headers: Record<string, string> = { Host: opcoes.host ?? u.host, ...(opcoes.headers ?? {}) };
  if (opcoes.corpo !== undefined) {
    headers['Content-Type'] ??= 'application/x-www-form-urlencoded';
    if (!headers['Transfer-Encoding']) headers['Content-Length'] ??= String(Buffer.byteLength(opcoes.corpo));
  }
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: u.hostname, port: u.port, path: opcoes.caminho ?? `${u.pathname}${u.search}`, method: opcoes.metodo ?? 'GET', headers, agent: false },
      (res) => {
        const partes: Buffer[] = [];
        res.on('data', (c: Buffer) => partes.push(c));
        res.on('end', () =>
          resolve({ status: res.statusCode ?? 0, headers: res.headers, corpo: Buffer.concat(partes).toString('utf8') }),
        );
      },
    );
    req.on('error', reject);
    if (opcoes.corpo !== undefined) req.write(opcoes.corpo);
    req.end();
  });
}

export const baseDe = (url: string): string => new URL(url).origin;
export const tokenDe = (url: string): string => new URL(url).searchParams.get('t') as string;

export function formulario(token: string, campos: { u: string; s: string; p?: string }): string {
  return new URLSearchParams({ t: token, u: campos.u, s: campos.s, p: campos.p ?? 'A' }).toString();
}

/** Envia o formulário de login à janela, como o navegador faria. */
export function postarLogin(
  url: string,
  campos: { u: string; s: string; p?: string },
  tokenForcado?: string,
): Promise<RespostaHttp> {
  return requisitar(`${baseDe(url)}/entrar`, {
    metodo: 'POST',
    corpo: formulario(tokenForcado ?? tokenDe(url), campos),
  });
}

/** `true` se a conexão for recusada (janela fechada). */
export async function janelaFechada(url: string): Promise<boolean> {
  try {
    await requisitar(url);
    return false;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === 'ECONNREFUSED' || (e as NodeJS.ErrnoException).code === 'ECONNRESET';
  }
}
