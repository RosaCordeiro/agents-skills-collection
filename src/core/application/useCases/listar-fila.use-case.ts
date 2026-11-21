import type { ChamadoBasico } from '../../domain/entities/chamado';
import type { SessaoHttp } from '../../domain/entities/sessao';
import { normalizarPaginacao } from '../../domain/entities/filtro-pesquisa';
import { normalizarTexto, temFiltroTexto, CHAVES_FILTRO_TEXTO, type FiltroTexto } from '../../domain/entities/filtro-texto';
import type { Config } from '../../domain/entities/config';
import { ErroSoftdesk } from '../../domain/errors/erro-softdesk';
import {
  MAX_BYTES_TODAS,
  MAX_ITENS_TODAS,
  MAX_PAGINAS_TODAS,
  resultadoDaFila,
  type ParadaPor,
  type ResultadoFila,
} from '../../domain/services/fila.service';
import { validarEntrada, schemaFila } from '../../../shared/schemas/entrada.schemas';
import type { AlertaContrato } from '../services/alerta-contrato';
import type { ExigirSessao } from '../services/exigir-sessao';
import type { ExecutarOperacao, ResultadoConsulta } from '../services/operacao';
import type { Varredura } from '../services/varredura';

/** Dados da fila (ARCH-001 §6 F3). `total_softdesk` inclui fechados e é só informação. */
export interface DadosFila extends ResultadoFila {
  inicio: number;
  /** `null` no modo `todas` (não há limite por parte). */
  limite_aplicado: number | null;
  limite_pedido: number | null;
  filtro_texto_no_cliente: boolean;
  /** Só no modo `todas` (RF-03): ausentes sem `todas`, para o envelope anterior não mudar. */
  todas?: true;
  itens_devolvidos?: number;
  teto_itens?: number;
  parada_por?: ParadaPor | null;
}

/** Paginação normalizada; no modo `todas` não há limite por parte. */
interface Pag {
  inicio: number;
  limite_aplicado: number | null;
  limite_pedido: number | null;
  todas: boolean;
}

/** Tetos do modo `todas` (os testes os reduzem pelo container). */
export interface LimitesTodas {
  maxPaginas: number;
  maxItens: number;
  maxBytes: number;
}

export interface OpcoesExecucao {
  /** Quem chamou desistiu (por exemplo, a conexão REST fechou). */
  sinal?: AbortSignal;
}

interface Leitura {
  promessa: Promise<ResultadoConsulta<DadosFila>>;
  controle: AbortController;
  esperando: number;
  encerrada: boolean;
}

function cancelada(): ErroSoftdesk {
  return new ErroSoftdesk('REDE', { mensagem: 'A consulta ao SoftDesk foi cancelada.' });
}

/**
 * RF-03 (ARCH-001 §6 F3, RN-04, RN-09, RN-16, RNF-04): minha fila, lida por partes.
 * - uma leitura da fila por vez (a `Varredura` compartilhada com a pesquisa);
 * - leitura idêntica (mesma sessão, início, limite e filtros de texto) em andamento é compartilhada
 *   (a sessão faz parte da chave: quem entrou depois nunca se junta a uma leitura da sessão antiga);
 * - um `AbortController` por leitura, acionado quando todos que esperavam desistiram, quando a
 *   sessão é descartada, no prazo total ou em `cancelarTodas()`.
 */
export class ListarFilaUseCase {
  private readonly leituras = new Map<string, Leitura>();
  private readonly idsSessao = new WeakMap<SessaoHttp, number>();
  private proximoIdSessao = 1;

  constructor(
    private readonly deps: {
      config: Pick<Config, 'cdAtendente'>;
      exigirSessao: ExigirSessao;
      varredura: Varredura;
      operacao: ExecutarOperacao;
      alerta: AlertaContrato;
      limitesTodas?: LimitesTodas;
    },
  ) {}

  private get limites(): LimitesTodas {
    return this.deps.limitesTodas ?? { maxPaginas: MAX_PAGINAS_TODAS, maxItens: MAX_ITENS_TODAS, maxBytes: MAX_BYTES_TODAS };
  }

  async executar(entrada: unknown, opcoes: OpcoesExecucao = {}): Promise<ResultadoConsulta<DadosFila>> {
    return this.deps.operacao(
      {
        name: 'fila',
        action: 'scan',
        camposFim: (r) => ({
          paginas_lidas: r.dados.paginas_lidas,
          abertos: r.dados.itens.length,
          total_softdesk: r.dados.total_softdesk,
          incompleto: r.dados.incompleto,
          ...(r.dados.todas ? { todas: true, parada_por: r.dados.parada_por ?? null } : {}),
        }),
      },
      async () => {
        const e = validarEntrada(schemaFila, entrada);
        const pag: Pag = e.todas
          ? { inicio: normalizarPaginacao({ inicio: e.inicio }).inicio, limite_aplicado: null, limite_pedido: null, todas: true }
          : { ...normalizarPaginacao({ inicio: e.inicio, limite: e.limite }), todas: false };
        const texto: FiltroTexto = {
          solicitante_nome: e.solicitante_nome,
          titulo_contem: e.titulo_contem,
          prioridade_nome: e.prioridade_nome,
          tipo_nome: e.tipo_nome,
        };
        return this.deps.exigirSessao((sessao) =>
          this.lerCompartilhado(sessao, pag, texto, opcoes.sinal),
        );
      },
    );
  }

  /** Aborta todas as leituras em andamento (parada do serviço). */
  cancelarTodas(): void {
    for (const l of [...this.leituras.values()]) l.controle.abort();
    this.deps.varredura.cancelarTodas();
  }

  get leiturasEmAndamento(): number {
    return this.leituras.size;
  }

  private idDaSessao(sessao: SessaoHttp): number {
    let id = this.idsSessao.get(sessao);
    if (id === undefined) {
      id = this.proximoIdSessao++;
      this.idsSessao.set(sessao, id);
    }
    return id;
  }

  private chave(sessao: SessaoHttp, inicio: number, limite: number | null, texto: FiltroTexto, todas: boolean): string {
    const normal: Record<string, string> = {};
    for (const k of CHAVES_FILTRO_TEXTO) {
      const v = texto[k];
      if (typeof v === 'string' && normalizarTexto(v) !== '') normal[k] = normalizarTexto(v);
    }
    return JSON.stringify([this.idDaSessao(sessao), inicio, limite, normal, todas]);
  }

  private async lerCompartilhado(
    sessao: SessaoHttp,
    pag: Pag,
    texto: FiltroTexto,
    sinal: AbortSignal | undefined,
  ): Promise<ResultadoConsulta<DadosFila>> {
    if (sinal?.aborted) throw cancelada();
    const chave = this.chave(sessao, pag.inicio, pag.limite_aplicado, texto, pag.todas);
    let leitura = this.leituras.get(chave);
    if (!leitura || leitura.encerrada) {
      const controle = new AbortController();
      const nova: Leitura = {
        controle,
        esperando: 0,
        encerrada: false,
        promessa: undefined as unknown as Promise<ResultadoConsulta<DadosFila>>,
      };
      nova.promessa = this.ler(sessao, pag, texto, controle.signal).finally(() => {
        nova.encerrada = true;
        if (this.leituras.get(chave) === nova) this.leituras.delete(chave);
      });
      this.leituras.set(chave, nova);
      leitura = nova;
    }
    const alvo = leitura;
    alvo.esperando += 1;
    try {
      const r = await this.aguardar(alvo.promessa, sinal);
      // `limite_pedido` é do chamador (quem criou a leitura não o impõe a quem a compartilha).
      return { ...r, dados: { ...r.dados, limite_pedido: pag.limite_pedido } };
    } finally {
      alvo.esperando -= 1;
      if (alvo.esperando === 0 && !alvo.encerrada) {
        // Ninguém mais espera esta leitura: ela sai do mapa já e a consulta ao SoftDesk é cancelada.
        if (this.leituras.get(chave) === alvo) this.leituras.delete(chave);
        alvo.controle.abort();
      }
    }
  }

  private aguardar<T>(promessa: Promise<T>, sinal: AbortSignal | undefined): Promise<T> {
    if (!sinal) return promessa;
    return new Promise<T>((resolve, reject) => {
      const aoAbortar = (): void => reject(cancelada());
      sinal.addEventListener('abort', aoAbortar, { once: true });
      promessa.then(
        (v) => {
          sinal.removeEventListener('abort', aoAbortar);
          resolve(v);
        },
        (err) => {
          sinal.removeEventListener('abort', aoAbortar);
          reject(err);
        },
      );
    });
  }

  private async ler(
    sessao: SessaoHttp,
    pag: Pag,
    texto: FiltroTexto,
    sinal: AbortSignal,
  ): Promise<ResultadoConsulta<DadosFila>> {
    const { acumulador, deriva } = await this.deps.varredura.executar(
      sessao,
      { atendente: [this.deps.config.cdAtendente] },
      pag.inicio,
      {
        limite: pag.todas ? this.limites.maxItens : (pag.limite_aplicado as number),
        cdAtendente: this.deps.config.cdAtendente,
        somenteAbertos: true,
        filtroTexto: texto,
        ...(pag.todas ? { todas: true, maxPaginas: this.limites.maxPaginas, maxBytes: this.limites.maxBytes } : {}),
      },
      sinal,
    );
    const r = resultadoDaFila(acumulador);
    const dados: DadosFila = {
      ...r,
      itens: r.itens as ChamadoBasico[],
      inicio: pag.inicio,
      limite_aplicado: pag.limite_aplicado,
      limite_pedido: pag.limite_pedido,
      filtro_texto_no_cliente: temFiltroTexto(texto),
      ...(pag.todas
        ? {
            todas: true as const,
            itens_devolvidos: r.itens.length,
            teto_itens: this.limites.maxItens,
            parada_por: acumulador.paradaPor,
          }
        : {}),
    };
    const aviso = this.deps.alerta.avisoDeriva(deriva);
    return aviso ? { dados, aviso_deriva: aviso } : { dados };
  }
}

