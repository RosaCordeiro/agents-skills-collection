import {
  TIPOS_CAMPO,
  carregarContrato,
  compararItem,
  tipoAceito,
  tipoDe,
  type ContratoDourado,
  type MapaCampos,
  type TipoCampo,
} from './contrato';

/**
 * Forma (só nomes e tipos, nunca valores) das respostas do SoftDesk e comparação com o contrato
 * dourado (ARCH-001 §17 camada 6, VAL-32). Funções puras: quem captura (`cli-capturar-forma`)
 * entrega os JSONs recebidos e aqui sai apenas nome de campo e conjunto de tipos.
 */

export type MapaTipos = Record<string, TipoCampo[]>;

export interface FormaObservada {
  /** `null` quando o login não foi observado. */
  login: MapaTipos | null;
  /** Cada escopo da pesquisa é `null` quando não houve o que observar. */
  topo: MapaTipos | null;
  treeview: MapaTipos | null;
  item: MapaTipos | null;
}

export const ESCOPOS = ['login', 'topo', 'treeview', 'item'] as const;
export type Escopo = (typeof ESCOPOS)[number];

export const NOME_ESCOPO: Readonly<Record<Escopo, string>> = {
  login: 'login',
  topo: 'pesquisa.topo',
  treeview: 'pesquisa.treeview',
  item: 'pesquisa.item',
};

const ehObjeto = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);

const ordemTipo = (t: TipoCampo): number => TIPOS_CAMPO.indexOf(t);

/** Nomes e conjunto de tipos observados nos objetos (valores descartados). */
export function mapaDeTipos(objetos: readonly Record<string, unknown>[]): MapaTipos {
  const conjuntos = new Map<string, Set<TipoCampo>>();
  for (const o of objetos) {
    for (const [nome, valor] of Object.entries(o)) {
      let c = conjuntos.get(nome);
      if (!c) conjuntos.set(nome, (c = new Set()));
      c.add(tipoDe(valor));
    }
  }
  const saida: MapaTipos = {};
  for (const nome of [...conjuntos.keys()].sort()) {
    saida[nome] = [...(conjuntos.get(nome) as Set<TipoCampo>)].sort((a, b) => ordemTipo(a) - ordemTipo(b));
  }
  return saida;
}

/** Forma da resposta de pesquisa: topo (com `lista` como array), `treeview` e itens da lista. */
export function formaDaPesquisa(json: unknown): Pick<FormaObservada, 'topo' | 'treeview' | 'item'> {
  if (!ehObjeto(json)) return { topo: null, treeview: null, item: null };
  const itens = Array.isArray(json.lista) ? json.lista.filter(ehObjeto) : [];
  return {
    topo: mapaDeTipos([json]),
    treeview: ehObjeto(json.treeview) ? mapaDeTipos([json.treeview]) : null,
    // Sem itens não há o que dizer da forma do item (a captura avisa).
    item: itens.length > 0 ? mapaDeTipos(itens) : null,
  };
}

export function formaDoLogin(json: unknown): MapaTipos | null {
  return ehObjeto(json) ? mapaDeTipos([json]) : null;
}

// --- comparação ---------------------------------------------------------------------

export interface TipoTrocado {
  nome: string;
  esperado: TipoCampo[];
  observado: TipoCampo[];
}

export interface DiferencaEscopo {
  novos: Array<{ nome: string; tipos: TipoCampo[] }>;
  ausentes: string[];
  tipo_trocado: TipoTrocado[];
}

export type Diferenca = Partial<Record<Escopo, DiferencaEscopo>>;

const camposDoEscopo = (c: ContratoDourado, e: Escopo): MapaCampos =>
  e === 'login'
    ? c.login.campos
    : e === 'topo'
      ? c.pesquisa.topo
      : e === 'treeview'
        ? c.pesquisa.treeview
        : c.pesquisa.item;

/** Contrato mínimo cujo "item" é o escopo escolhido: assim `compararItem` serve a todos os escopos. */
function contratoDoEscopo(campos: MapaCampos): ContratoDourado {
  return { versao: 1, login: { campos: {} }, pesquisa: { topo: {}, treeview: {}, item: campos } };
}

function valorDoTipo(tipo: TipoCampo): unknown {
  switch (tipo) {
    case 'array':
      return [];
    case 'boolean':
      return false;
    case 'null':
      return null;
    case 'number':
      return 0;
    case 'object':
      return {};
    case 'string':
      return '';
  }
}

/**
 * Compara a forma observada com o dourado. Cada escopo observado vira novos, ausentes e tipo trocado.
 * Um campo só é "ausente" quando nenhuma amostra o trouxe; "tipo trocado" quando algum tipo
 * observado não está no conjunto do dourado.
 */
export function compararForma(forma: FormaObservada, contrato: ContratoDourado): Diferenca {
  const saida: Diferenca = {};
  for (const escopo of ESCOPOS) {
    const observado = forma[escopo];
    if (!observado) continue;
    const esperado = camposDoEscopo(contrato, escopo);
    // Amostra sintética (um valor do primeiro tipo de cada campo) para reaproveitar `compararItem`
    // nos nomes novos e ausentes; os tipos são conferidos aqui, no conjunto inteiro observado.
    const amostra: Record<string, unknown> = {};
    for (const [nome, tipos] of Object.entries(observado)) amostra[nome] = valorDoTipo(tipos[0]);
    const base = compararItem(amostra, contratoDoEscopo(esperado));
    const tiposFora: TipoTrocado[] = [];
    for (const [nome, tipos] of Object.entries(observado)) {
      const campo = esperado[nome];
      if (!campo) continue;
      if (tipos.some((t) => !tipoAceito(campo, t))) {
        tiposFora.push({ nome, esperado: [...campo.tipos], observado: [...tipos] });
      }
    }
    saida[escopo] = {
      novos: [...base.novos].sort().map((nome) => ({ nome, tipos: observado[nome] })),
      ausentes: base.desvios
        .filter((d) => d.motivo === 'ausente')
        .map((d) => d.nome)
        .sort(),
      tipo_trocado: tiposFora.sort((a, b) => a.nome.localeCompare(b.nome)),
    };
  }
  return saida;
}

export const temDiferenca = (d: Diferenca): boolean =>
  Object.values(d).some((e) => e && (e.novos.length > 0 || e.ausentes.length > 0 || e.tipo_trocado.length > 0));

/** Texto para o terminal: só nomes de campo e tipos. */
export function descreverDiferenca(forma: FormaObservada, d: Diferenca): string[] {
  const linhas: string[] = [];
  for (const escopo of ESCOPOS) {
    const nome = NOME_ESCOPO[escopo];
    const e = d[escopo];
    if (!e) {
      linhas.push(`${nome}: nao capturado${escopo === 'item' && forma.topo ? ' (a pesquisa nao trouxe itens)' : ''}`);
      continue;
    }
    if (e.novos.length + e.ausentes.length + e.tipo_trocado.length === 0) {
      linhas.push(`${nome}: igual ao contrato dourado`);
      continue;
    }
    linhas.push(`${nome}:`);
    for (const n of e.novos) linhas.push(`  NOVO     ${n.nome} (${n.tipos.join(', ')})`);
    for (const n of e.ausentes) linhas.push(`  AUSENTE  ${n}`);
    for (const t of e.tipo_trocado) {
      linhas.push(`  TIPO     ${t.nome}: esperado [${t.esperado.join(', ')}], observado [${t.observado.join(', ')}]`);
    }
  }
  return linhas;
}

// --- arquivos -----------------------------------------------------------------------

export interface FormaAtualArquivo {
  versao: 1;
  capturado_em: string;
  login?: { campos: MapaTipos };
  pesquisa: { topo?: MapaTipos; treeview?: MapaTipos; item?: MapaTipos };
}

/** Conteúdo de `forma-atual.json`: só nomes e conjuntos de tipos. */
export function paraArquivoForma(forma: FormaObservada, capturadoEm: Date): FormaAtualArquivo {
  return {
    versao: 1,
    capturado_em: capturadoEm.toISOString(),
    ...(forma.login ? { login: { campos: forma.login } } : {}),
    pesquisa: {
      ...(forma.topo ? { topo: forma.topo } : {}),
      ...(forma.treeview ? { treeview: forma.treeview } : {}),
      ...(forma.item ? { item: forma.item } : {}),
    },
  };
}

type MapaBruto = Record<string, { tipos: TipoCampo[]; marca: string }>;

export interface TrocaCritica {
  escopo: Escopo;
  nome: string;
  marca: 'essencial' | 'usado';
  esperado: TipoCampo[];
  observado: TipoCampo[];
}

/**
 * Campos `essencial` ou `usado` do dourado cujo tipo observado mudou (a regra do null de `tipoAceito`
 * vale: null em `usado` não é troca). Trocar tipo de campo crítico é decisão humana: o mapeamento
 * (`chamado.ts`, `fila.service.ts`) precisa aceitar o novo tipo ANTES de o dourado ser atualizado.
 */
export function trocasCriticas(bruto: unknown, forma: FormaObservada): TrocaCritica[] {
  const contrato = carregarContrato(bruto);
  const saida: TrocaCritica[] = [];
  for (const escopo of ESCOPOS) {
    const observado = forma[escopo];
    if (!observado) continue;
    const esperado = camposDoEscopo(contrato, escopo);
    for (const [nome, tipos] of Object.entries(observado)) {
      const campo = esperado[nome];
      if (!campo || campo.marca === 'outro') continue;
      if (tipos.some((t) => !tipoAceito(campo, t))) {
        saida.push({ escopo, nome, marca: campo.marca, esperado: [...campo.tipos], observado: [...tipos] });
      }
    }
  }
  return saida;
}

/**
 * Regrava o dourado UNINDO os conjuntos de tipos: campo existente ganha os tipos novos (a marca fica;
 * `null` observado entra no conjunto), campo novo entra com a marca `outro`, campo que sumiu continua no
 * contrato (promover ou retirar é decisão humana, passo (c) do roteiro). Campo `essencial` ou `usado`
 * com TROCA de tipo (veja `trocasCriticas`) NÃO é regravado, a menos que `aceitarTrocaDeTipo` seja
 * verdadeiro. Devolve o objeto validado, pronto para gravar.
 */
export function unirNoDourado(
  bruto: unknown,
  forma: FormaObservada,
  dataIso: string,
  opcoes: { aceitarTrocaDeTipo?: boolean } = {},
): Record<string, unknown> {
  const copia = JSON.parse(JSON.stringify(bruto)) as {
    login: { campos: MapaBruto };
    pesquisa: { topo: MapaBruto; treeview: MapaBruto; item: MapaBruto };
    capturado_em?: string[];
  };
  carregarContrato(copia); // falha cedo se o arquivo atual já estiver malformado
  const unir = (alvo: MapaBruto, observado: MapaTipos | null): void => {
    if (!observado) return;
    for (const [nome, tipos] of Object.entries(observado)) {
      const atual = alvo[nome];
      if (!atual) {
        alvo[nome] = { tipos: [...tipos], marca: 'outro' };
      } else {
        if (
          !opcoes.aceitarTrocaDeTipo &&
          atual.marca !== 'outro' &&
          tipos.some((t) => !tipoAceito({ tipos: atual.tipos, marca: atual.marca as 'essencial' | 'usado' }, t))
        ) {
          continue; // troca de tipo em campo crítico: fica como estava
        }
        for (const t of tipos) if (!atual.tipos.includes(t)) atual.tipos.push(t);
      }
    }
  };
  unir(copia.login.campos, forma.login);
  unir(copia.pesquisa.topo, forma.topo);
  unir(copia.pesquisa.treeview, forma.treeview);
  unir(copia.pesquisa.item, forma.item);
  const datas = Array.isArray(copia.capturado_em) ? copia.capturado_em : [];
  if (!datas.includes(dataIso)) datas.push(dataIso);
  copia.capturado_em = datas;
  carregarContrato(copia);
  return copia as unknown as Record<string, unknown>;
}
