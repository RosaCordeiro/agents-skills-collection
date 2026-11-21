import { ErroSoftdesk } from '../errors/erro-softdesk';
import { normalizarTexto } from './filtro-texto';

/**
 * Catálogo fixo dos 14 status do SoftDesk (ARCH-001 §16 A.3; fonte: `listar_status_chamado`
 * do MCP oficial, conferido em 19/11/2026). O código 12 não existe.
 */
export interface StatusChamado {
  codigo: number;
  nome: string;
}

export const CATALOGO_STATUS: readonly StatusChamado[] = [
  { codigo: 0, nome: 'Novo (sem categoria)' },
  { codigo: 1, nome: 'Em atendimento' },
  { codigo: 2, nome: 'Encerrado' },
  { codigo: 3, nome: 'Fechado pelo usuário' },
  { codigo: 4, nome: 'Fechado pelo administrador da área' },
  { codigo: 5, nome: 'Contestado' },
  { codigo: 6, nome: 'Fechado por decurso de prazo' },
  { codigo: 7, nome: 'Agendado' },
  { codigo: 8, nome: 'Aguardando solicitante' },
  { codigo: 9, nome: 'Encaminhado para fornecedor' },
  { codigo: 10, nome: 'Aguardando aprovação' },
  { codigo: 11, nome: 'Reprovado' },
  { codigo: 13, nome: 'Agendado com fornecedor' },
  { codigo: 14, nome: 'Finalizado pelo fornecedor' },
];

/** Mesma regra de "fechado" do `clamed.dev` (RN-04). */
export const STATUS_FECHADOS: ReadonlySet<number> = new Set([2, 3, 4, 6]);

/** Único nome de status que o servidor aceita no filtro, validado (Q-01). */
export const NOME_STATUS_EM_ATENDIMENTO = 'EM_ATENDIMENTO';

export function estaAberto(codigo: number): boolean {
  return !STATUS_FECHADOS.has(codigo);
}

export function statusPorCodigo(codigo: number): StatusChamado | undefined {
  return CATALOGO_STATUS.find((s) => s.codigo === codigo);
}

/** Compara ignorando caixa, acento e a diferença entre espaço e sublinhado. */
function chaveDeNome(nome: string): string {
  return normalizarTexto(nome.replace(/_/g, ' '));
}

const POR_NOME: ReadonlyMap<string, number> = new Map(
  CATALOGO_STATUS.map((s) => [chaveDeNome(s.nome), s.codigo] as const),
);

function invalido(): ErroSoftdesk {
  return new ErroSoftdesk('FILTRO_INVALIDO', {
    mensagem: 'Status desconhecido: use um código de 0 a 14 (sem o 12) ou o nome do catálogo.',
    campos: ['status'],
  });
}

/**
 * Converte código (número ou texto com dígitos) ou nome do catálogo para o código.
 * Valor fora do catálogo lança `FILTRO_INVALIDO` (o valor informado não entra no erro).
 */
export function normalizarStatus(valor: number | string): number {
  if (typeof valor === 'number') {
    if (Number.isInteger(valor) && statusPorCodigo(valor)) return valor;
    throw invalido();
  }
  if (typeof valor !== 'string') throw invalido();
  const texto = valor.trim();
  if (/^\d{1,3}$/.test(texto)) {
    const codigo = Number(texto);
    if (statusPorCodigo(codigo)) return codigo;
    throw invalido();
  }
  const codigo = POR_NOME.get(chaveDeNome(texto));
  if (codigo === undefined) throw invalido();
  return codigo;
}

/** Conjunto sem repetidos, na ordem de entrada. */
export function normalizarListaStatus(valores: readonly (number | string)[]): number[] {
  return [...new Set(valores.map(normalizarStatus))];
}
