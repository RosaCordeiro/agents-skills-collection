import type { SessaoHttp } from '../../domain/entities/sessao';
import { ErroSoftdesk, ehErroSoftdesk } from '../../domain/errors/erro-softdesk';
import type { IJanelaLogin } from '../../domain/ports/janela-login';
import type { ISessaoStore } from '../../domain/ports/sessao.store';

export interface DepsExigirSessao {
  sessao: ISessaoStore;
  janela: IJanelaLogin;
}

/** Roda `operacao` com a sessão válida; é o único caminho das consultas ao SoftDesk. */
export type ExigirSessao = <T>(operacao: (sessao: SessaoHttp) => Promise<T>) => Promise<T>;

/**
 * RN-14 (ARCH-001 §6 F7):
 * - sem sessão: abre ou reaproveita a janela (nunca duas) e lança `AGUARDANDO_LOGIN`;
 * - `SESSAO_EXPIRADA` vinda do gateway: descarta a sessão, abre a janela e relança
 *   `SESSAO_EXPIRADA` com `janela.aberta`.
 * Não há relogin (a senha não existe mais) nem repetição da consulta.
 */
export function criarExigirSessao({ sessao, janela }: DepsExigirSessao): ExigirSessao {
  return async <T>(operacao: (s: SessaoHttp) => Promise<T>): Promise<T> => {
    const atual = sessao.obter();
    if (!atual) {
      const info = await janela.abrirOuReaproveitar();
      throw new ErroSoftdesk('AGUARDANDO_LOGIN', { janela: { aberta: info.aberta } });
    }
    try {
      return await operacao(atual);
    } catch (e) {
      if (!ehErroSoftdesk(e) || e.codigo !== 'SESSAO_EXPIRADA') throw e;
      const outra = sessao.obter();
      if (outra === atual) {
        sessao.descartar('expirada');
        const info = await janela.abrirOuReaproveitar();
        throw new ErroSoftdesk('SESSAO_EXPIRADA', { janela: { aberta: info.aberta } });
      }
      // Outra operação já tratou a expiração (ou um novo login já entrou): não reabre nada.
      throw new ErroSoftdesk('SESSAO_EXPIRADA', { janela: { aberta: janela.info() !== null } });
    }
  };
}
