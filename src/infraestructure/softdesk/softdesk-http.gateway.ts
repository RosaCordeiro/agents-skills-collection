import { ErroSoftdesk, ehErroSoftdesk, type CodigoErro } from '../../core/domain/errors/erro-softdesk';
import type { ChamadoBruto } from '../../core/domain/entities/chamado';
import { normalizarPaginacao, type FiltroPesquisa } from '../../core/domain/entities/filtro-pesquisa';
import type { PerfilLogin, SessaoHttp } from '../../core/domain/entities/sessao';
import { NOME_STATUS_EM_ATENDIMENTO } from '../../core/domain/entities/status';
import type { ILogger } from '../../core/domain/ports/logger';
import type { IRelogio } from '../../core/domain/ports/relogio';
import type { ISoftdeskGateway, OpcoesPesquisaGateway, PaginaPesquisa } from '../../core/domain/ports/softdesk.gateway';
import {
  CONTRATO_DOURADO,
  classificarLogin,
  classificarPesquisa,
  conferirLista,
  diagnosticarLista,
  evidenciaDe,
  semDiferenca,
  type ContratoDourado,
  type RespostaClassificavel,
} from './contrato';
import { CookieJar } from './cookie-jar';
import { Semaforo } from './semaforo';

/**
 * Único arquivo que conhece URLs, parâmetros `pesq_*`, XSRF e cabeçalhos do SoftDesk
 * (ARCH-001 §4, §7.4, §16 e §17 camada 1). Somente leitura (RN-01): `GET /login`,
 * `POST /login` e `GET /chamado/json`, e mais nada.
 *
 * - `fetch` nativo com `redirect: 'manual'`; `GET /login` segue até 5 redirecionamentos dentro
 *   da mesma origem; o `POST /login` e a pesquisa nunca seguem redirecionamento.
 * - Prazo de 20 s por chamada; no máximo 2 chamadas simultâneas (semáforo FIFO).
 * - Guarda o `Set-Cookie` de toda resposta (o SoftDesk pode renovar o token).
 * - Erros levam só `evidencia` (status, tipo de mídia, caminho do `Location`), nunca corpo.
 * - Logs só com a lista de permissão de §8.3: nada de senha, usuário, cookie, título ou nome.
 */

export const TIMEOUT_PADRAO_MS = 20_000;
export const VAGAS_PADRAO = 2;
const MAX_REDIRECIONAMENTOS_LOGIN = 5;

export interface OpcoesGateway {
  /** Origem do SoftDesk, sem barra final (a `Config.baseUrl` já vem assim). */
  baseUrl: string;
  logger: ILogger;
  /** Hora de criação da `SessaoHttp`. Padrão: relógio do sistema. */
  relogio?: IRelogio;
  /** Prazo por chamada, em ms. Padrão 20 s; os testes o reduzem. */
  timeoutMs?: number;
  /** Chamadas simultâneas permitidas. Padrão 2 (RNF-04). */
  vagas?: number;
  /** Contrato dourado. Padrão: o embutido. */
  contrato?: ContratoDourado;
  /**
   * Recebe o JSON recebido do login e da pesquisa, ANTES da classificação (só a captura de forma,
   * `cli-capturar-forma`, usa; quem recebe extrai nomes e tipos e descarta os valores).
   */
  observarForma?: (rota: 'login' | 'pesquisa', json: unknown) => void;
}

type Rota = 'login_get' | 'login_post' | 'pesquisa';

interface RespostaBruta extends RespostaClassificavel {
  /** Valor bruto do `Location` (só para decidir o redirecionamento do `GET /login`; nunca logado). */
  location: string | null;
}

const REDIRECIONAMENTOS = new Set([301, 302, 303, 307, 308]);

const KEYWORD_POR_CODIGO: Partial<Record<CodigoErro, string>> = {
  REDE: 'softdesk_rede',
  SESSAO_EXPIRADA: 'softdesk_sessao_expirada',
  CREDENCIAL: 'softdesk_login_recusado',
};

function caminhoDe(location: string | null, base: string): string | undefined {
  if (!location) return undefined;
  try {
    return new URL(location, base).pathname;
  } catch {
    return undefined;
  }
}

export class SoftdeskHttpGateway implements ISoftdeskGateway {
  private readonly base: string;
  private readonly logger: ILogger;
  private readonly relogio: IRelogio;
  private readonly timeoutMs: number;
  private readonly semaforo: Semaforo;
  private readonly contrato: ContratoDourado;
  private readonly observarForma?: OpcoesGateway['observarForma'];
  /** Campos novos já avisados neste processo (uma vez cada). */
  private readonly camposNovosAvisados = new Set<string>();

  constructor(opcoes: OpcoesGateway) {
    this.base = new URL(opcoes.baseUrl).origin;
    this.logger = opcoes.logger;
    this.relogio = opcoes.relogio ?? { agora: () => new Date() };
    this.timeoutMs = opcoes.timeoutMs ?? TIMEOUT_PADRAO_MS;
    this.semaforo = new Semaforo(opcoes.vagas ?? VAGAS_PADRAO);
    this.contrato = opcoes.contrato ?? CONTRATO_DOURADO;
    this.observarForma = opcoes.observarForma;
  }

  /** Maior número de chamadas simultâneas já feitas por este gateway. */
  get picoSimultaneas(): number {
    return this.semaforo.pico;
  }

  // -----------------------------------------------------------------------------------
  // ISoftdeskGateway
  // -----------------------------------------------------------------------------------

  async conferirPaginaLogin(sinal?: AbortSignal): Promise<void> {
    await this.naVaga(sinal, async () => {
      await this.paginaLogin(new CookieJar(), sinal);
    });
  }

  async autenticar(
    usuario: string,
    senha: string,
    perfil: PerfilLogin,
    sinal?: AbortSignal,
  ): Promise<SessaoHttp> {
    return this.naVaga(sinal, async () => {
      const jar = new CookieJar();
      await this.paginaLogin(jar, sinal);
      const xsrf = jar.obter('XSRF-TOKEN') as string;
      const urlLogin = `${this.base}/login`;
      const inicio = Date.now();
      const r = await this.requisitar(
        'login_post',
        urlLogin,
        {
          metodo: 'POST',
          cabecalhos: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            'X-XSRF-TOKEN': decodificar(xsrf),
            Referer: urlLogin,
          },
          corpo: JSON.stringify({
            lg_usuario: usuario,
            sh_usuario: senha,
            tp_usuario: perfil,
            resposta: '',
            redirect_by_url: '',
          }),
        },
        jar,
        sinal,
      );
      this.observar('login', r);
      this.concluir('login_post', r, classificarLogin('envio', r), inicio);
      return { cookies: jar.mapa, criadaEm: this.relogio.agora() };
    });
  }

  async pesquisar(
    sessao: SessaoHttp,
    filtro: FiltroPesquisa,
    sinal?: AbortSignal,
    opcoes: OpcoesPesquisaGateway = {},
  ): Promise<PaginaPesquisa> {
    const query = montarQuery(filtro);
    return this.naVaga(sinal, async () => {
      // O jar escreve direto no mapa da sessão: renovações de cookie ficam com ela.
      const jar = new CookieJar(sessao.cookies);
      const inicio = Date.now();
      const r = await this.requisitar(
        'pesquisa',
        `${this.base}/chamado/json?${query}`,
        { metodo: 'GET', cabecalhos: {} },
        jar,
        sinal,
      );
      const corpo = r.json as { lista: ChamadoBruto[]; treeview: { total: number } };
      let erro = classificarPesquisa(r);
      const conferencia = erro ? undefined : conferirLista(corpo.lista, this.contrato);
      if (conferencia && conferencia.essenciais.length > 0) {
        erro = new ErroSoftdesk('CONTRATO_ROTA_MUDOU', {
          evidencia: evidenciaDe(r),
          campos: conferencia.essenciais,
        });
      }
      this.observar('pesquisa', r);
      this.concluir('pesquisa', r, erro, inicio);
      if (!conferencia) throw new ErroSoftdesk('ERRO_INTERNO'); // inalcançável: concluir lança com erro
      this.registrarCamposNovos(conferencia.novos);
      if (conferencia.usados.length > 0) {
        this.avisar('Campo usado do SoftDesk ausente ou com tipo diferente', 'softdesk_deriva', 'deriva', {
          campos_deriva: conferencia.usados,
        });
      }
      const diagnostico = opcoes.diagnosticar ? diagnosticarLista(corpo.lista, this.contrato) : undefined;
      const outros =
        diagnostico === undefined
          ? []
          : [...diagnostico.ausentes, ...diagnostico.tipo_trocado].filter(
              (n) => this.contrato.pesquisa.item[n]?.marca === 'outro',
            );
      return {
        lista: corpo.lista,
        total: corpo.treeview.total,
        ...(conferencia.usados.length > 0 ? { deriva: conferencia.usados } : {}),
        ...(diagnostico && !semDiferenca(diagnostico) ? { diagnostico } : {}),
        ...(outros.length > 0 ? { diagnostico_outros: outros } : {}),
      };
    });
  }

  // -----------------------------------------------------------------------------------
  // Infraestrutura
  // -----------------------------------------------------------------------------------

  /** Segura uma vaga do semáforo; se `sinal` abortar na espera, é cancelamento (`REDE`). */
  private async naVaga<T>(sinal: AbortSignal | undefined, fn: () => Promise<T>): Promise<T> {
    try {
      return await this.semaforo.executar(fn, sinal);
    } catch (e) {
      if (ehErroSoftdesk(e)) throw e;
      if (sinal?.aborted) throw cancelada();
      throw e;
    }
  }

  /** `GET /login` com cookies no `jar`; confere o cookie XSRF. Lança o erro tipado. */
  private async paginaLogin(jar: CookieJar, sinal?: AbortSignal): Promise<void> {
    const inicio = Date.now();
    let url = `${this.base}/login`;
    let r!: RespostaBruta;
    for (let saltos = 0; ; saltos += 1) {
      r = await this.requisitar('login_get', url, { metodo: 'GET', cabecalhos: {} }, jar, sinal);
      const destino = REDIRECIONAMENTOS.has(r.status) ? this.destinoMesmaOrigem(url, r) : undefined;
      if (!destino || saltos >= MAX_REDIRECIONAMENTOS_LOGIN) break;
      url = destino;
    }
    r.temXsrf = jar.tem('XSRF-TOKEN');
    this.concluir('login_get', r, classificarLogin('pagina', r), inicio);
  }

  /** Só segue `Location` dentro da origem do SoftDesk (o jar não tem domínio). */
  private destinoMesmaOrigem(atual: string, r: RespostaBruta): string | undefined {
    if (!r.location) return undefined;
    try {
      const alvo = new URL(r.location, atual);
      return alvo.origin === this.base ? alvo.toString() : undefined;
    } catch {
      return undefined;
    }
  }

  private async requisitar(
    rota: Rota,
    url: string,
    req: { metodo: 'GET' | 'POST'; cabecalhos: Record<string, string>; corpo?: string },
    jar: CookieJar,
    sinal?: AbortSignal,
  ): Promise<RespostaBruta> {
    const limite = AbortSignal.timeout(this.timeoutMs);
    const sinais = sinal ? AbortSignal.any([sinal, limite]) : limite;
    const inicio = Date.now();
    try {
      const cabecalhos = { ...req.cabecalhos };
      const cookie = jar.cabecalho();
      if (cookie !== '') cabecalhos.Cookie = cookie;
      const res = await fetch(url, {
        method: req.metodo,
        headers: cabecalhos,
        body: req.corpo,
        redirect: 'manual',
        signal: sinais,
      });
      jar.guardarDe(res.headers);
      const texto = await res.text();
      let ehJson = false;
      let json: unknown;
      try {
        json = JSON.parse(texto);
        ehJson = true;
      } catch {
        // O texto do erro do JSON.parse traz o começo do corpo: não é guardado.
      }
      const location = res.headers.get('location');
      return {
        status: res.status,
        contentType: res.headers.get('content-type'),
        location,
        locationPath: caminhoDe(location, url),
        ehJson,
        json,
      };
    } catch (e) {
      // Nenhuma `message` de exceção segue adiante: só o código tipado (RN-13).
      const erro = sinal?.aborted ? cancelada() : new ErroSoftdesk('REDE');
      this.registrar(rota, undefined, erro, Date.now() - inicio);
      throw erro;
    }
  }

  /** Registra a chamada e, se houver erro, o lança. */
  private concluir(rota: Rota, r: RespostaBruta, erro: ErroSoftdesk | null, inicio: number): void {
    const duracao = Date.now() - inicio;
    this.registrar(rota, r.status, erro, duracao);
    if (erro) throw erro;
  }

  private registrar(rota: Rota, httpStatus: number | undefined, erro: ErroSoftdesk | null, duracaoMs: number): void {
    const campos: Record<string, unknown> = {
      event: { name: 'softdesk_http', action: 'request', outcome: erro ? 'failure' : 'success' },
      rota,
      duracao_ms: duracaoMs,
    };
    if (httpStatus !== undefined) campos.http_status = httpStatus;
    if (erro) {
      campos.codigo_erro = erro.codigo;
      const kw = KEYWORD_POR_CODIGO[erro.codigo];
      if (kw) campos.keywords = [kw];
      if (erro.evidencia) campos.evidencia = erro.evidencia;
      if (erro.campos) campos.campos_deriva = erro.campos;
    }
    this.escreverLog(erro ? 'warn' : 'info', erro ? 'Chamada ao SoftDesk falhou' : 'Chamada ao SoftDesk concluída', campos);
  }

  private observar(rota: 'login' | 'pesquisa', r: RespostaBruta): void {
    if (!this.observarForma || !r.ehJson) return;
    try {
      this.observarForma(rota, r.json);
    } catch {
      // a captura nunca derruba a chamada
    }
  }

  private registrarCamposNovos(novos: string[]): void {
    const inedito = novos.filter((n) => !this.camposNovosAvisados.has(n));
    if (inedito.length === 0) return;
    inedito.forEach((n) => this.camposNovosAvisados.add(n));
    this.avisar('Campo novo no item de pesquisa do SoftDesk', 'softdesk_campo_novo', 'campo_novo', {
      campos_deriva: inedito,
    });
  }

  private avisar(msg: string, keyword: string, acao: string, extra: Record<string, unknown>): void {
    this.escreverLog(keyword === 'softdesk_campo_novo' ? 'info' : 'warn', msg, {
      event: { name: 'softdesk_http', action: acao, outcome: 'success' },
      keywords: [keyword],
      ...extra,
    });
  }

  private escreverLog(nivel: 'info' | 'warn', msg: string, campos: Record<string, unknown>): void {
    try {
      this.logger[nivel](msg, campos as unknown as Parameters<ILogger['info']>[1]);
    } catch {
      // Log nunca derruba a chamada.
    }
  }
}

function cancelada(): ErroSoftdesk {
  return new ErroSoftdesk('REDE', { mensagem: 'A consulta ao SoftDesk foi cancelada.' });
}

function decodificar(valor: string): string {
  try {
    return decodeURIComponent(valor);
  } catch {
    return valor;
  }
}

/**
 * Monta a query de `GET /chamado/json` (ARCH-001 §7.1 e §16 A.2). Parâmetros fixos sempre
 * enviados; listas viram `campo[]=a&campo[]=b`. Status: só o conjunto exato {1} vai ao
 * servidor, como `EM_ATENDIMENTO`; qualquer outro é filtrado no cliente (RN-09).
 */
export function montarQuery(filtro: FiltroPesquisa): string {
  const pag = normalizarPaginacao({ inicio: filtro.inicio, limite: filtro.limite });
  const p = new URLSearchParams({
    cd_pasta: '8',
    pesq_cd_chamado: filtro.codigo === undefined ? '' : String(filtro.codigo),
    pesq_ds_chamado: filtro.palavra_chave ?? '',
    pesq_tp_pesquisa: '0',
    pesq_cd_area: String(filtro.area ?? 0),
    pesq_cd_usuario: String(filtro.solicitante ?? 0),
    pesq_cd_tecnico: '0',
    pesq_servico_chamado: String(filtro.servico ?? 0),
    pesq_tp_tag: '1',
    pesq_categoria_chamado: String(filtro.categoria ?? 0),
    pesq_descricao_categoria_chamado: filtro.descricao_categoria ?? '',
    pesq_bus_inativos: String(filtro.incluir_inativos ?? false),
    pesq_periodo: String(filtro.periodo ?? 0),
    pesq_periodo_ini: filtro.periodo_ini ?? '',
    pesq_periodo_fim: filtro.periodo_fim ?? '',
    pesq_termino_previsto_chamado: filtro.termino_previsto ?? '',
    pesq_flag_periodo: '1',
    tp_requisicao: 'PES_RESULTADO',
    tp_usuario: 'PES',
    cd_area: '0',
    cd_cliente: '0',
    cd_grupo_solucao: '0',
    start: String(pag.inicio),
    limit: String(pag.limite_aplicado),
  });
  const lista = (nome: string, valores: readonly (number | string)[] | undefined): void => {
    for (const v of valores ?? []) p.append(nome, String(v));
  };
  lista('pesq_cd_atendente[]', filtro.atendente);
  const status = new Set(filtro.status ?? []);
  if (status.size === 1 && status.has(1)) p.append('pesq_st_chamado[]', NOME_STATUS_EM_ATENDIMENTO);
  lista('pesq_prioridade_chamado[]', filtro.prioridade);
  lista('pesq_grupo_solucao_chamado[]', filtro.grupo_solucao);
  lista('pesq_tipo_chamado[]', filtro.tipo_chamado);
  lista('pesq_cd_cliente[]', filtro.cliente);
  return p.toString();
}
