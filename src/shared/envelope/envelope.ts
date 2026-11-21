import { ehErroSoftdesk, ErroSoftdesk, type CodigoErro } from '../../core/domain/errors/erro-softdesk';

/**
 * Montador do envelope de resposta (ARCH-001 §7.3), único para REST e MCP (o MCP repassa o
 * envelope recebido do serviço). Fica em `shared` porque é contrato de saída usado por mais de
 * uma entrada e depende só do domínio (`ErroSoftdesk`), não de HTTP nem de MCP.
 */

export interface EnvelopeSucesso<T> {
  success: true;
  dados: T;
  /** Só quando um campo usado nas listas faltou ou mudou de tipo (RN-17). */
  aviso_deriva?: { campos: string[] };
  correlation_id: string;
}

export interface EnvelopeErro {
  success: false;
  error: {
    code: CodigoErro;
    message: string;
    acao: string;
    destaque: boolean;
    /** Só nomes de campos (filtro inválido ou contrato), nunca valores. */
    campos?: string[];
  };
  /** Só nos dois códigos de destaque (LAYOUT_LOGIN_MUDOU, CONTRATO_ROTA_MUDOU). */
  alerta?: { titulo: string; o_que_fazer: string };
  /** Só nos códigos de sessão. */
  janela?: { aberta: boolean };
  correlation_id: string;
}

export type Envelope<T> = EnvelopeSucesso<T> | EnvelopeErro;

const TITULO_ALERTA: Partial<Record<CodigoErro, string>> = {
  CONTRATO_ROTA_MUDOU: 'ATENÇÃO: o SoftDesk mudou a rota de pesquisa',
  LAYOUT_LOGIN_MUDOU: 'ATENÇÃO: o SoftDesk mudou a página de login',
};

export function montarEnvelopeSucesso<T>(
  dados: T,
  correlationId: string,
  avisoDeriva?: { campos: string[] },
): EnvelopeSucesso<T> {
  return {
    success: true,
    dados,
    ...(avisoDeriva && avisoDeriva.campos.length > 0 ? { aviso_deriva: { campos: [...avisoDeriva.campos] } } : {}),
    correlation_id: correlationId,
  };
}

/** Qualquer exceção que não seja `ErroSoftdesk` vira `ERRO_INTERNO` (sem texto da exceção). */
export function comoErroSoftdesk(e: unknown): ErroSoftdesk {
  return ehErroSoftdesk(e) ? e : new ErroSoftdesk('ERRO_INTERNO');
}

export function montarEnvelopeErro(e: unknown, correlationId: string): EnvelopeErro {
  const erro = comoErroSoftdesk(e);
  const titulo = TITULO_ALERTA[erro.codigo];
  return {
    success: false,
    error: {
      code: erro.codigo,
      message: erro.mensagem,
      acao: erro.acao,
      destaque: erro.destaque,
      ...(erro.campos && erro.campos.length > 0 ? { campos: [...erro.campos] } : {}),
    },
    ...(erro.destaque && titulo ? { alerta: { titulo, o_que_fazer: erro.acao } } : {}),
    ...(erro.janela ? { janela: { aberta: erro.janela.aberta } } : {}),
    correlation_id: correlationId,
  };
}

/** Status HTTP sugerido para o REST (500 para erro inesperado; 502 se o código não passa pelo REST). */
export function statusHttpDoErro(e: unknown): number {
  return comoErroSoftdesk(e).statusHttp ?? 502;
}
