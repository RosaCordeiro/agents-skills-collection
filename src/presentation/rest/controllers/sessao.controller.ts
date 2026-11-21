import type { ContextoRota, RespostaRota } from '../roteador';
import { exigirSemEntrada } from './entrada-rest';

/** `POST /v1/sessao/entrar` (RF-01). Pode levar até a espera de login configurada. */
export async function entrar(ctx: ContextoRota): Promise<RespostaRota> {
  exigirSemEntrada(ctx);
  return { dados: await ctx.container.entrar.executar() };
}

/** `GET /v1/sessao` (RF-02). */
export async function estado(ctx: ContextoRota): Promise<RespostaRota> {
  exigirSemEntrada(ctx);
  return { dados: ctx.container.estadoSessao.executar() };
}

/**
 * `GET /v1/sessao/janela`: única rota que devolve o endereço da janela de login (ADR-007).
 * Não abre janela: só mostra a que já existe.
 */
export async function janela(ctx: ContextoRota): Promise<RespostaRota> {
  exigirSemEntrada(ctx);
  const info = ctx.container.janelaLogin.info();
  return {
    dados: {
      aberta: info !== null,
      url: info ? ctx.container.janelaLogin.enderecoManual() : null,
      expira_em: info ? info.expiraEm.toISOString() : null,
    },
  };
}
