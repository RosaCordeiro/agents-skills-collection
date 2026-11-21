import { paraBasico, type ChamadoBasico } from '../../domain/entities/chamado';
import {
  filtrosNaoConfirmados,
  normalizarPaginacao,
  type FiltroPesquisa,
} from '../../domain/entities/filtro-pesquisa';
import { filtrosTextoUsados, temFiltroTexto, type FiltroTexto } from '../../domain/entities/filtro-texto';
import { normalizarListaStatus } from '../../domain/entities/status';
import type { ISoftdeskGateway } from '../../domain/ports/softdesk.gateway';
import {
  MAX_BYTES_TODAS,
  MAX_ITENS_TODAS,
  MAX_PAGINAS_TODAS,
  resultadoDaFila,
  type ParadaPor,
} from '../../domain/services/fila.service';
import { schemaPesquisa, validarEntrada } from '../../../shared/schemas/entrada.schemas';
import type { AlertaContrato } from '../services/alerta-contrato';
import type { ExigirSessao } from '../services/exigir-sessao';
import type { ExecutarOperacao, ResultadoConsulta } from '../services/operacao';
import type { Varredura } from '../services/varredura';
import type { LimitesTodas, OpcoesExecucao } from './listar-fila.use-case';

/** Dados da pesquisa (ARCH-001 §6 F4). `total` é sempre `treeview.total`, antes do filtro no cliente. */
export interface DadosPesquisa {
  itens: ChamadoBasico[];
  total: number;
  inicio: number;
  /** `null` quando acabou e também quando não há filtro no cliente (a pesquisa só no servidor não continua). */
  proximo_inicio: number | null;
  /** `null` no modo `todas` (não há limite por parte). */
  limite_aplicado: number | null;
  limite_pedido: number | null;
  filtro_status_no_cliente: boolean;
  filtro_texto_no_cliente: boolean;
  /** `true` quando a leitura parou no teto de 15 páginas (só os 3.000 mais novos foram vistos). */
  incompleto: boolean;
  paginas_lidas: number;
  /** Nomes (nunca valores) dos filtros usados que não têm parâmetro de servidor confirmado (CA-09). */
  filtros_nao_confirmados: string[];
  /** Só no modo `todas` (RF-04): ausentes sem `todas`, para o envelope anterior não mudar. */
  todas?: true;
  itens_devolvidos?: number;
  teto_itens?: number;
  parada_por?: ParadaPor | null;
}

/**
 * RF-04 (ARCH-001 §6 F4): valida o filtro (sem chamar o SoftDesk se for inválido); `status` só
 * vai ao servidor quando o conjunto é exatamente {1} (`EM_ATENDIMENTO`); qualquer outro status e
 * os filtros de texto (RN-16) são aplicados no cliente com a leitura progressiva da fila.
 */
export class PesquisarUseCase {
  constructor(
    private readonly deps: {
      gateway: ISoftdeskGateway;
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

  async executar(entrada: unknown, opcoes: OpcoesExecucao = {}): Promise<ResultadoConsulta<DadosPesquisa>> {
    let usados: string[] = [];
    return this.deps.operacao(
      {
        name: 'pesquisa',
        action: 'search',
        camposFim: (r) => ({
          filtros_usados: usados,
          inicio: r.dados.inicio,
          limite_aplicado: r.dados.limite_aplicado,
          itens: r.dados.itens.length,
          total: r.dados.total,
          paginas_lidas: r.dados.paginas_lidas,
          incompleto: r.dados.incompleto,
          ...(r.dados.todas ? { todas: true, parada_por: r.dados.parada_por ?? null } : {}),
        }),
      },
      async () => {
        const e = validarEntrada(schemaPesquisa, entrada);
        const { solicitante_nome, titulo_contem, prioridade_nome, tipo_nome, inicio, limite, status, todas, ...resto } = e;
        const texto: FiltroTexto = { solicitante_nome, titulo_contem, prioridade_nome, tipo_nome };
        // `todas` e `limite` juntos já foram recusados pelo schema.
        const pag = normalizarPaginacao({ inicio, limite });
        const codigosStatus = status === undefined ? [] : normalizarListaStatus(status);
        const statusNoServidor = codigosStatus.length === 1 && codigosStatus[0] === 1;
        const statusNoCliente = codigosStatus.length > 0 && !statusNoServidor;

        const filtroServidor: FiltroPesquisa = { ...resto };
        if (statusNoServidor) filtroServidor.status = [1];
        const comStatus: FiltroPesquisa = { ...resto, ...(codigosStatus.length > 0 ? { status: codigosStatus } : {}) };
        const naoConfirmados = filtrosNaoConfirmados(comStatus);
        usados = [
          ...Object.entries(comStatus)
            .filter(([, v]) => v !== undefined && !(Array.isArray(v) && v.length === 0))
            .map(([k]) => k),
          ...filtrosTextoUsados(texto),
        ];

        const noCliente = todas === true || statusNoCliente || temFiltroTexto(texto);
        return this.deps.exigirSessao(async (sessao) => {
          if (!noCliente) {
            const pagina = await this.deps.gateway.pesquisar(
              sessao,
              { ...filtroServidor, inicio: pag.inicio, limite: pag.limite_aplicado },
              opcoes.sinal,
            );
            const aviso = this.deps.alerta.avisoDeriva(pagina.deriva);
            const dados: DadosPesquisa = {
              itens: pagina.lista.map(paraBasico),
              total: pagina.total,
              inicio: pag.inicio,
              proximo_inicio: null,
              limite_aplicado: pag.limite_aplicado,
              limite_pedido: pag.limite_pedido,
              filtro_status_no_cliente: false,
              filtro_texto_no_cliente: false,
              incompleto: false,
              paginas_lidas: 1,
              filtros_nao_confirmados: naoConfirmados,
            };
            return aviso ? { dados, aviso_deriva: aviso } : { dados };
          }
          const { acumulador, deriva } = await this.deps.varredura.executar(
            sessao,
            filtroServidor,
            pag.inicio,
            {
              limite: todas ? this.limites.maxItens : pag.limite_aplicado,
              statusAceitos: statusNoCliente ? new Set(codigosStatus) : undefined,
              filtroTexto: texto,
              ...(todas ? { todas: true, maxPaginas: this.limites.maxPaginas, maxBytes: this.limites.maxBytes } : {}),
            },
            opcoes.sinal,
          );
          const r = resultadoDaFila(acumulador);
          const aviso = this.deps.alerta.avisoDeriva(deriva);
          const dados: DadosPesquisa = {
            itens: r.itens,
            total: r.total_softdesk,
            inicio: pag.inicio,
            proximo_inicio: r.proximo_inicio,
            limite_aplicado: todas ? null : pag.limite_aplicado,
            limite_pedido: todas ? null : pag.limite_pedido,
            filtro_status_no_cliente: statusNoCliente,
            filtro_texto_no_cliente: temFiltroTexto(texto),
            incompleto: r.incompleto,
            paginas_lidas: r.paginas_lidas,
            filtros_nao_confirmados: naoConfirmados,
            ...(todas
              ? {
                  todas: true as const,
                  itens_devolvidos: r.itens.length,
                  teto_itens: this.limites.maxItens,
                  parada_por: acumulador.paradaPor,
                }
              : {}),
          };
          return aviso ? { dados, aviso_deriva: aviso } : { dados };
        });
      },
    );
  }
}
