import type { EstadoSessao, ResumoSessao, SessaoHttp } from '../entities/sessao';

export type MotivoDescarte = 'expirada' | 'parada' | 'login_falhou';

/**
 * Guarda a sessão só em memória (ARCH-001 §4). Implementa a máquina de estados de §6 F1:
 * os métodos `marcar*` e `janelaEncerrada` completam a porta para a janela de login poder
 * mover o estado sem conhecer a implementação. A senha nunca passa por aqui.
 */
export interface ISessaoStore {
  /** A sessão HTTP só existe no estado `AUTENTICADA`; nos demais devolve `null`. */
  obter(): SessaoHttp | null;
  /** Login aceito: passa a `AUTENTICADA`. */
  guardar(sessao: SessaoHttp, resumo: ResumoSessao): void;
  /** `expirada` leva a `EXPIRADA`; `parada` e `login_falhou` levam a `SEM_SESSAO`. Apaga os cookies. */
  descartar(motivo: MotivoDescarte): void;
  resumo(): ResumoSessao | null;
  estado(): EstadoSessao;
  /** Janela aberta ou reaproveitada: `AGUARDANDO_LOGIN` (sem efeito se já autenticada). */
  marcarAguardando(): void;
  /** `POST` válido recebido: `AUTENTICANDO` (só a partir de `AGUARDANDO_LOGIN`). */
  marcarAutenticando(): void;
  /** Janela fechada ou vencida sem login: `AGUARDANDO_LOGIN` ou `AUTENTICANDO` voltam a `SEM_SESSAO`. */
  janelaEncerrada(): void;
}
