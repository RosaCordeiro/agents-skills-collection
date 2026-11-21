/**
 * Taxonomia de erros tipados (ARCH-001 §7.3, SPEC-001 RN-07).
 * Domínio puro: sem HTTP, sem MCP. O status HTTP é só uma sugestão de mapeamento
 * para a camada REST; o MCP usa `codigo`.
 */

export const CODIGOS_ERRO = [
  'AGUARDANDO_LOGIN',
  'SESSAO_EXPIRADA',
  'CREDENCIAL',
  'REDE',
  'LAYOUT_LOGIN_MUDOU',
  'CONTRATO_ROTA_MUDOU',
  'NAO_ENCONTRADO',
  'FILTRO_INVALIDO',
  'NAO_AUTORIZADO',
  'SERVICO_INDISPONIVEL',
  'ERRO_INTERNO',
  'NAO_DISPONIVEL',
] as const;

export type CodigoErro = (typeof CODIGOS_ERRO)[number];

/** Evidência de uma quebra de contrato: nunca corpo nem cabeçalhos (RN-13). */
export interface EvidenciaContrato {
  http_status?: number;
  content_type?: string;
  /** Só o caminho do `Location`, sem query string. */
  location_path?: string;
}

interface DefinicaoErro {
  /** Status HTTP sugerido para o REST; `null` quando o código não trafega por REST. */
  http: number | null;
  destaque: boolean;
  mensagem: string;
  acao: string;
}

export const DEFINICOES_ERRO: Readonly<Record<CodigoErro, DefinicaoErro>> = {
  AGUARDANDO_LOGIN: {
    http: 409,
    destaque: false,
    mensagem: 'Não há sessão no SoftDesk. Uma janela de login local foi aberta (ou já estava aberta).',
    acao: 'Entre na janela de login aberta no navegador e repita o pedido. Se o navegador não abriu, rode "npm run entrar" no terminal.',
  },
  SESSAO_EXPIRADA: {
    http: 409,
    destaque: false,
    mensagem: 'A sessão no SoftDesk expirou.',
    acao: 'Entre de novo na janela de login aberta no navegador e repita o pedido.',
  },
  CREDENCIAL: {
    http: 422,
    destaque: false,
    mensagem: 'O SoftDesk recusou o login.',
    acao: 'Confira usuário, senha e perfil e peça para entrar de novo.',
  },
  REDE: {
    http: 502,
    destaque: false,
    mensagem: 'Não foi possível falar com o SoftDesk (conexão, tempo esgotado ou erro do servidor).',
    acao: 'Confira a rede ou a VPN da Clamed e tente de novo mais tarde.',
  },
  LAYOUT_LOGIN_MUDOU: {
    http: 502,
    destaque: true,
    mensagem: 'A página ou a resposta de login do SoftDesk mudou de formato.',
    acao: 'Não é problema de senha nem de sessão. Avise o responsável pelo SoftDesk Local para ajustar o adaptador.',
  },
  CONTRATO_ROTA_MUDOU: {
    http: 502,
    destaque: true,
    mensagem: 'A rota de pesquisa do SoftDesk mudou de formato.',
    acao: 'Não é problema de sessão. Use o MCP oficial do SoftDesk enquanto isso e avise o responsável pelo SoftDesk Local.',
  },
  NAO_ENCONTRADO: {
    http: 404,
    destaque: false,
    mensagem: 'Chamado não encontrado (inexistente ou fora da visibilidade da sessão).',
    acao: 'Confira o código do chamado.',
  },
  FILTRO_INVALIDO: {
    http: 400,
    destaque: false,
    mensagem: 'Os filtros informados são inválidos.',
    acao: 'Corrija os campos indicados e repita o pedido.',
  },
  NAO_AUTORIZADO: {
    http: 401,
    destaque: false,
    mensagem: 'Pedido não autorizado pelo serviço local.',
    acao: 'Use o MCP ou o comando do projeto, que leem o arquivo de descoberta do serviço.',
  },
  SERVICO_INDISPONIVEL: {
    http: null,
    destaque: false,
    mensagem: 'Não foi possível iniciar ou alcançar o serviço local do SoftDesk.',
    acao: 'Veja o log em %LOCALAPPDATA%\\softdesk-local\\logs e tente "npm run servico".',
  },
  ERRO_INTERNO: {
    http: 500,
    destaque: false,
    mensagem: 'Erro interno inesperado no serviço local.',
    acao: 'Veja o log do serviço pelo correlation_id da resposta.',
  },
  NAO_DISPONIVEL: {
    http: 501,
    destaque: false,
    mensagem: 'Esta consulta ainda não está disponível.',
    acao: 'Use o MCP oficial do SoftDesk (dossie_chamado) enquanto isso.',
  },
};

export interface OpcoesErro {
  /** Substitui a mensagem fixa; nunca inclua usuário, título, nome ou texto do SoftDesk. */
  mensagem?: string;
  acao?: string;
  evidencia?: EvidenciaContrato;
  /** Nomes (nunca valores) de campos do contrato que faltaram ou mudaram de tipo (RN-17). */
  campos?: string[];
  /** Só nos códigos de sessão: se a janela de login está aberta (vira bloco `janela` do envelope). */
  janela?: { aberta: boolean };
}

export class ErroSoftdesk extends Error {
  readonly codigo: CodigoErro;
  /** Texto para o usuário; fixo por código, a menos que o chamador substitua. */
  readonly mensagem: string;
  readonly acao: string;
  /** `true` só em LAYOUT_LOGIN_MUDOU e CONTRATO_ROTA_MUDOU (vira bloco `alerta`). */
  readonly destaque: boolean;
  readonly evidencia?: EvidenciaContrato;
  readonly campos?: string[];
  readonly janela?: { aberta: boolean };

  constructor(codigo: CodigoErro, opcoes: OpcoesErro = {}) {
    const def = DEFINICOES_ERRO[codigo];
    // `message` do Error recebe só o código: nenhum texto livre vaza por log ou stack.
    super(codigo);
    this.name = 'ErroSoftdesk';
    this.codigo = codigo;
    this.mensagem = opcoes.mensagem ?? def.mensagem;
    this.acao = opcoes.acao ?? def.acao;
    this.destaque = def.destaque;
    this.evidencia = opcoes.evidencia;
    this.campos = opcoes.campos;
    this.janela = opcoes.janela;
    Object.setPrototypeOf(this, ErroSoftdesk.prototype);
  }

  /** Status HTTP sugerido para o REST (`null` quando o código não passa pelo REST). */
  get statusHttp(): number | null {
    return DEFINICOES_ERRO[this.codigo].http;
  }
}

export function ehErroSoftdesk(valor: unknown): valor is ErroSoftdesk {
  return valor instanceof ErroSoftdesk;
}
