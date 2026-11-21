import { ErroSoftdesk, type EvidenciaContrato } from '../../core/domain/errors/erro-softdesk';
import type { ChamadoBruto } from '../../core/domain/entities/chamado';
import type { DerivaDetalhada } from '../../core/domain/ports/softdesk.gateway';
import dourado from './contrato-dourado.json';

/**
 * Detecção de contrato da rota não oficial (ARCH-001 §7.4, §17; RN-08, RN-17).
 * Funções puras: conhecem o formato de fio e devolvem erros tipados do domínio. Quem faz I/O
 * (gateway) monta a `RespostaClassificavel` e decide o que fazer com o resultado.
 */

// ---------------------------------------------------------------------------------------
// Contrato dourado
// ---------------------------------------------------------------------------------------

export const TIPOS_CAMPO = ['array', 'boolean', 'null', 'number', 'object', 'string'] as const;
export type TipoCampo = (typeof TIPOS_CAMPO)[number];

export const MARCAS_CAMPO = ['essencial', 'usado', 'outro'] as const;
export type MarcaCampo = (typeof MARCAS_CAMPO)[number];

export interface CampoContrato {
  /** Conjunto de tipos observados (um campo que ora vem nulo, ora texto tem os dois). */
  tipos: TipoCampo[];
  marca: MarcaCampo;
}

export type MapaCampos = Record<string, CampoContrato>;

export interface ContratoDourado {
  versao: number;
  descricao?: string;
  fontes?: string[];
  capturado_em?: string[];
  login: { campos: MapaCampos };
  pesquisa: { topo: MapaCampos; treeview: MapaCampos; item: MapaCampos };
}

function ehObjeto(valor: unknown): valor is Record<string, unknown> {
  return valor !== null && typeof valor === 'object' && !Array.isArray(valor);
}

function validarMapa(valor: unknown, onde: string): MapaCampos {
  if (!ehObjeto(valor)) throw new Error(`contrato dourado: ${onde} deve ser um objeto`);
  const saida: MapaCampos = Object.create(null) as MapaCampos;
  for (const [nome, campo] of Object.entries(valor)) {
    if (!ehObjeto(campo) || !Array.isArray(campo.tipos) || typeof campo.marca !== 'string') {
      throw new Error(`contrato dourado: ${onde}.${nome} malformado`);
    }
    const tipos = campo.tipos;
    if (tipos.length === 0 || !tipos.every((t) => (TIPOS_CAMPO as readonly unknown[]).includes(t))) {
      throw new Error(`contrato dourado: ${onde}.${nome} com tipo desconhecido`);
    }
    if (!(MARCAS_CAMPO as readonly unknown[]).includes(campo.marca)) {
      throw new Error(`contrato dourado: ${onde}.${nome} com marca desconhecida`);
    }
    saida[nome] = { tipos: tipos as TipoCampo[], marca: campo.marca as MarcaCampo };
  }
  return saida;
}

/** Valida e normaliza um contrato (do arquivo ou de um teste). Lança `Error` se malformado. */
export function carregarContrato(bruto: unknown): ContratoDourado {
  if (!ehObjeto(bruto) || !ehObjeto(bruto.login) || !ehObjeto(bruto.pesquisa)) {
    throw new Error('contrato dourado: estrutura inválida');
  }
  const pesquisa = bruto.pesquisa;
  const contrato: ContratoDourado = {
    versao: typeof bruto.versao === 'number' ? bruto.versao : 1,
    login: { campos: validarMapa(bruto.login.campos, 'login.campos') },
    pesquisa: {
      topo: validarMapa(pesquisa.topo, 'pesquisa.topo'),
      treeview: validarMapa(pesquisa.treeview, 'pesquisa.treeview'),
      item: validarMapa(pesquisa.item, 'pesquisa.item'),
    },
  };
  for (const marca of ['cd_chamado', 'st_chamado', 'cd_atendente']) {
    if (contrato.pesquisa.item[marca]?.marca !== 'essencial') {
      throw new Error(`contrato dourado: ${marca} deve ser essencial`);
    }
  }
  return contrato;
}

/** Contrato embutido (`contrato-dourado.json`, gerado das capturas de 19/11/2026). */
export const CONTRATO_DOURADO: ContratoDourado = carregarContrato(dourado);

// ---------------------------------------------------------------------------------------
// Classificação da resposta (tabela de §7.4)
// ---------------------------------------------------------------------------------------

/** O que o gateway extrai de uma resposta HTTP para a classificação. Nunca o corpo em si. */
export interface RespostaClassificavel {
  status: number;
  contentType?: string | null;
  /** Só o caminho do `Location` (sem query), quando houver. */
  locationPath?: string | null;
  /** `true` se o corpo é JSON válido (`json` traz o valor). */
  ehJson: boolean;
  json?: unknown;
  /** Só para a página de login: havia cookie `XSRF-TOKEN`? */
  temXsrf?: boolean;
}

/** Só o tipo de mídia, sem parâmetros, em minúsculas e com tamanho limitado. */
export function tipoDeMidia(contentType: string | null | undefined): string | undefined {
  if (!contentType) return undefined;
  const tipo = contentType.split(';', 1)[0].trim().toLowerCase();
  return tipo === '' ? undefined : tipo.slice(0, 100);
}

/** Evidência de quebra de contrato: status, tipo de mídia e caminho do `Location`; nunca corpo. */
export function evidenciaDe(r: RespostaClassificavel): EvidenciaContrato {
  const e: EvidenciaContrato = { http_status: r.status };
  const tipo = tipoDeMidia(r.contentType);
  if (tipo) e.content_type = tipo;
  if (r.locationPath) e.location_path = r.locationPath;
  return e;
}

const ehRedirecionamento = (status: number): boolean => status >= 300 && status < 400;

function terminaEmLogin(caminho: string | null | undefined): boolean {
  if (!caminho) return false;
  return caminho.split(/[?#]/, 1)[0].replace(/\/+$/, '').toLowerCase().endsWith('/login');
}

export type EtapaLogin = 'pagina' | 'envio';

/**
 * `GET /login` (`pagina`) e `POST /login` (`envio`). Devolve o erro tipado ou `null` se o
 * login está dentro do contrato. A senha errada é `CREDENCIAL`; formato diferente é
 * `LAYOUT_LOGIN_MUDOU` (nunca se mistura).
 */
export function classificarLogin(etapa: EtapaLogin, r: RespostaClassificavel): ErroSoftdesk | null {
  if (r.status >= 500) return new ErroSoftdesk('REDE', { evidencia: { http_status: r.status } });
  if (etapa === 'pagina') {
    if (r.status !== 200 || r.temXsrf !== true) {
      return new ErroSoftdesk('LAYOUT_LOGIN_MUDOU', { evidencia: evidenciaDe(r) });
    }
    return null;
  }
  if (r.status === 401) return new ErroSoftdesk('CREDENCIAL');
  if (!r.ehJson || !ehObjeto(r.json) || typeof r.json.status !== 'boolean') {
    return new ErroSoftdesk('LAYOUT_LOGIN_MUDOU', { evidencia: evidenciaDe(r) });
  }
  if (r.json.status === false) return new ErroSoftdesk('CREDENCIAL');
  return null;
}

/**
 * `GET /chamado/json`. Devolve o erro tipado ou `null` se a resposta tem `lista` (array de
 * objetos) e `treeview.total` numérico. Não confere campos do item (veja `conferirLista`).
 */
export function classificarPesquisa(r: RespostaClassificavel): ErroSoftdesk | null {
  if (r.status >= 500) return new ErroSoftdesk('REDE', { evidencia: { http_status: r.status } });
  if (r.status === 401 || r.status === 403) {
    return new ErroSoftdesk('SESSAO_EXPIRADA', { evidencia: { http_status: r.status } });
  }
  if (ehRedirecionamento(r.status) && terminaEmLogin(r.locationPath)) {
    return new ErroSoftdesk('SESSAO_EXPIRADA', { evidencia: evidenciaDe(r) });
  }
  const mudou = (): ErroSoftdesk => new ErroSoftdesk('CONTRATO_ROTA_MUDOU', { evidencia: evidenciaDe(r) });
  if (r.status !== 200 || !r.ehJson || !ehObjeto(r.json)) return mudou();
  const { lista, treeview } = r.json;
  if (!Array.isArray(lista)) return mudou();
  if (!ehObjeto(treeview) || typeof treeview.total !== 'number' || !Number.isFinite(treeview.total)) {
    return mudou();
  }
  if (!lista.every(ehObjeto)) return mudou();
  return null;
}

// ---------------------------------------------------------------------------------------
// Conferência por campo (RN-17, §17 camada 3)
// ---------------------------------------------------------------------------------------

/**
 * Tolerância a null por desenho (RN-17): em campo `usado` ou `outro`, `null` é sempre aceito (um item
 * nulo entre milhares não é deriva) e um campo que o dourado só viu nulo (`['null']`) aceita qualquer
 * tipo (o tipo ainda é desconhecido, não foi trocado). Campo `essencial` é estrito: só os tipos do dourado.
 */
export function tipoAceito(esperado: CampoContrato, tipo: TipoCampo): boolean {
  if (esperado.tipos.includes(tipo)) return true;
  if (esperado.marca === 'essencial') return false;
  if (tipo === 'null') return true;
  return esperado.tipos.length === 1 && esperado.tipos[0] === 'null';
}

export function tipoDe(valor: unknown): TipoCampo {
  if (valor === null) return 'null';
  if (Array.isArray(valor)) return 'array';
  switch (typeof valor) {
    case 'string':
      return 'string';
    case 'number':
      return 'number';
    case 'boolean':
      return 'boolean';
    default:
      return 'object';
  }
}

export interface DesvioCampo {
  nome: string;
  marca: MarcaCampo;
  motivo: 'ausente' | 'tipo_trocado';
}

export interface ComparacaoItem {
  /** Campos que o contrato não conhece. */
  novos: string[];
  /** Campos do contrato ausentes no item ou com tipo fora do conjunto, de qualquer marca. */
  desvios: DesvioCampo[];
}

/** Compara um item com o contrato, de todas as marcas (base também da saúde com diagnóstico). */
export function compararItem(item: ChamadoBruto, contrato: ContratoDourado = CONTRATO_DOURADO): ComparacaoItem {
  const esperados = contrato.pesquisa.item;
  const novos: string[] = [];
  for (const nome of Object.keys(item)) {
    if (!Object.hasOwn(esperados, nome)) novos.push(nome);
  }
  const desvios: DesvioCampo[] = [];
  for (const [nome, esperado] of Object.entries(esperados)) {
    if (!Object.hasOwn(item, nome)) {
      desvios.push({ nome, marca: esperado.marca, motivo: 'ausente' });
    } else if (!tipoAceito(esperado, tipoDe(item[nome]))) {
      desvios.push({ nome, marca: esperado.marca, motivo: 'tipo_trocado' });
    }
  }
  return { novos, desvios };
}

export interface ConferenciaItem {
  /** Essenciais ausentes ou de tipo fora do conjunto: a resposta vira `CONTRATO_ROTA_MUDOU`. */
  essenciais: string[];
  /** Usados ausentes ou de tipo fora do conjunto: o campo sai nulo e vai para `aviso_deriva`. */
  usados: string[];
  /** Campos novos: só vão para o log (uma vez por processo). */
  novos: string[];
}

function conferenciaDe(c: ComparacaoItem): ConferenciaItem {
  return {
    essenciais: c.desvios.filter((d) => d.marca === 'essencial').map((d) => d.nome),
    usados: c.desvios.filter((d) => d.marca === 'usado').map((d) => d.nome),
    novos: c.novos,
  };
}

export function conferirItem(item: ChamadoBruto, contrato: ContratoDourado = CONTRATO_DOURADO): ConferenciaItem {
  return conferenciaDe(compararItem(item, contrato));
}

/** Confere todos os itens de uma resposta; cada nome de campo aparece uma vez por resposta. */
export function conferirLista(
  lista: readonly ChamadoBruto[],
  contrato: ContratoDourado = CONTRATO_DOURADO,
): ConferenciaItem {
  const essenciais = new Set<string>();
  const usados = new Set<string>();
  const novos = new Set<string>();
  for (const item of lista) {
    const c = conferirItem(item, contrato);
    c.essenciais.forEach((n) => essenciais.add(n));
    c.usados.forEach((n) => usados.add(n));
    c.novos.forEach((n) => novos.add(n));
  }
  return { essenciais: [...essenciais], usados: [...usados], novos: [...novos] };
}

/**
 * Diagnóstico de uma lista contra o contrato (só nomes), de todas as marcas, para a saúde e para a
 * captura de forma. `criterioAusente`: `'algum'` marca o campo que falta em qualquer item (saúde);
 * `'todos'` só o que falta em todos (captura, onde um campo opcional não deve virar alarme).
 */
export function diagnosticarLista(
  lista: readonly ChamadoBruto[],
  contrato: ContratoDourado = CONTRATO_DOURADO,
  criterioAusente: 'algum' | 'todos' = 'algum',
): DerivaDetalhada {
  const novos = new Set<string>();
  const trocados = new Set<string>();
  const faltas = new Map<string, number>();
  for (const item of lista) {
    const c = compararItem(item, contrato);
    c.novos.forEach((n) => novos.add(n));
    for (const d of c.desvios) {
      if (d.motivo === 'ausente') faltas.set(d.nome, (faltas.get(d.nome) ?? 0) + 1);
      else trocados.add(d.nome);
    }
  }
  const ausentes = [...faltas.entries()]
    .filter(([, vezes]) => criterioAusente === 'algum' || vezes === lista.length)
    .map(([nome]) => nome);
  return { novos: [...novos].sort(), ausentes: ausentes.sort(), tipo_trocado: [...trocados].sort() };
}

export const semDiferenca = (d: DerivaDetalhada): boolean =>
  d.novos.length === 0 && d.ausentes.length === 0 && d.tipo_trocado.length === 0;
