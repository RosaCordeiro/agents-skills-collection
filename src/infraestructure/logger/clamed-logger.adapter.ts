import path from 'node:path';
import { LoggerProvider } from '@clamed/logger';
import type { Config } from '../../core/domain/entities/config';
import type { CamposLog, ILogger } from '../../core/domain/ports/logger';
import { contextoAtual } from './contexto';

/**
 * Adaptador de `ILogger` sobre `@clamed/logger` 1.0.7 (ARCH-001 §8.3).
 * O pacote só oferece `info/warn/error(msg, obj)`; este adaptador monta `event`, `keywords`,
 * `correlation_id`, `origem` e `cd_atendente`, e só deixa passar os campos da lista de permissão.
 * Campos fora da lista (inclusive `message`, `stack`, `err`, `error`) são descartados, e os valores
 * só podem ser primitivos: um objeto de exceção nunca chega ao arquivo de log.
 */

/** Destino mínimo; o `LoggerProvider` do pacote o satisfaz e os testes usam um espião. */
export interface DestinoLog {
  info(msg: string, obj?: unknown): void;
  warn(msg: string, obj?: unknown): void;
  error(msg: string, obj?: unknown): void;
}

/** Campos escalares permitidos (tabela de §8.3). */
export const CAMPOS_PERMITIDOS: ReadonlySet<string> = new Set([
  'porta',
  'versao',
  'pid',
  'perfil',
  'codigo_erro',
  'motivo',
  'navegador_aberto',
  'paginas_lidas',
  'abertos',
  'total_softdesk',
  'incompleto',
  'todas',
  'parada_por',
  'duracao_ms',
  'inicio',
  'limite_aplicado',
  'itens',
  'total',
  'cd_chamado',
  'modo',
  'rota',
  'http_status',
]);

/** Campos permitidos cujo valor é lista de nomes (nunca valores de filtro). */
const CAMPOS_LISTA: ReadonlySet<string> = new Set(['filtros_usados', 'campos_deriva']);

const CHAVES_EVIDENCIA = new Set(['http_status', 'content_type', 'location_path']);

const PADRAO_NOME = /^[a-z0-9_]{1,64}$/;
const RESULTADOS = new Set(['started', 'success', 'failure']);
const LIMITE_TEXTO = 200;

function textoSeguro(valor: string): string {
  // Sem query string nem fragmento, e com tamanho limitado.
  const semQuery = valor.split(/[?#]/, 1)[0];
  return semQuery.length > LIMITE_TEXTO ? semQuery.slice(0, LIMITE_TEXTO) : semQuery;
}

function primitivo(valor: unknown): string | number | boolean | null | undefined {
  if (typeof valor === 'string') return textoSeguro(valor);
  if (typeof valor === 'number') return Number.isFinite(valor) ? valor : undefined;
  if (typeof valor === 'boolean' || valor === null) return valor;
  return undefined;
}

function listaDeNomes(valor: unknown): string[] | undefined {
  if (!Array.isArray(valor)) return undefined;
  return valor.filter((v): v is string => typeof v === 'string' && PADRAO_NOME.test(v)).slice(0, 100);
}

function evidenciaSegura(valor: unknown): Record<string, string | number> | undefined {
  if (valor === null || typeof valor !== 'object' || Array.isArray(valor)) return undefined;
  const saida: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(valor as Record<string, unknown>)) {
    if (!CHAVES_EVIDENCIA.has(k)) continue;
    if (typeof v === 'number' && Number.isFinite(v)) saida[k] = v;
    else if (typeof v === 'string') saida[k] = textoSeguro(v);
  }
  return Object.keys(saida).length > 0 ? saida : undefined;
}

/** Aplica a lista de permissão. Exportada para teste. */
export function filtrarCampos(
  campos: CamposLog,
  base: { cdAtendente: number },
): Record<string, unknown> {
  const saida: Record<string, unknown> = {};

  const ev = campos.event as unknown;
  if (ev !== null && typeof ev === 'object') {
    const { name, action, outcome } = ev as Record<string, unknown>;
    const event: Record<string, string> = {};
    if (typeof name === 'string' && PADRAO_NOME.test(name)) event.name = name;
    if (typeof action === 'string' && PADRAO_NOME.test(action)) event.action = action;
    if (typeof outcome === 'string' && RESULTADOS.has(outcome)) event.outcome = outcome;
    saida.event = event;
  } else {
    saida.event = {};
  }

  const keywords = listaDeNomes(campos.keywords);
  if (keywords && keywords.length > 0) saida.keywords = keywords;

  for (const [chave, valor] of Object.entries(campos)) {
    if (chave === 'event' || chave === 'keywords') continue;
    if (CAMPOS_PERMITIDOS.has(chave)) {
      const p = primitivo(valor);
      if (p !== undefined) saida[chave] = p;
    } else if (CAMPOS_LISTA.has(chave)) {
      const l = listaDeNomes(valor);
      if (l) saida[chave] = l;
    } else if (chave === 'evidencia') {
      const e = evidenciaSegura(valor);
      if (e) saida.evidencia = e;
    }
    // qualquer outro campo é descartado
  }

  // Campos controlados pelo adaptador (o chamador não consegue sobrescrever).
  saida.cd_atendente = base.cdAtendente;
  const ctx = contextoAtual();
  if (ctx) {
    saida.correlation_id = ctx.correlationId;
    if (ctx.origem) saida.origem = ctx.origem;
  }
  return saida;
}

export class ClamedLoggerAdapter implements ILogger {
  constructor(
    private readonly destino: DestinoLog,
    private readonly cdAtendente: number,
  ) {}

  info(msg: string, campos: CamposLog): void {
    this.escrever('info', msg, campos);
  }

  warn(msg: string, campos: CamposLog): void {
    this.escrever('warn', msg, campos);
  }

  error(msg: string, campos: CamposLog): void {
    this.escrever('error', msg, campos);
  }

  private escrever(nivel: 'info' | 'warn' | 'error', msg: string, campos: CamposLog): void {
    try {
      this.destino[nivel](textoSeguro(String(msg)), filtrarCampos(campos, { cdAtendente: this.cdAtendente }));
    } catch {
      // Log nunca derruba a operação.
    }
  }
}

/**
 * Cria o logger real: `servico.log` em `<diretório>/logs`, 14 arquivos, 14 dias.
 * O pacote lê `PREFIX_LOGGER` e `AMBIENTE` do ambiente na criação; define o padrão se ausentes.
 */
export function criarLoggerClamed(config: Config): ILogger {
  process.env.PREFIX_LOGGER ||= 'softdesk-local';
  process.env.AMBIENTE ||= 'local';
  const provider = new LoggerProvider({
    logDir: path.join(config.diretorio, 'logs'),
    fileName: 'servico.log',
    maxFiles: 14,
    retentionDays: 14,
  });
  // O nível do `config.json` também vale (o pacote só lê `LOG_LEVEL`).
  provider.setLevel(config.nivelLog);
  return new ClamedLoggerAdapter(provider, config.cdAtendente);
}
