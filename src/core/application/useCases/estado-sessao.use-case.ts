import type { EstadoSessao, PerfilLogin, UltimoAlerta } from '../../domain/entities/sessao';
import type { IJanelaLogin } from '../../domain/ports/janela-login';
import type { ISessaoStore } from '../../domain/ports/sessao.store';

/** Resposta de estado (ARCH-001 §6 F2). Nunca traz senha, cookie, token nem endereço da janela. */
export interface EstadoSessaoDto {
  estado: EstadoSessao;
  autenticada: boolean;
  usuario: string | null;
  perfil: PerfilLogin | null;
  desde: string | null;
  janela: { aberta: boolean; expira_em: string | null; navegador_aberto: boolean | null };
  ultimo_alerta: { codigo: UltimoAlerta['codigo']; quando: string } | null;
}

/** Lê o último alerta de contrato (guardado pelo `alerta-contrato`, fragmento 4). */
export type LerUltimoAlerta = () => UltimoAlerta | null;

/** RF-02: lê `ISessaoStore` e `IJanelaLogin.info()`; não chama o SoftDesk. */
export class EstadoSessaoUseCase {
  constructor(
    private readonly sessao: ISessaoStore,
    private readonly janela: IJanelaLogin,
    private readonly ultimoAlerta: LerUltimoAlerta = () => null,
  ) {}

  executar(): EstadoSessaoDto {
    const estado = this.sessao.estado();
    const resumo = this.sessao.resumo();
    const info = this.janela.info();
    const alerta = this.ultimoAlerta();
    return {
      estado,
      autenticada: estado === 'AUTENTICADA',
      usuario: resumo?.usuario ?? null,
      perfil: resumo?.perfil ?? null,
      desde: resumo ? resumo.desde.toISOString() : null,
      janela: {
        aberta: info !== null,
        expira_em: info ? info.expiraEm.toISOString() : null,
        navegador_aberto: info ? info.navegadorAberto : null,
      },
      ultimo_alerta: alerta ? { codigo: alerta.codigo, quando: alerta.quando.toISOString() } : null,
    };
  }
}
