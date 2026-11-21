import type { FiltroPesquisa } from '../../domain/entities/filtro-pesquisa';
import type { SessaoHttp } from '../../domain/entities/sessao';
import { ErroSoftdesk } from '../../domain/errors/erro-softdesk';
import type { ISessaoStore } from '../../domain/ports/sessao.store';
import type { ISoftdeskGateway } from '../../domain/ports/softdesk.gateway';
import {
  TAMANHO_PAGINA_VARREDURA,
  acumularPagina,
  novoAcumulador,
  type AcumuladorFila,
  type ParametrosVarredura,
} from '../../domain/services/fila.service';

/**
 * Leitura progressiva de páginas do SoftDesk (ARCH-001 §6 F3 e F4, RN-09, RNF-04, RNF-05).
 * Compartilhada pela fila e pela pesquisa com filtro no cliente:
 * - uma varredura por vez no processo (as demais esperam a vez, em ordem);
 * - prazo total por varredura (conta DESDE a chegada do pedido, incluindo a espera pela vez: a
 *   resposta nunca passa do prazo, e o cliente MCP nunca corta antes por isso);
 * - cancelamento por sinal externo, por `cancelarTodas()` (parada do serviço) e quando a sessão
 *   usada deixa de ser a sessão do processo (descartada ou substituída);
 * - qualquer erro numa página encerra a leitura com esse erro (sem resultado parcial);
 * - EXCEÇÃO, só no modo `todas` (RN-09): prazo vencido depois de ao menos uma página lida devolve o que
 *   foi lido, com `incompleto` e `parada_por: 'prazo'` (nunca erro nem parcial silencioso). Sem nenhuma
 *   página lida, ou sem `todas`, o prazo continua sendo `REDE`.
 */

export interface DepsVarredura {
  gateway: ISoftdeskGateway;
  sessao: ISessaoStore;
  /** Prazo total de uma varredura, em ms (`prazoVarreduraSegundos`). */
  prazoMs: number;
  /** Intervalo de conferência da sessão durante a leitura, em ms (padrão 50). */
  intervaloSessaoMs?: number;
}

export interface ResultadoVarredura {
  acumulador: AcumuladorFila;
  /** Nomes dos campos usados que faltaram ou mudaram de tipo em alguma página (sem repetidos). */
  deriva: string[];
}

export const MENSAGEM_PRAZO = 'A leitura excedeu o tempo.';

function cancelada(): ErroSoftdesk {
  return new ErroSoftdesk('REDE', { mensagem: 'A consulta ao SoftDesk foi cancelada.' });
}

interface Vez {
  liberar: () => void;
}

export class Varredura {
  private ocupada = false;
  private readonly fila: Array<{ entregar: () => void }> = [];
  private readonly ativos = new Set<AbortController>();

  constructor(private readonly deps: DepsVarredura) {}

  /** Varreduras em andamento ou esperando a vez. */
  get emAndamento(): number {
    return this.ativos.size;
  }

  /** Aborta todas as varreduras (parada do serviço). */
  cancelarTodas(): void {
    for (const c of [...this.ativos]) c.abort();
  }

  /**
   * Lê páginas de 200 a partir de `inicio` até juntar `params.limite` itens, acabar ou chegar a
   * 15 páginas. `filtroBase` leva os filtros de servidor; `inicio` e `limite` são sobrescritos.
   */
  async executar(
    sessao: SessaoHttp,
    filtroBase: FiltroPesquisa,
    inicio: number,
    params: ParametrosVarredura,
    sinalExterno?: AbortSignal,
  ): Promise<ResultadoVarredura> {
    const controle = new AbortController();
    this.ativos.add(controle);
    const aoAbortar = (): void => controle.abort();
    if (sinalExterno?.aborted) controle.abort();
    else sinalExterno?.addEventListener('abort', aoAbortar, { once: true });
    // O prazo é armado na chegada do pedido: vale para a espera pela vez e para a leitura.
    let estourou = false;
    const prazo = setTimeout(() => {
      estourou = true;
      controle.abort();
    }, this.deps.prazoMs);
    prazo.unref?.();
    try {
      const vez = await this.esperarVez(controle.signal);
      try {
        return await this.ler(
          sessao,
          filtroBase,
          inicio,
          params,
          controle.signal,
          () => estourou && !sinalExterno?.aborted,
        );
      } finally {
        vez.liberar();
      }
    } catch (e) {
      // Sessão que caiu continua sendo SESSAO_EXPIRADA; qualquer outro desfecho com o prazo vencido é prazo.
      if (estourou && !(e instanceof ErroSoftdesk && e.codigo === 'SESSAO_EXPIRADA')) {
        throw new ErroSoftdesk('REDE', { mensagem: MENSAGEM_PRAZO });
      }
      throw e;
    } finally {
      clearTimeout(prazo);
      sinalExterno?.removeEventListener('abort', aoAbortar);
      this.ativos.delete(controle);
    }
  }

  private esperarVez(sinal: AbortSignal): Promise<Vez> {
    if (sinal.aborted) return Promise.reject(cancelada());
    const liberar = (): void => {
      const proxima = this.fila.shift();
      if (proxima) proxima.entregar();
      else this.ocupada = false;
    };
    if (!this.ocupada) {
      this.ocupada = true;
      return Promise.resolve({ liberar });
    }
    return new Promise<Vez>((resolve, reject) => {
      const espera = {
        entregar: () => {
          sinal.removeEventListener('abort', aoAbortar);
          resolve({ liberar });
        },
      };
      const aoAbortar = (): void => {
        const i = this.fila.indexOf(espera);
        if (i >= 0) this.fila.splice(i, 1);
        reject(cancelada());
      };
      sinal.addEventListener('abort', aoAbortar, { once: true });
      this.fila.push(espera);
    });
  }

  private async ler(
    sessao: SessaoHttp,
    filtroBase: FiltroPesquisa,
    inicio: number,
    params: ParametrosVarredura,
    sinalExterno: AbortSignal,
    prazoVencido: () => boolean,
  ): Promise<ResultadoVarredura> {
    const interno = new AbortController();
    const sinal = AbortSignal.any([sinalExterno, interno.signal]);
    let sessaoCaiu = false;
    const vigia = setInterval(() => {
      if (this.deps.sessao.obter() !== sessao) {
        sessaoCaiu = true;
        interno.abort();
      }
    }, this.deps.intervaloSessaoMs ?? 50);
    vigia.unref?.();

    const acumulador = novoAcumulador(inicio);
    const deriva = new Set<string>();
    const tamanho = params.tamanhoPagina ?? TAMANHO_PAGINA_VARREDURA;
    // Modo `todas`: prazo vencido com páginas já lidas encerra com o parcial (e não com erro).
    const paradaPorPrazo = (): boolean => {
      if (!params.todas || acumulador.paginasLidas === 0 || sessaoCaiu || !prazoVencido()) return false;
      acumulador.incompleto = true;
      acumulador.paradaPor = 'prazo';
      acumulador.proximoInicio = acumulador.posicao;
      acumulador.concluido = true;
      return true;
    };
    try {
      while (!acumulador.concluido) {
        if (this.deps.sessao.obter() !== sessao) sessaoCaiu = true;
        if (sessaoCaiu) break;
        if (sinal.aborted) break;
        const pagina = await this.deps.gateway.pesquisar(
          sessao,
          { ...filtroBase, inicio: acumulador.posicao, limite: tamanho },
          sinal,
        );
        for (const campo of pagina.deriva ?? []) deriva.add(campo);
        acumularPagina(acumulador, pagina, params);
      }
      if (!acumulador.concluido && !paradaPorPrazo()) this.lancarMotivo(sessaoCaiu);
      return { acumulador, deriva: [...deriva] };
    } catch (e) {
      if (sessaoCaiu) this.lancarMotivo(sessaoCaiu);
      if (e instanceof ErroSoftdesk && e.codigo === 'REDE' && paradaPorPrazo()) {
        return { acumulador, deriva: [...deriva] };
      }
      throw e;
    } finally {
      clearInterval(vigia);
    }
  }

  private lancarMotivo(sessaoCaiu: boolean): never {
    if (sessaoCaiu) throw new ErroSoftdesk('SESSAO_EXPIRADA');
    throw cancelada();
  }
}
