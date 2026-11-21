import type { ChamadoBruto } from './chamado';

/**
 * Filtros de texto aplicados no cliente (RN-16, ADR-008).
 * O SoftDesk filtra por código; o nome vem do usuário, então a comparação é feita aqui,
 * sem diferenciar maiúsculas e acentos, e todas as palavras pedidas precisam aparecer no campo.
 */
export interface FiltroTexto {
  /** Nome de quem abriu o chamado (`nm_usuario`). */
  solicitante_nome?: string;
  /** Parte do título (`tt_chamado`). */
  titulo_contem?: string;
  /** Nome da prioridade (`ds_prioridade`). */
  prioridade_nome?: string;
  /** Nome do tipo de chamado (`ds_tipo_chamado`). */
  tipo_nome?: string;
}

export const CHAVES_FILTRO_TEXTO = [
  'solicitante_nome',
  'titulo_contem',
  'prioridade_nome',
  'tipo_nome',
] as const;

/** Campo do item do SoftDesk que cada filtro de texto compara. */
export const CAMPO_DO_FILTRO_TEXTO: Readonly<Record<keyof FiltroTexto, string>> = {
  solicitante_nome: 'nm_usuario',
  titulo_contem: 'tt_chamado',
  prioridade_nome: 'ds_prioridade',
  tipo_nome: 'ds_tipo_chamado',
};

/** Minúsculas, sem acento, espaços colapsados e sem as pontas. */
export function normalizarTexto(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function palavras(texto: string | undefined): string[] {
  if (typeof texto !== 'string') return [];
  const n = normalizarTexto(texto);
  return n === '' ? [] : n.split(' ');
}

/** Nomes dos filtros de texto realmente usados (texto não vazio), na ordem fixa. */
export function filtrosTextoUsados(filtro: FiltroTexto | undefined): (keyof FiltroTexto)[] {
  if (!filtro) return [];
  return CHAVES_FILTRO_TEXTO.filter((chave) => palavras(filtro[chave]).length > 0);
}

export function temFiltroTexto(filtro: FiltroTexto | undefined): boolean {
  return filtrosTextoUsados(filtro).length > 0;
}

/**
 * `true` quando o item satisfaz todos os filtros de texto informados (E entre os filtros e
 * entre as palavras de cada filtro). Filtro ausente ou vazio não restringe. Campo do item
 * ausente ou que não é texto não casa com nenhum filtro que o exija.
 */
export function casaTexto(item: ChamadoBruto, filtro: FiltroTexto | undefined): boolean {
  for (const chave of filtrosTextoUsados(filtro)) {
    const valor = item[CAMPO_DO_FILTRO_TEXTO[chave]];
    if (typeof valor !== 'string') return false;
    const campo = normalizarTexto(valor);
    for (const palavra of palavras(filtro![chave])) {
      if (!campo.includes(palavra)) return false;
    }
  }
  return true;
}
