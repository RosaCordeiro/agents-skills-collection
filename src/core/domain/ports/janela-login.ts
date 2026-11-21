import type { ErroSoftdesk } from '../errors/erro-softdesk';
import type { ResumoSessao } from '../entities/sessao';

/** Dados públicos da janela. Porta, token e endereço NÃO entram aqui (RN-10, ADR-007). */
export interface InfoJanela {
  aberta: boolean;
  expiraEm: Date;
  navegadorAberto: boolean;
}

export type ResultadoLogin =
  | { ok: true; resumo: ResumoSessao }
  | { ok: false; erro: ErroSoftdesk };

export interface IJanelaLogin {
  /** Abre a janela (e o navegador) se não houver; se houver, reaproveita (RN-14). */
  abrirOuReaproveitar(): Promise<InfoJanela>;
  /** Espera o login terminar por até `ms`; `'TEMPO'` se estourar (a janela continua aberta). */
  aguardarResultado(ms: number): Promise<ResultadoLogin | 'TEMPO'>;
  info(): InfoJanela | null;
  /**
   * Endereço com o token, só para a rota operacional `GET /v1/sessao/janela` (ADR-007).
   * Nunca entra em resposta de MCP, estado ou log.
   */
  enderecoManual(): string | null;
  fechar(): void;
}
