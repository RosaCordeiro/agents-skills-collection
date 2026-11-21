import type { EstadoSessao, ResumoSessao, SessaoHttp } from '../../core/domain/entities/sessao';
import type { ISessaoStore, MotivoDescarte } from '../../core/domain/ports/sessao.store';

/**
 * Sessão em memória (ARCH-001 §4, §5). Um objeto, nada em disco, nada serializado.
 * Máquina de estados de §6 F1.
 */
export class SessaoMemoriaStore implements ISessaoStore {
  private atual: EstadoSessao = 'SEM_SESSAO';
  private sessaoHttp: SessaoHttp | null = null;
  private dadosResumo: ResumoSessao | null = null;

  obter(): SessaoHttp | null {
    return this.atual === 'AUTENTICADA' ? this.sessaoHttp : null;
  }

  guardar(sessao: SessaoHttp, resumo: ResumoSessao): void {
    this.sessaoHttp = sessao;
    this.dadosResumo = { ...resumo };
    this.atual = 'AUTENTICADA';
  }

  descartar(motivo: MotivoDescarte): void {
    this.sessaoHttp?.cookies.clear();
    this.sessaoHttp = null;
    this.dadosResumo = null;
    this.atual = motivo === 'expirada' ? 'EXPIRADA' : 'SEM_SESSAO';
  }

  resumo(): ResumoSessao | null {
    return this.atual === 'AUTENTICADA' && this.dadosResumo ? { ...this.dadosResumo } : null;
  }

  estado(): EstadoSessao {
    return this.atual;
  }

  marcarAguardando(): void {
    if (this.atual === 'AUTENTICADA' || this.atual === 'AUTENTICANDO') return;
    this.atual = 'AGUARDANDO_LOGIN';
  }

  marcarAutenticando(): void {
    if (this.atual === 'AGUARDANDO_LOGIN') this.atual = 'AUTENTICANDO';
  }

  janelaEncerrada(): void {
    if (this.atual === 'AGUARDANDO_LOGIN' || this.atual === 'AUTENTICANDO') this.atual = 'SEM_SESSAO';
  }
}
