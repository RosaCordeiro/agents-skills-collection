import type { UltimoAlerta } from '../../domain/entities/sessao';
import type { ErroSoftdesk } from '../../domain/errors/erro-softdesk';
import type { ILogger } from '../../domain/ports/logger';
import type { INotificador } from '../../domain/ports/notificador';
import type { IRelogio } from '../../domain/ports/relogio';

/** Intervalo mínimo entre dois balões do mesmo código (ARCH-001 §6 F8). */
export const INTERVALO_BALAO_MS = 10 * 60 * 1000;

export interface DepsAlertaContrato {
  logger: ILogger;
  relogio: IRelogio;
  notificador: INotificador;
  intervaloBalaoMs?: number;
}

/**
 * RF-07 e RN-17 (ARCH-001 §6 F8, §17 camada 4). Compartilhado pelos casos de uso:
 * - `registrarErro`: ao passar um erro com `destaque` (LAYOUT_LOGIN_MUDOU, CONTRATO_ROTA_MUDOU)
 *   registra `error` com a keyword `softdesk_contrato_mudou`, guarda `ultimo_alerta` em memória e
 *   chama o notificador (no máximo um balão por código a cada 10 min). Outros erros passam sem efeito.
 * - `avisoDeriva`: transforma os nomes de campos derivados em `aviso_deriva`, registra `warn` com a
 *   keyword `softdesk_deriva` (só nomes), guarda `ultimo_alerta` (código `DERIVA`) e chama o notificador
 *   (no máximo um balão por código a cada 10 min), sem nunca derrubar a consulta. `derivaDiagnostico` faz
 *   o mesmo para a deriva achada só pelo diagnóstico da saúde (sem `aviso_deriva` no envelope).
 *   A deriva nunca encobre um alerta de erro de contrato (LAYOUT/CONTRATO) já guardado.
 * Nunca lança e nunca registra título, nome de pessoa, valor de filtro nem `message` de exceção.
 */
export class AlertaContrato {
  private ultimoAlerta: UltimoAlerta | null = null;
  private readonly balaoEm = new Map<string, number>();
  private readonly intervalo: number;

  constructor(private readonly deps: DepsAlertaContrato) {
    this.intervalo = deps.intervaloBalaoMs ?? INTERVALO_BALAO_MS;
  }

  ultimo(): UltimoAlerta | null {
    return this.ultimoAlerta ? { ...this.ultimoAlerta } : null;
  }

  registrarErro(erro: ErroSoftdesk): void {
    if (!erro.destaque) return;
    if (erro.codigo !== 'LAYOUT_LOGIN_MUDOU' && erro.codigo !== 'CONTRATO_ROTA_MUDOU') return;
    const agora = this.deps.relogio.agora();
    this.ultimoAlerta = { codigo: erro.codigo, quando: agora };
    try {
      this.deps.logger.error('O SoftDesk mudou de formato', {
        event: { name: 'contrato', action: 'alerta', outcome: 'failure' },
        keywords: ['softdesk_contrato_mudou'],
        codigo_erro: erro.codigo,
        ...(erro.campos ? { campos_deriva: erro.campos } : {}),
        ...(erro.evidencia ? { evidencia: erro.evidencia } : {}),
      });
    } catch {
      // log nunca derruba a operação
    }
    this.balao(erro.codigo, agora.getTime());
  }

  /** `undefined` quando não há deriva. */
  avisoDeriva(campos: readonly string[] | undefined): { campos: string[] } | undefined {
    if (!campos || campos.length === 0) return undefined;
    const nomes = [...new Set(campos)];
    this.registrarDeriva(nomes, 'deriva', 'Campo usado do SoftDesk ausente ou com tipo diferente');
    return { campos: nomes };
  }

  /**
   * Deriva só do diagnóstico da saúde. `campos` (essencial/usado): log, `ultimo_alerta` e balão.
   * `outros` (marca `outro`, que nenhum mapeamento usa): só o log `softdesk_deriva`, sem alerta nem balão.
   */
  derivaDiagnostico(campos: readonly string[] | undefined, outros: readonly string[] = []): void {
    if (outros.length > 0) {
      try {
        this.deps.logger.warn('O diagnóstico da saúde achou campo sem uso ausente ou com tipo diferente', {
          event: { name: 'contrato', action: 'diagnostico_outro', outcome: 'success' },
          keywords: ['softdesk_deriva'],
          campos_deriva: [...new Set(outros)],
        });
      } catch {
        // log nunca derruba a operação
      }
    }
    if (!campos || campos.length === 0) return;
    this.registrarDeriva([...new Set(campos)], 'diagnostico', 'O diagnóstico da saúde achou campo ausente ou com tipo diferente');
  }

  private registrarDeriva(nomes: string[], acao: string, mensagem: string): void {
    const agora = this.deps.relogio.agora();
    try {
      this.deps.logger.warn(mensagem, {
        event: { name: 'contrato', action: acao, outcome: 'success' },
        keywords: ['softdesk_deriva'],
        campos_deriva: nomes,
      });
    } catch {
      // log nunca derruba a operação
    }
    if (this.ultimoAlerta === null || this.ultimoAlerta.codigo === 'DERIVA') {
      this.ultimoAlerta = { codigo: 'DERIVA', quando: agora };
    }
    this.balao('DERIVA', agora.getTime());
  }

  private balao(codigo: ErroSoftdesk['codigo'] | 'DERIVA', agoraMs: number): void {
    const ultimo = this.balaoEm.get(codigo);
    if (ultimo !== undefined && agoraMs - ultimo < this.intervalo) return;
    this.balaoEm.set(codigo, agoraMs);
    try {
      this.deps.notificador.alertar(codigo);
    } catch {
      // o notificador não deveria lançar; se lançar, a operação segue
    }
  }
}
