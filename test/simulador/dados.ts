import type { ChamadoBruto } from '../../src/core/domain/entities/chamado';
import { statusPorCodigo } from '../../src/core/domain/entities/status';
import {
  CONTRATO_DOURADO,
  type ContratoDourado,
  type TipoCampo,
} from '../../src/infraestructure/softdesk/contrato';

/**
 * Dados do SoftDesk simulado. Tudo fictício: nomes inventados, nada vindo do SoftDesk real.
 * A forma do item é derivada do contrato dourado (66 campos, cada um com um tipo permitido),
 * então o simulador só diverge do contrato quando o teste manda (`deriva`).
 */

/** Valor neutro de um tipo (o primeiro tipo não nulo do conjunto; `null` se só há nulo). */
export function valorPadrao(tipos: readonly TipoCampo[]): unknown {
  const tipo = tipos.find((t) => t !== 'null') ?? 'null';
  switch (tipo) {
    case 'string':
      return '';
    case 'number':
      return 0;
    case 'boolean':
      return false;
    case 'array':
      return [];
    case 'object':
      return {};
    default:
      return null;
  }
}

/** Os campos que o serviço lê; o resto do item vem do contrato com valores neutros. */
export interface EspecChamado {
  cd_chamado: number;
  st_chamado: number;
  cd_atendente: number;
  nm_usuario?: string;
  tt_chamado?: string;
  ds_prioridade?: string;
  ds_tipo_chamado?: string;
  da_chamado?: string;
  ha_chamado?: string;
  qtd_interacoes?: number;
}

/** Monta o item completo (todos os campos do contrato) a partir da especificação. */
export function montarItem(spec: EspecChamado, contrato: ContratoDourado = CONTRATO_DOURADO): ChamadoBruto {
  const item: ChamadoBruto = {};
  for (const [nome, campo] of Object.entries(contrato.pesquisa.item)) {
    item[nome] = valorPadrao(campo.tipos);
  }
  item.cd_chamado = spec.cd_chamado;
  item.id_chamado = spec.cd_chamado;
  item.st_chamado = spec.st_chamado;
  item.ds_status = statusPorCodigo(spec.st_chamado)?.nome ?? 'Desconhecido';
  item.cd_atendente = spec.cd_atendente;
  item.nm_usuario = spec.nm_usuario ?? 'Usuária Fictícia';
  item.tt_chamado = spec.tt_chamado ?? `Chamado fictício ${spec.cd_chamado}`;
  item.ds_prioridade = spec.ds_prioridade ?? 'Média';
  item.ds_tipo_chamado = spec.ds_tipo_chamado ?? 'Incidente';
  item.da_chamado = spec.da_chamado ?? '2026-01-15';
  item.ha_chamado = spec.ha_chamado ?? '09:30:00';
  item.qtd_interacoes = spec.qtd_interacoes ?? 1;
  return item;
}

/** Nomes inventados para a massa (com e sem acento, para os filtros de texto). */
export const SOLICITANTES_FICTICIOS: readonly string[] = [
  'Marlene Figueira',
  'Tobias Albuquerque',
  'Cecília Montenegro',
  'Hélio Pires',
  'Ingrid Valadares',
  'Otávio Brandão',
];

export interface GrupoMassa {
  cdAtendente: number;
  status: number;
  quantidade: number;
  /** Nomes de solicitante, usados em rodízio. Padrão: `SOLICITANTES_FICTICIOS`. */
  solicitantes?: readonly string[];
  prioridade?: string;
  tipo?: string;
  /** Prefixo do título (o código é acrescentado). */
  titulo?: string;
}

export interface OpcoesMassa {
  /** Semente do embaralhamento (resultado reproduzível). */
  semente?: number;
  /** Código do chamado mais novo (os demais descem de um em um). */
  codigoMaisNovo?: number;
  /** `false` mantém os grupos em bloco, na ordem dada. */
  embaralhar?: boolean;
}

function sorteador(semente: number): () => number {
  let s = semente >>> 0 || 1;
  return () => {
    // LCG de Numerical Recipes: suficiente para embaralhar dados de teste.
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

/**
 * Gera N chamados por atendente e status. A lista sai do mais novo para o mais antigo, como o
 * SoftDesk, com os grupos misturados (abertos e fechados espalhados por várias páginas).
 */
export function gerarMassa(grupos: readonly GrupoMassa[], opcoes: OpcoesMassa = {}): EspecChamado[] {
  const rascunho: Omit<EspecChamado, 'cd_chamado'>[] = [];
  for (const g of grupos) {
    const nomes = g.solicitantes && g.solicitantes.length > 0 ? g.solicitantes : SOLICITANTES_FICTICIOS;
    for (let i = 0; i < g.quantidade; i += 1) {
      rascunho.push({
        st_chamado: g.status,
        cd_atendente: g.cdAtendente,
        nm_usuario: nomes[i % nomes.length],
        ds_prioridade: g.prioridade,
        ds_tipo_chamado: g.tipo,
        tt_chamado: g.titulo,
      });
    }
  }
  if (opcoes.embaralhar !== false) {
    const rnd = sorteador(opcoes.semente ?? 7);
    for (let i = rascunho.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rnd() * (i + 1));
      [rascunho[i], rascunho[j]] = [rascunho[j], rascunho[i]];
    }
  }
  const maisNovo = opcoes.codigoMaisNovo ?? 3_000_000;
  return rascunho.map((r, i) => {
    const cd = maisNovo - i;
    return {
      ...r,
      cd_chamado: cd,
      tt_chamado: r.tt_chamado ? `${r.tt_chamado} ${cd}` : undefined,
    };
  });
}
