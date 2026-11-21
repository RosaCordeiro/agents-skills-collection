import { ehErroSoftdesk } from '../../domain/errors/erro-softdesk';
import type { CamposLog, ILogger } from '../../domain/ports/logger';
import type { AlertaContrato } from './alerta-contrato';

/**
 * Envolve uma operação com o log de início (`outcome: started`) e de fim (`success` ou
 * `failure`), ambos com o mesmo `correlation_id` (RNF-06). O `correlation_id` vem do contexto
 * que a entrada (REST ou MCP) abre com `executarComContexto`; o adaptador de log o anexa sozinho.
 * Em falha, só o código do erro tipado é registrado (nunca `message`), e erros com `destaque`
 * passam pelo alerta de contrato (F8). O erro original é relançado.
 */
export interface DefinicaoOperacao<T> {
  name: string;
  action: string;
  /** Campos do log de fim em sucesso (só da lista de permissão de §8.3). */
  camposFim?: (resultado: T) => Record<string, unknown>;
}

export type ExecutarOperacao = <T>(def: DefinicaoOperacao<T>, fn: () => Promise<T>) => Promise<T>;

export function criarOperacao(deps: { logger: ILogger; alerta: AlertaContrato }): ExecutarOperacao {
  const escrever = (nivel: 'info' | 'warn', msg: string, campos: CamposLog): void => {
    try {
      deps.logger[nivel](msg, campos);
    } catch {
      // log nunca derruba a operação
    }
  };
  return async <T>(def: DefinicaoOperacao<T>, fn: () => Promise<T>): Promise<T> => {
    const inicio = Date.now();
    escrever('info', 'Operação iniciada', { event: { name: def.name, action: def.action, outcome: 'started' } });
    try {
      const r = await fn();
      let extra: Record<string, unknown> = {};
      try {
        extra = def.camposFim ? def.camposFim(r) : {};
      } catch {
        extra = {};
      }
      escrever('info', 'Operação concluída', {
        event: { name: def.name, action: def.action, outcome: 'success' },
        ...extra,
        duracao_ms: Date.now() - inicio,
      });
      return r;
    } catch (e) {
      if (ehErroSoftdesk(e)) deps.alerta.registrarErro(e);
      escrever('warn', 'Operação falhou', {
        event: { name: def.name, action: def.action, outcome: 'failure' },
        codigo_erro: ehErroSoftdesk(e) ? e.codigo : 'ERRO_INTERNO',
        duracao_ms: Date.now() - inicio,
      });
      throw e;
    }
  };
}

/** Resposta de um caso de uso de consulta: os dados e, se houver, o aviso de deriva (RN-17). */
export interface ResultadoConsulta<T> {
  dados: T;
  aviso_deriva?: { campos: string[] };
}
