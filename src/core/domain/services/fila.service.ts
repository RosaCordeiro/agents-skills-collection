import { paraBasico, type ChamadoBasico } from '../entities/chamado';
import { casaTexto, type FiltroTexto } from '../entities/filtro-texto';
import { estaAberto } from '../entities/status';
import type { PaginaPesquisa } from '../ports/softdesk.gateway';

/**
 * Leitura progressiva da fila (ARCH-001 §6 F3, RN-04, RN-09). Funções puras sobre páginas já
 * lidas: quem lê do SoftDesk (caso de uso) chama `acumularPagina` página a página até
 * `acumulador.concluido`. Sem estado entre chamadas: a continuação é só `proximo_inicio`.
 */

/** Itens por página lida do SoftDesk e teto de páginas por chamada (RN-09). */
export const TAMANHO_PAGINA_VARREDURA = 200;
export const MAX_PAGINAS_VARREDURA = 15;
/** Modo `todas` (RN-09): teto de páginas lidas e de itens devolvidos por chamada (o prazo é o da varredura, 90 s). */
export const MAX_PAGINAS_TODAS = 15;
export const MAX_ITENS_TODAS = 300;
/** Tamanho máximo (bytes do JSON dos itens) de uma resposta `todas`: cabe numa resposta de tool MCP. */
export const MAX_BYTES_TODAS = 60_000;

/** Por que uma leitura `todas` parou antes do fim (`null` = leu tudo). */
export type ParadaPor = 'paginas' | 'itens' | 'prazo' | 'tamanho';

export interface ParametrosVarredura {
  /** Quantos itens juntar antes de parar (já com o teto de 200 aplicado). */
  limite: number;
  /** Se informado, descarta itens de outro atendente (defesa contra filtro ignorado). */
  cdAtendente?: number;
  /** Descarta os fechados {2,3,4,6} (a fila). */
  somenteAbertos?: boolean;
  /** Se informado, só passam itens com um destes status (pesquisa por status no cliente). */
  statusAceitos?: ReadonlySet<number>;
  /** Filtros de texto de RN-16. */
  filtroTexto?: FiltroTexto;
  tamanhoPagina?: number;
  maxPaginas?: number;
  /** Modo `todas`: parar por teto de itens (com mais por ler) também é `incompleto`. */
  todas?: boolean;
  /** Modo `todas`: para antes de passar deste tamanho (bytes do JSON dos itens). */
  maxBytes?: number;
}

export interface AcumuladorFila {
  itens: ChamadoBasico[];
  /** Códigos já aceitos: a página desloca quando entra chamado novo durante a leitura. */
  vistos: Set<number>;
  /** Posição do SoftDesk logo após a última página lida (ponto de continuação sem corte). */
  posicao: number;
  paginasLidas: number;
  /** `treeview.total` da primeira página; inclui os fechados. `null` antes da primeira página. */
  totalSoftdesk: number | null;
  /** Posição do SoftDesk onde a leitura seguinte começa; `null` quando acabou. */
  proximoInicio: number | null;
  /** `true` quando o teto de páginas foi atingido sem juntar `limite` e ainda há itens. */
  incompleto: boolean;
  /** `true` quando não é preciso ler mais páginas. */
  concluido: boolean;
  /** Motivo da parada antes do fim (só o modo `todas` o informa ao chamador). */
  paradaPor: ParadaPor | null;
  /** Bytes do array JSON dos itens aceitos até agora, colchetes e vírgulas incluídos (só medido com `maxBytes`). */
  bytes: number;
}

export interface ResultadoFila {
  itens: ChamadoBasico[];
  proximo_inicio: number | null;
  total_softdesk: number;
  paginas_lidas: number;
  incompleto: boolean;
}

export function novoAcumulador(inicio = 0): AcumuladorFila {
  return {
    itens: [],
    vistos: new Set(),
    posicao: inicio,
    paginasLidas: 0,
    totalSoftdesk: null,
    proximoInicio: null,
    incompleto: false,
    concluido: false,
    paradaPor: null,
    bytes: 1, // os colchetes do array JSON
  };
}

function aceita(item: Record<string, unknown>, p: ParametrosVarredura): boolean {
  if (p.cdAtendente !== undefined && item.cd_atendente !== p.cdAtendente) return false;
  const st = item.st_chamado;
  if (p.somenteAbertos && (typeof st !== 'number' || !estaAberto(st))) return false;
  if (p.statusAceitos && (typeof st !== 'number' || !p.statusAceitos.has(st))) return false;
  return casaTexto(item, p.filtroTexto);
}

/** `true` se algum item depois de `indice` na página ainda seria aceito (não visto e que passa nos filtros). */
function haAceitoDepois(
  pagina: PaginaPesquisa,
  indice: number,
  acumulador: AcumuladorFila,
  parametros: ParametrosVarredura,
): boolean {
  for (let k = indice + 1; k < pagina.lista.length; k += 1) {
    const item = pagina.lista[k];
    if (typeof item.cd_chamado !== 'number' || acumulador.vistos.has(item.cd_chamado)) continue;
    if (aceita(item, parametros)) return true;
  }
  return false;
}

/**
 * Incorpora uma página ao acumulador (altera e devolve o mesmo objeto). Ordem das regras,
 * por item: repetido, outro atendente, status, texto. Itens sem `cd_chamado` numérico são
 * ignorados (o gateway já recusou a resposta se o campo essencial faltasse).
 */
export function acumularPagina(
  acumulador: AcumuladorFila,
  pagina: PaginaPesquisa,
  parametros: ParametrosVarredura,
): AcumuladorFila {
  if (acumulador.concluido) return acumulador;
  const tamanho = parametros.tamanhoPagina ?? TAMANHO_PAGINA_VARREDURA;
  const maxPaginas = parametros.maxPaginas ?? MAX_PAGINAS_VARREDURA;

  acumulador.paginasLidas += 1;
  if (acumulador.totalSoftdesk === null) acumulador.totalSoftdesk = pagina.total;
  const total = acumulador.totalSoftdesk;

  for (let indice = 0; indice < pagina.lista.length; indice += 1) {
    const item = pagina.lista[indice];
    const codigo = item.cd_chamado;
    if (typeof codigo !== 'number' || acumulador.vistos.has(codigo)) continue;
    if (!aceita(item, parametros)) continue;
    const basico = paraBasico(item);
    if (parametros.maxBytes !== undefined) {
      const tamanhoItem = Buffer.byteLength(JSON.stringify(basico)) + 1;
      if (acumulador.itens.length > 0 && acumulador.bytes + tamanhoItem > parametros.maxBytes) {
        // Este item não cabe: a continuação começa nele.
        acumulador.incompleto = true;
        acumulador.paradaPor = 'tamanho';
        acumulador.proximoInicio = acumulador.posicao + indice;
        acumulador.posicao += pagina.lista.length;
        acumulador.concluido = true;
        return acumulador;
      }
      acumulador.bytes += tamanhoItem;
    }
    acumulador.itens.push(basico);
    acumulador.vistos.add(codigo);
    if (acumulador.itens.length >= parametros.limite) {
      // Continua logo depois deste item; se era o último do SoftDesk, acabou.
      const proximo = acumulador.posicao + indice + 1;
      // Fim real: passou do total ou é o último item de uma página curta (o total pode ter encolhido na leitura).
      // (página curta e nenhum dos itens seguintes dela seria aceito: a continuação voltaria vazia)
      const fimReal = pagina.lista.length < tamanho && !haAceitoDepois(pagina, indice, acumulador, parametros);
      acumulador.proximoInicio = proximo >= total || fimReal ? null : proximo;
      if (parametros.todas && acumulador.proximoInicio !== null) {
        acumulador.incompleto = true;
        acumulador.paradaPor = 'itens';
      }
      acumulador.posicao += pagina.lista.length;
      acumulador.concluido = true;
      return acumulador;
    }
  }

  acumulador.posicao += pagina.lista.length;
  if (pagina.lista.length < tamanho || acumulador.posicao >= total) {
    acumulador.proximoInicio = null;
    acumulador.concluido = true;
  } else if (acumulador.paginasLidas >= maxPaginas) {
    acumulador.incompleto = true;
    acumulador.paradaPor = 'paginas';
    acumulador.proximoInicio = acumulador.posicao;
    acumulador.concluido = true;
  }
  return acumulador;
}

export function resultadoDaFila(acumulador: AcumuladorFila): ResultadoFila {
  return {
    itens: acumulador.itens,
    proximo_inicio: acumulador.proximoInicio,
    total_softdesk: acumulador.totalSoftdesk ?? 0,
    paginas_lidas: acumulador.paginasLidas,
    incompleto: acumulador.incompleto,
  };
}
