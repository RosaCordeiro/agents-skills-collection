import { ehErroSoftdesk } from '../../domain/errors/erro-softdesk';
import type { ILogger } from '../../domain/ports/logger';
import type { ResultadoConsulta } from './operacao';
import type { DadosSaude } from '../useCases/verificar-saude.use-case';

export interface DepsSaudeAutomatica {
  verificarSaude: { executar(): Promise<ResultadoConsulta<DadosSaude>> };
  logger: ILogger;
  /** Falso desliga a verificação (os testes dos fragmentos anteriores contam requisições). */
  habilitada?: boolean;
  /** Abre o contexto de log (correlation_id) da verificação; padrão: roda direto. */
  emContexto?: <T>(fn: () => T) => T;
  /** Agenda o início fora da resposta do login; padrão: `setImmediate`. */
  agendar?: (fn: () => void) => void;
}

/**
 * ARCH-001 §17 camada 5: uma única verificação de saúde (a pesquisa mínima, com conferência
 * de contrato) depois do PRIMEIRO login de cada início do serviço. Não bloqueia a resposta do
 * login. O resultado vai para o log (com os nomes de campos derivados, se houver); a falha de contrato e a
 * deriva geram log `softdesk_deriva`, `ultimo_alerta` e balão pelo caminho normal da operação (`alerta-contrato`).
 * Nunca lança.
 */
export class SaudeAutomatica {
  private disparada = false;
  private ultima: Promise<void> = Promise.resolve();

  constructor(private readonly deps: DepsSaudeAutomatica) {}

  disparar(): void {
    if (this.deps.habilitada === false || this.disparada) return;
    this.disparada = true;
    const agendar = this.deps.agendar ?? ((fn: () => void) => void setImmediate(fn));
    this.ultima = new Promise<void>((resolve) => {
      agendar(() => {
        this.rodar().finally(resolve);
      });
    });
  }

  /** Termina quando a verificação disparada terminou (para os testes). */
  aguardar(): Promise<void> {
    return this.ultima;
  }

  private async rodar(): Promise<void> {
    const emContexto = this.deps.emContexto ?? (<T>(fn: () => T): T => fn());
    try {
      const r = await emContexto(() => this.deps.verificarSaude.executar());
      // Só nomes de campo (nunca valores): deriva usada e diagnóstico da saúde.
      const deriva = [
        ...new Set([
          ...(r.aviso_deriva?.campos ?? []),
          ...(r.dados.deriva?.ausentes ?? []),
          ...(r.dados.deriva?.tipo_trocado ?? []),
        ]),
      ];
      this.deps.logger.info('Saúde automática após o primeiro login', {
        event: { name: 'saude', action: 'auto', outcome: 'success' },
        modo: r.dados.modo,
        duracao_ms: r.dados.duracao_ms,
        ...(deriva.length > 0 ? { campos_deriva: deriva } : {}),
      });
    } catch (e) {
      try {
        this.deps.logger.warn('Saúde automática após o primeiro login encontrou problema', {
          event: { name: 'saude', action: 'auto', outcome: 'failure' },
          codigo_erro: ehErroSoftdesk(e) ? e.codigo : 'ERRO_INTERNO',
        });
      } catch {
        // log nunca derruba nada
      }
    }
  }
}
