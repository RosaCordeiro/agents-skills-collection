/** Estados e dados da sessão (ARCH-001 §5 e F1). Somente memória. */

export const ESTADOS_SESSAO = [
  'SEM_SESSAO',
  'AGUARDANDO_LOGIN',
  'AUTENTICANDO',
  'AUTENTICADA',
  'EXPIRADA',
] as const;

export type EstadoSessao = (typeof ESTADOS_SESSAO)[number];

export const PERFIS_LOGIN = ['A', 'U', 'T'] as const;
export type PerfilLogin = (typeof PERFIS_LOGIN)[number];

/** Cookies da sessão HTTP. Nunca serializada, nunca logada; apagada na expiração ou parada. */
export interface SessaoHttp {
  cookies: Map<string, string>;
  criadaEm: Date;
}

/** Aparece só na resposta de estado; nunca em log (RN-13). */
export interface ResumoSessao {
  usuario: string;
  perfil: PerfilLogin;
  desde: Date;
}

/** Último alerta de contrato visto (F8). */
export interface UltimoAlerta {
  codigo: 'LAYOUT_LOGIN_MUDOU' | 'CONTRATO_ROTA_MUDOU' | 'DERIVA';
  quando: Date;
}
