import crypto from 'node:crypto';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  CONTRATO_DOURADO,
  type ContratoDourado,
} from '../../src/infraestructure/softdesk/contrato';
import { montarItem, valorPadrao, type EspecChamado } from './dados';

/**
 * SoftDesk simulado (ARCH-001 §10, ADR-006): `node:http` em 127.0.0.1:0 com só três rotas,
 * `GET /login`, `POST /login` e `GET /chamado/json`. Qualquer outra chamada responde 404 e
 * fica no registro (é assim que os testes provam a regra de somente leitura, RN-01).
 * Dados fictícios; a forma do item vem do contrato dourado.
 */

export type CenarioLogin =
  | 'ok'
  | 'status_falso'
  | '401'
  | 'html'
  | 'sem_xsrf'
  | '500'
  /** `GET /login` responde 500 (o `POST` continua normal). */
  | 'pagina_500'
  /** `GET /login` redireciona uma vez para outro caminho da mesma origem e depois responde. */
  | 'pagina_redireciona'
  /** `GET /login` redireciona para si mesmo sem parar. */
  | 'pagina_redireciona_sempre'
  /** `GET /login` redireciona para outra origem. */
  | 'pagina_redireciona_externo';

export type CenarioPesquisa =
  | 'ok'
  | 'sem_lista'
  | 'sem_total'
  | 'html'
  | 'redirect_login'
  | '401'
  | '403'
  | '500'
  | { lento: number };

export type FormaExpiracao = 'redirect_login' | '401' | '403';

export interface RegistroRequisicao {
  metodo: string;
  /** Só o caminho, sem query. */
  caminho: string;
  /** Parâmetros da query (chave com `[]` mantém o sufixo). */
  query: Record<string, string[]>;
  /** Cookies que o cliente mandou (nome e valor; só para conferência em teste). */
  cookies: Record<string, string>;
  em: number;
}

export interface LoginRecebido {
  usuario: string;
  perfil: string;
  /** Chaves do corpo JSON, na ordem em que vieram. */
  chaves: string[];
  /** `X-XSRF-TOKEN` bateu com o cookie `XSRF-TOKEN` decodificado? */
  xsrfOk: boolean;
}

/** Mudanças aplicadas aos itens na resposta, para os testes de deriva (VAL-29 a VAL-31). */
export interface Deriva {
  /** Campos que somem do item. */
  remover: string[];
  /** Campos cujo valor é trocado (inclusive por outro tipo). */
  alterar: Record<string, unknown>;
  /** Campos novos. */
  adicionar: Record<string, unknown>;
}

export interface OpcoesSimulado {
  contrato?: ContratoDourado;
  chamados?: EspecChamado[];
  /** Se informado, o login só é aceito com este par (senão qualquer um passa no cenário `ok`). */
  credenciais?: { usuario: string; senha: string };
  /** A cada resposta de pesquisa o servidor renova um cookie (`softdesk_rotativo`). */
  rotacionarCookie?: boolean;
}

const nomeAleatorio = (n: number): string => crypto.randomBytes(n).toString('hex');

function lerCookies(cabecalho: string | undefined): Record<string, string> {
  const saida: Record<string, string> = {};
  for (const par of (cabecalho ?? '').split(';')) {
    const i = par.indexOf('=');
    if (i > 0) saida[par.slice(0, i).trim()] = par.slice(i + 1).trim();
  }
  return saida;
}

/** Todos os simuladores criados no arquivo de teste em curso (a guarda de somente leitura confere ao fim). */
export const simuladoresCriados: SoftdeskSimulado[] = [];

export const ROTAS_PERMITIDAS: readonly string[] = ['GET /login', 'POST /login', 'GET /chamado/json'];

export class SoftdeskSimulado {
  /** Só o teste do próprio simulador usa: ele prova o 404 chamando rotas de propósito. */
  toleraRotasExtras = false;
  /** Endereço base, por exemplo `http://127.0.0.1:54321`. */
  url = '';
  login: CenarioLogin = 'ok';
  pesquisa: CenarioPesquisa = 'ok';
  chamados: EspecChamado[];
  deriva: Deriva = { remover: [], alterar: {}, adicionar: {} };
  rotacionarCookie: boolean;
  credenciais?: { usuario: string; senha: string };

  readonly registro: RegistroRequisicao[] = [];
  readonly logins: LoginRecebido[] = [];

  private readonly contrato: ContratoDourado;
  private readonly servidor: http.Server;
  private readonly sessoes = new Set<string>();
  private readonly xsrfEmitidos = new Set<string>();
  private readonly valoresEmitidos: string[] = [];
  private comoExpira: FormaExpiracao = 'redirect_login';
  private ativas = 0;
  private pico = 0;
  private contadorRotativo = 0;
  private readonly timers = new Set<NodeJS.Timeout>();

  private constructor(opcoes: OpcoesSimulado) {
    this.contrato = opcoes.contrato ?? CONTRATO_DOURADO;
    this.chamados = opcoes.chamados ?? [];
    this.credenciais = opcoes.credenciais;
    this.rotacionarCookie = opcoes.rotacionarCookie ?? false;
    this.servidor = http.createServer((req, res) => this.tratar(req, res));
  }

  static async iniciar(opcoes: OpcoesSimulado = {}): Promise<SoftdeskSimulado> {
    const s = new SoftdeskSimulado(opcoes);
    simuladoresCriados.push(s);
    await new Promise<void>((resolve) => s.servidor.listen(0, '127.0.0.1', resolve));
    s.url = `http://127.0.0.1:${(s.servidor.address() as AddressInfo).port}`;
    return s;
  }

  async fechar(): Promise<void> {
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
    this.servidor.closeAllConnections();
    await new Promise<void>((resolve) => this.servidor.close(() => resolve()));
  }

  // --- controles -----------------------------------------------------------------------

  /** Invalida todas as sessões: a próxima pesquisa sai como `forma` (padrão: redireciona a /login). */
  expirarSessao(forma: FormaExpiracao = 'redirect_login'): void {
    this.sessoes.clear();
    this.comoExpira = forma;
  }

  definirChamados(chamados: EspecChamado[]): void {
    this.chamados = chamados;
  }

  /** Aplica uma deriva (acumula com a anterior campo a campo). */
  aplicarDeriva(d: Partial<Deriva>): void {
    this.deriva = {
      remover: [...this.deriva.remover, ...(d.remover ?? [])],
      alterar: { ...this.deriva.alterar, ...(d.alterar ?? {}) },
      adicionar: { ...this.deriva.adicionar, ...(d.adicionar ?? {}) },
    };
  }

  limparDeriva(): void {
    this.deriva = { remover: [], alterar: {}, adicionar: {} };
  }

  /** Maior número de requisições em andamento ao mesmo tempo desde o último `zerarPico`. */
  get picoSimultaneas(): number {
    return this.pico;
  }

  zerarPico(): void {
    this.pico = this.ativas;
  }

  /** Requisições registradas ao caminho, na ordem. */
  requisicoes(caminho: string, metodo?: string): RegistroRequisicao[] {
    return this.registro.filter((r) => r.caminho === caminho && (!metodo || r.metodo === metodo));
  }

  /** Todos os valores de cookie que o servidor emitiu (para a busca de vazamento nos testes). */
  cookiesEmitidos(): string[] {
    return [...this.valoresEmitidos];
  }

  get sessoesAbertas(): number {
    return this.sessoes.size;
  }

  // --- servidor ------------------------------------------------------------------------

  private tratar(req: http.IncomingMessage, res: http.ServerResponse): void {
    this.ativas += 1;
    if (this.ativas > this.pico) this.pico = this.ativas;
    let contada = true;
    const terminar = (): void => {
      if (!contada) return;
      contada = false;
      this.ativas -= 1;
    };
    res.on('finish', terminar);
    res.on('close', terminar);

    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    const query: Record<string, string[]> = {};
    for (const [k, v] of url.searchParams) (query[k] ??= []).push(v);
    const cookies = lerCookies(req.headers.cookie);
    const metodo = req.method ?? 'GET';
    this.registro.push({ metodo, caminho: url.pathname, query, cookies, em: Date.now() });

    if (metodo === 'GET' && url.pathname === '/login') return this.paginaLogin(req, res);
    if (metodo === 'POST' && url.pathname === '/login') return this.enviarLogin(req, res, cookies);
    if (metodo === 'GET' && url.pathname === '/chamado/json') return this.buscar(res, cookies, query);
    res.writeHead(404, { 'Content-Type': 'text/plain' }).end('nao encontrado');
  }

  private emitir(valor: string): string {
    this.valoresEmitidos.push(valor);
    return valor;
  }

  private paginaLogin(req: http.IncomingMessage, res: http.ServerResponse): void {
    const cenario = this.login;
    if (cenario === 'pagina_500') {
      res.writeHead(500, { 'Content-Type': 'text/plain' }).end('erro');
      return;
    }
    if (cenario === 'pagina_redireciona_sempre') {
      res.writeHead(302, { Location: '/login' }).end();
      return;
    }
    if (cenario === 'pagina_redireciona_externo') {
      res.writeHead(302, { Location: 'http://127.0.0.1:1/login' }).end();
      return;
    }
    if (cenario === 'pagina_redireciona' && !req.url?.includes('entrada=1')) {
      res.writeHead(302, { Location: '/login?entrada=1' }).end();
      return;
    }
    const cabecalhos: string[] = [`softdesk_session=${this.emitir(nomeAleatorio(12))}; Path=/; HttpOnly`];
    if (cenario !== 'sem_xsrf') {
      // Valor com `=` e `+`, como o token real: exige `decodeURIComponent` ao devolver.
      const bruto = `${nomeAleatorio(10)}=+${nomeAleatorio(4)}`;
      this.xsrfEmitidos.add(bruto);
      cabecalhos.push(`XSRF-TOKEN=${this.emitir(encodeURIComponent(bruto))}; Path=/`);
    }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Set-Cookie': cabecalhos });
    res.end('<!doctype html><title>Login</title><div id="app"></div>');
  }

  private enviarLogin(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    cookies: Record<string, string>,
  ): void {
    const pedaco: Buffer[] = [];
    req.on('data', (c: Buffer) => pedaco.push(c));
    req.on('end', () => {
      const cenario = this.login;
      const enviado = req.headers['x-xsrf-token'];
      const cookieXsrf = cookies['XSRF-TOKEN'];
      let decodificado = '';
      try {
        decodificado = cookieXsrf ? decodeURIComponent(cookieXsrf) : '';
      } catch {
        decodificado = '';
      }
      const xsrfOk =
        typeof enviado === 'string' && decodificado !== '' && enviado === decodificado && this.xsrfEmitidos.has(enviado);
      let corpo: Record<string, unknown> = {};
      try {
        corpo = JSON.parse(Buffer.concat(pedaco).toString('utf8')) as Record<string, unknown>;
      } catch {
        corpo = {};
      }
      this.logins.push({
        usuario: typeof corpo.lg_usuario === 'string' ? corpo.lg_usuario : '',
        perfil: typeof corpo.tp_usuario === 'string' ? corpo.tp_usuario : '',
        chaves: Object.keys(corpo),
        xsrfOk,
      });

      if (!xsrfOk) {
        // Como o framework real faz com XSRF inválido: página de erro, não JSON.
        res.writeHead(419, { 'Content-Type': 'text/html' }).end('<html>expirou</html>');
        return;
      }
      const json = (status: number, dados: unknown, extra: Record<string, string | string[]> = {}): void => {
        res.writeHead(status, { 'Content-Type': 'application/json', ...extra }).end(JSON.stringify(dados));
      };
      const resposta = (status: boolean, mensagem: string) => ({
        status,
        mensagem,
        rota: '/chamado',
        tipo_retorno: 1,
        dados: [],
      });
      if (cenario === '500') {
        res.writeHead(500, { 'Content-Type': 'text/plain' }).end('erro interno');
        return;
      }
      if (cenario === '401') return json(401, resposta(false, 'Não autorizado'));
      if (cenario === 'html') {
        res.writeHead(200, { 'Content-Type': 'text/html' }).end('<html><body>Novo login</body></html>');
        return;
      }
      const credOk =
        !this.credenciais ||
        (corpo.lg_usuario === this.credenciais.usuario && corpo.sh_usuario === this.credenciais.senha);
      if (cenario === 'status_falso' || !credOk) return json(200, resposta(false, 'Credenciais inválidas'));

      const sessao = nomeAleatorio(12);
      this.sessoes.add(sessao);
      const novoXsrf = `${nomeAleatorio(10)}=+${nomeAleatorio(4)}`;
      this.xsrfEmitidos.add(novoXsrf);
      json(200, resposta(true, 'ok'), {
        'Set-Cookie': [
          `softdesk_session=${this.emitir(sessao)}; Path=/; HttpOnly`,
          `XSRF-TOKEN=${this.emitir(encodeURIComponent(novoXsrf))}; Path=/`,
        ],
      });
    });
  }

  private buscar(
    res: http.ServerResponse,
    cookies: Record<string, string>,
    query: Record<string, string[]>,
  ): void {
    const cenario = this.pesquisa;
    const atraso = typeof cenario === 'object' ? cenario.lento : 0;
    const responder = (): void => {
      if (res.destroyed || res.writableEnded) return;
      this.responderBusca(res, cookies, query);
    };
    if (atraso > 0) {
      const t = setTimeout(() => {
        this.timers.delete(t);
        responder();
      }, atraso);
      this.timers.add(t);
      res.on('close', () => {
        clearTimeout(t);
        this.timers.delete(t);
      });
    } else {
      responder();
    }
  }

  private responderBusca(
    res: http.ServerResponse,
    cookies: Record<string, string>,
    query: Record<string, string[]>,
  ): void {
    const cenario = this.pesquisa;
    const json = (dados: unknown, extra: Record<string, string | string[]> = {}): void => {
      res.writeHead(200, { 'Content-Type': 'application/json', ...extra }).end(JSON.stringify(dados));
    };
    const negar = (forma: FormaExpiracao): void => {
      if (forma === 'redirect_login') res.writeHead(302, { Location: '/login' }).end();
      else res.writeHead(Number(forma), { 'Content-Type': 'application/json' }).end('{"message":"Unauthenticated."}');
    };

    if (cenario === '500') {
      res.writeHead(500, { 'Content-Type': 'text/plain' }).end('erro interno');
      return;
    }
    if (cenario === 'redirect_login') return negar('redirect_login');
    if (cenario === '401') return negar('401');
    if (cenario === '403') return negar('403');
    if (cenario === 'html') {
      res.writeHead(200, { 'Content-Type': 'text/html' }).end('<html><body>nova tela</body></html>');
      return;
    }
    const sessao = cookies.softdesk_session;
    if (!sessao || !this.sessoes.has(sessao)) return negar(this.comoExpira);

    const filtrados = this.filtrar(query);
    const inicio = Math.max(0, Number(query.start?.[0] ?? 0) || 0);
    const limite = Math.max(0, Number(query.limit?.[0] ?? 50) || 0);
    const lista = filtrados.slice(inicio, inicio + limite).map((spec) => this.aplicarDerivaAoItem(montarItem(spec, this.contrato)));

    const topo: Record<string, unknown> = {};
    for (const [nome, campo] of Object.entries(this.contrato.pesquisa.topo)) {
      topo[nome] = valorPadrao(campo.tipos);
    }
    const treeview: Record<string, unknown> = {};
    for (const [nome, campo] of Object.entries(this.contrato.pesquisa.treeview)) {
      treeview[nome] = nome === 'total' ? filtrados.length : valorPadrao(campo.tipos);
    }
    if (cenario === 'sem_lista') {
      delete topo.lista;
      topo.treeview = treeview;
    } else if (cenario === 'sem_total') {
      delete treeview.total;
      topo.lista = lista;
      topo.treeview = treeview;
    } else {
      topo.lista = lista;
      topo.treeview = treeview;
    }
    const extra: Record<string, string | string[]> = {};
    if (this.rotacionarCookie) {
      this.contadorRotativo += 1;
      extra['Set-Cookie'] = [`softdesk_rotativo=${this.emitir(`r${this.contadorRotativo}${nomeAleatorio(3)}`)}; Path=/`];
    }
    json(topo, extra);
  }

  private filtrar(query: Record<string, string[]>): EspecChamado[] {
    const atendentes = (query['pesq_cd_atendente[]'] ?? []).map(Number);
    const status = query['pesq_st_chamado[]'];
    const codigo = query.pesq_cd_chamado?.[0];
    return this.chamados.filter((c) => {
      if (atendentes.length > 0 && !atendentes.includes(c.cd_atendente)) return false;
      // Só o nome confirmado existe no servidor simulado; outro nome não casa com nada.
      if (status && status.length > 0 && !(status.every((s) => s === 'EM_ATENDIMENTO') && c.st_chamado === 1)) {
        return false;
      }
      if (codigo !== undefined && codigo !== '' && String(c.cd_chamado) !== codigo) return false;
      return true;
    });
  }

  private aplicarDerivaAoItem(item: Record<string, unknown>): Record<string, unknown> {
    for (const nome of this.deriva.remover) delete item[nome];
    Object.assign(item, this.deriva.alterar, this.deriva.adicionar);
    return item;
  }
}
