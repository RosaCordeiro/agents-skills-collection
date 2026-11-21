import crypto from 'node:crypto';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { PERFIS_LOGIN, type PerfilLogin, type SessaoHttp } from '../../core/domain/entities/sessao';
import { ErroSoftdesk, ehErroSoftdesk } from '../../core/domain/errors/erro-softdesk';
import type { IAbridorNavegador } from '../../core/domain/ports/abridor-navegador';
import type { IJanelaLogin, InfoJanela, ResultadoLogin } from '../../core/domain/ports/janela-login';
import type { ILogger } from '../../core/domain/ports/logger';
import type { IRelogio } from '../../core/domain/ports/relogio';
import type { ISessaoStore } from '../../core/domain/ports/sessao.store';
import type { ISoftdeskGateway } from '../../core/domain/ports/softdesk.gateway';
import { estadoPaginaDoErro, montarCsp, renderizarPagina, type EstadoPagina } from './pagina';

/**
 * Janela de login local (ARCH-001 §6 F1, §19; SPEC RN-10): `node:http` em `127.0.0.1:0`, token de
 * 24 bytes de uso único comparado com `timingSafeEqual`, vida de 5 min, `Host` conferido, corpo
 * de até 4 KB. A senha existe só como variável local do tratamento do `POST`: não entra em estado,
 * erro nem log. Reaproveita o protótipo validado (`apoio/probe-sessao/probe-sessao.mjs`).
 */

export const VIDA_JANELA_MS = 5 * 60 * 1000;
export const LIMITE_CORPO_BYTES = 4096;
const LIMITE_CAMPO = 256;
/**
 * Folga dada a um login já enviado quando os 5 min vencem. O login passa por até três etapas do gateway
 * (vaga, `GET /login` e `POST /login`), cada uma com o prazo `timeoutMs` dele: `3 × timeoutMs + 10 s`.
 */
export const gracaLoginDoTimeout = (timeoutGatewayMs: number): number => 3 * timeoutGatewayMs + 10_000;
/** Folga padrão (gateway com o prazo padrão de 20 s). */
export const GRACA_LOGIN_EM_ANDAMENTO_MS = gracaLoginDoTimeout(20_000);

/** Arma `fn` para daqui a `ms`; devolve o cancelamento. Os testes trocam por um agendador manual. */
export type Agendar = (fn: () => void, ms: number) => () => void;

const agendarPadrao: Agendar = (fn, ms) => {
  const t = setTimeout(fn, ms);
  t.unref();
  return () => clearTimeout(t);
};

export interface OpcoesJanelaLogin {
  gateway: ISoftdeskGateway;
  sessao: ISessaoStore;
  abridor: IAbridorNavegador;
  logger: ILogger;
  relogio: IRelogio;
  perfilPadrao: PerfilLogin;
  vidaMs?: number;
  /** Folga de um login em andamento ao vencer a janela. Padrão: `GRACA_LOGIN_EM_ANDAMENTO_MS`. */
  gracaMs?: number;
  agendar?: Agendar;
  /** Chamado depois de um login aceito (o serviço dispara a saúde automática; nunca lança). */
  aoLoginAceito?: () => void;
  /** Chamado quando o login falha, com o erro tipado (liga o alerta de contrato; nunca lança). */
  aoLoginFalhar?: (erro: ErroSoftdesk) => void;
}

interface JanelaAtiva {
  server: http.Server;
  porta: number;
  token: string;
  expiraEm: Date;
  usado: boolean;
  encerrada: boolean;
  /** Login decidido (aceito ou recusado): a janela já não conta como aberta, mesmo fechando ainda. */
  concluida: boolean;
  navegadorAberto: boolean;
  /** A folga de login em andamento já foi dada. */
  graca?: boolean;
  cancelarTempo: () => void;
  /** Abortado ao encerrar a janela: o login em andamento para antes de enviar a senha. */
  abortar: AbortController;
  resolver: (r: ResultadoLogin | 'TEMPO') => void;
  resultado: Promise<ResultadoLogin | 'TEMPO'>;
}

type MotivoRecusa = 'host' | 'token' | 'usado' | 'vencido' | 'tamanho';

export class JanelaLoginServer implements IJanelaLogin {
  private atual: JanelaAtiva | null = null;
  private abrindo: Promise<InfoJanela> | null = null;
  /** Resultado da última janela (para quem pede `aguardarResultado` logo depois de abrir). */
  private ultimoResultado: Promise<ResultadoLogin | 'TEMPO'> | null = null;
  private readonly vidaMs: number;
  private readonly agendar: Agendar;
  private readonly gracaMs: number;

  constructor(private readonly op: OpcoesJanelaLogin) {
    this.vidaMs = op.vidaMs ?? VIDA_JANELA_MS;
    this.agendar = op.agendar ?? agendarPadrao;
    this.gracaMs = op.gracaMs ?? GRACA_LOGIN_EM_ANDAMENTO_MS;
  }

  // --- IJanelaLogin ----------------------------------------------------------------------

  async abrirOuReaproveitar(): Promise<InfoJanela> {
    const existente = this.info();
    if (existente) {
      this.op.sessao.marcarAguardando();
      this.op.logger.info('janela reaproveitada', { event: { name: 'janela_login', action: 'reuse' } });
      return existente;
    }
    if (this.abrindo) return this.abrindo;
    this.abrindo = this.abrir().finally(() => {
      this.abrindo = null;
    });
    return this.abrindo;
  }

  async aguardarResultado(ms: number): Promise<ResultadoLogin | 'TEMPO'> {
    const alvo = this.atual?.resultado ?? this.ultimoResultado;
    if (!alvo) return 'TEMPO';
    let cancelar: () => void = () => undefined;
    const limite = new Promise<'TEMPO'>((resolve) => {
      const t = setTimeout(() => resolve('TEMPO'), Math.max(0, ms));
      t.unref();
      cancelar = () => clearTimeout(t);
    });
    try {
      return await Promise.race([alvo, limite]);
    } finally {
      cancelar();
    }
  }

  info(): InfoJanela | null {
    const j = this.atual;
    if (!j || j.encerrada || j.concluida) return null;
    return { aberta: true, expiraEm: new Date(j.expiraEm.getTime()), navegadorAberto: j.navegadorAberto };
  }

  enderecoManual(): string | null {
    const j = this.atual;
    if (!j || j.encerrada || j.concluida) return null;
    return this.enderecoDe(j);
  }

  /** Endereço em que o servidor da janela escuta (só para teste do bind, RN-10). */
  escutaEm(): { address: string; port: number } | null {
    const j = this.atual;
    if (!j || j.encerrada) return null;
    const a = j.server.address() as AddressInfo | null;
    return a ? { address: a.address, port: a.port } : null;
  }

  fechar(): void {
    const j = this.atual;
    if (!j || j.encerrada) return;
    this.op.sessao.janelaEncerrada();
    j.resolver('TEMPO');
    this.encerrar(j, 'fechada', true);
  }

  // --- abertura --------------------------------------------------------------------------

  private enderecoDe(j: JanelaAtiva): string {
    return `http://127.0.0.1:${j.porta}/?t=${j.token}`;
  }

  private async abrir(): Promise<InfoJanela> {
    let resolver: (r: ResultadoLogin | 'TEMPO') => void = () => undefined;
    const resultado = new Promise<ResultadoLogin | 'TEMPO'>((resolve) => {
      resolver = resolve;
    });
    const server = http.createServer();
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', () => resolve());
    });
    const porta = (server.address() as AddressInfo).port;
    const j: JanelaAtiva = {
      server,
      porta,
      token: crypto.randomBytes(24).toString('hex'),
      expiraEm: new Date(this.op.relogio.agora().getTime() + this.vidaMs),
      usado: false,
      encerrada: false,
      concluida: false,
      navegadorAberto: false,
      cancelarTempo: () => undefined,
      abortar: new AbortController(),
      resolver,
      resultado,
    };
    server.on('request', (req, res) => {
      this.tratar(j, req, res).catch(() => {
        // Nunca vaza detalhe: resposta fixa.
        if (!res.headersSent) this.texto(res, 500, 'Erro interno.');
        else res.end();
      });
    });
    server.on('clientError', (_e, socket) => socket.destroy());
    this.atual = j;
    this.ultimoResultado = resultado;
    this.op.sessao.marcarAguardando();
    j.cancelarTempo = this.agendar(() => this.expirar(j), this.vidaMs);
    try {
      j.navegadorAberto = await this.op.abridor.abrir(this.enderecoDe(j));
    } catch {
      j.navegadorAberto = false;
    }
    this.op.logger.info('janela aberta', {
      event: { name: 'janela_login', action: 'open' },
      navegador_aberto: j.navegadorAberto,
    });
    return { aberta: true, expiraEm: new Date(j.expiraEm.getTime()), navegadorAberto: j.navegadorAberto };
  }

  private expirar(j: JanelaAtiva): void {
    if (j.encerrada) return;
    if (j.usado && !j.concluida && !j.graca) {
      // Login já enviado e em andamento: deixa terminar (a janela fecha ao responder). Só rearma uma
      // folga curta, para o caso de o tratamento nunca concluir.
      j.graca = true;
      j.cancelarTempo = this.agendar(() => this.expirar(j), this.gracaMs);
      return;
    }
    this.op.logger.info('janela expirou', { event: { name: 'janela_login', action: 'expire' } });
    this.op.sessao.janelaEncerrada();
    j.resolver('TEMPO');
    this.encerrar(j, 'vencida', true);
  }

  private encerrar(j: JanelaAtiva, motivo: string, forcar: boolean): void {
    if (j.encerrada) return;
    j.encerrada = true;
    j.cancelarTempo();
    j.abortar.abort();
    if (this.atual === j) this.atual = null;
    j.server.close();
    if (forcar) j.server.closeAllConnections();
    else j.server.closeIdleConnections();
    this.op.logger.info('janela encerrada', {
      event: { name: 'janela_login', action: 'close' },
      motivo,
    });
  }

  // --- tratamento das requisições --------------------------------------------------------

  private tokenConfere(candidato: string | null | undefined, j: JanelaAtiva): boolean {
    if (typeof candidato !== 'string') return false;
    const a = Buffer.from(candidato);
    const b = Buffer.from(j.token);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  }

  private cabecalhos(tipo: string, nonce: string): http.OutgoingHttpHeaders {
    return {
      'Content-Type': tipo,
      'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer',
      'X-Frame-Options': 'DENY',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': montarCsp(nonce),
      Connection: 'close',
    };
  }

  private texto(res: http.ServerResponse, status: number, corpo: string): void {
    const h = this.cabecalhos('text/plain; charset=utf-8', crypto.randomBytes(16).toString('base64'));
    res.writeHead(status, h).end(corpo);
  }

  private html(
    res: http.ServerResponse,
    status: number,
    montar: (nonce: string) => string,
    aoTerminar?: () => void,
  ): void {
    // Um nonce novo por resposta: o mesmo valor vai no CSP e no `<script>` da página.
    const nonce = crypto.randomBytes(16).toString('base64');
    const h = this.cabecalhos('text/html; charset=utf-8', nonce);
    if (aoTerminar) res.once('close', aoTerminar);
    res.writeHead(status, h).end(montar(nonce));
  }

  private recusar(j: JanelaAtiva, res: http.ServerResponse, motivo: MotivoRecusa, status = 403): void {
    this.op.logger.warn('janela recusou requisição', {
      event: { name: 'janela_login', action: 'reject' },
      motivo,
    });
    this.texto(res, status, status === 413 ? 'Pedido grande demais.' : 'Acesso recusado.');
    if (motivo === 'vencido') {
      if (this.atual === j) this.op.sessao.janelaEncerrada();
      j.resolver('TEMPO');
      this.encerrar(j, 'vencida', false);
    }
  }

  private async tratar(j: JanelaAtiva, req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    // 1. Host exato (RN-10): barra rebinding de DNS e uso por outro nome.
    if (req.headers.host !== `127.0.0.1:${j.porta}`) return this.recusar(j, res, 'host');
    // 2. Origin, quando o navegador o envia (POST de outro site), tem de ser a própria janela.
    // Com `Referrer-Policy: no-referrer` os navegadores enviam `Origin: null` no POST do próprio formulário
    // (achado na validação em produção, 21/11/2026). `null` só vale com `Sec-Fetch-Site: same-origin`, cabeçalho
    // que o navegador define e uma página de outro site não consegue forjar.
    const origem = req.headers.origin;
    const origemDaJanela = origem === `http://127.0.0.1:${j.porta}`;
    const nulaMasMesmaOrigem = origem === 'null' && req.headers['sec-fetch-site'] === 'same-origin';
    if (origem !== undefined && !origemDaJanela && !nulaMasMesmaOrigem) return this.recusar(j, res, 'host');
    // 3. Janela encerrada ou vencida (o relógio é o injetado, o mesmo dos testes).
    if (j.encerrada) return this.recusar(j, res, 'vencido');
    const emAndamento = j.usado && !j.concluida;
    if (!emAndamento && this.op.relogio.agora().getTime() >= j.expiraEm.getTime()) {
      return this.recusar(j, res, 'vencido');
    }

    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    if (req.method === 'GET' && url.pathname === '/') {
      const t = url.searchParams.get('t');
      if (!this.tokenConfere(t, j)) return this.recusar(j, res, 'token');
      if (j.usado) return this.recusar(j, res, 'usado');
      this.html(res, 200, (nonce) =>
        renderizarPagina({ estado: 'ENTRADA', nonce, token: j.token, perfilPadrao: this.op.perfilPadrao }),
      );
      return;
    }
    if (req.method === 'POST' && url.pathname === '/entrar') {
      return this.tratarEntrar(j, req, res);
    }
    this.texto(res, 404, 'Não encontrado.');
  }

  private lerCorpo(req: http.IncomingMessage): Promise<string | null> {
    return new Promise((resolve) => {
      const declarado = Number(req.headers['content-length']);
      if (Number.isFinite(declarado) && declarado > LIMITE_CORPO_BYTES) return resolve(null);
      const partes: Buffer[] = [];
      let total = 0;
      let estourou = false;
      req.on('data', (c: Buffer) => {
        if (estourou) return;
        total += c.length;
        if (total > LIMITE_CORPO_BYTES) {
          estourou = true;
          partes.length = 0;
          resolve(null);
          return;
        }
        partes.push(c);
      });
      req.on('end', () => {
        if (!estourou) resolve(Buffer.concat(partes).toString('utf8'));
      });
      req.on('error', () => resolve(null));
    });
  }

  private async tratarEntrar(j: JanelaAtiva, req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const corpo = await this.lerCorpo(req);
    if (j.encerrada) {
      // Venceu ou foi fechada enquanto o corpo chegava: a senha não segue para o SoftDesk.
      this.texto(res, 410, 'Janela encerrada.');
      return;
    }
    if (corpo === null) {
      this.recusar(j, res, 'tamanho', 413);
      res.once('finish', () => req.destroy());
      return;
    }
    const f = new URLSearchParams(corpo);
    const t = f.get('t');
    if (!this.tokenConfere(t, j)) return this.recusar(j, res, 'token');
    if (j.usado) return this.recusar(j, res, 'usado');

    let usuario = f.get('u') ?? '';
    let senha = f.get('s') ?? '';
    const p = f.get('p') ?? '';
    const perfil = (PERFIS_LOGIN as readonly string[]).includes(p) ? (p as PerfilLogin) : null;
    if (!usuario.trim() || !senha || usuario.length > LIMITE_CAMPO || senha.length > LIMITE_CAMPO || !perfil) {
      // Formulário incompleto: mostra o formulário de novo, sem consumir o token.
      this.html(res, 200, (nonce) =>
        renderizarPagina({ estado: 'ENTRADA', nonce, token: j.token, perfilPadrao: this.op.perfilPadrao }),
      );
      return;
    }

    j.usado = true;
    this.op.sessao.marcarAutenticando();
    let sessaoHttp: SessaoHttp | null = null;
    let erro: ErroSoftdesk | null = null;
    try {
      sessaoHttp = await this.op.gateway.autenticar(usuario, senha, perfil, j.abortar.signal);
    } catch (e) {
      erro = ehErroSoftdesk(e) ? e : new ErroSoftdesk('ERRO_INTERNO');
    } finally {
      // A senha só viveu nesta função.
      senha = '';
    }
    const resumoUsuario = usuario;
    usuario = '';

    if (j.encerrada) {
      // Janela fechada (parada do serviço) durante o login: descarta o resultado e os cookies.
      sessaoHttp?.cookies.clear();
      this.texto(res, 410, 'Janela encerrada.');
      return;
    }

    j.concluida = true;
    if (sessaoHttp && !erro) {
      this.op.sessao.guardar(sessaoHttp, { usuario: resumoUsuario, perfil, desde: this.op.relogio.agora() });
      this.op.logger.info('login aceito', {
        event: { name: 'sessao', action: 'login', outcome: 'success' },
        perfil,
      });
      const resumo = this.op.sessao.resumo();
      this.html(
        res,
        200,
        (nonce) => renderizarPagina({ estado: 'PRONTO', nonce }),
        () => this.encerrar(j, 'login_ok', false),
      );
      j.resolver(
        resumo
          ? { ok: true, resumo }
          : { ok: false, erro: new ErroSoftdesk('ERRO_INTERNO') },
      );
      try {
        this.op.aoLoginAceito?.();
      } catch {
        // gancho nunca derruba o login
      }
      return;
    }

    // Mensagem do SoftDesk e usuário nunca voltam: no CREDENCIAL o erro vira o fixo do código.
    const erroFinal = erro && erro.codigo === 'CREDENCIAL' ? new ErroSoftdesk('CREDENCIAL') : (erro as ErroSoftdesk);
    this.op.sessao.descartar('login_falhou');
    this.op.logger.warn('login recusado ou falhou', {
      event: { name: 'sessao', action: 'login', outcome: 'failure' },
      codigo_erro: erroFinal.codigo,
    });
    const estado: EstadoPagina = estadoPaginaDoErro(erroFinal.codigo);
    this.html(
      res,
      200,
      (nonce) => renderizarPagina({ estado, nonce }),
      () => this.encerrar(j, 'login_falhou', false),
    );
    try {
      this.op.aoLoginFalhar?.(erroFinal);
    } catch {
      // gancho nunca derruba o login
    }
    j.resolver({ ok: false, erro: erroFinal });
  }
}
