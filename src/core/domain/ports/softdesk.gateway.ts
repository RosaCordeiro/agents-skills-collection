import type { ChamadoBruto } from '../entities/chamado';
import type { FiltroPesquisa } from '../entities/filtro-pesquisa';
import type { PerfilLogin, SessaoHttp } from '../entities/sessao';

/** Diferença entre a resposta e o contrato dourado, só com nomes de campos (RN-17, ARCH §17 camada 5). */
export interface DerivaDetalhada {
  novos: string[];
  ausentes: string[];
  tipo_trocado: string[];
}

export interface PaginaPesquisa {
  lista: ChamadoBruto[];
  /** `treeview.total` do SoftDesk (inclui fechados). */
  total: number;
  /**
   * Nomes (nunca valores) de campos usados nas listas que faltaram ou mudaram de tipo nesta
   * resposta (RN-17). Vazio ou ausente quando não houve deriva; vira `aviso_deriva` no envelope.
   */
  deriva?: string[];
  /**
   * Diagnóstico completo da resposta contra o contrato dourado (de todas as marcas), só nomes.
   * Ausente quando não há nenhuma diferença. Só é calculado com `opcoes.diagnosticar` (a saúde); alimenta `deriva`.
   */
  diagnostico?: DerivaDetalhada;
  /**
   * Nomes de `diagnostico.ausentes`/`tipo_trocado` cuja marca no contrato é `outro` (campo que nenhum
   * mapeamento usa): só vão para o log, nunca para balão nem `ultimo_alerta`.
   */
  diagnostico_outros?: string[];
}

export interface OpcoesPesquisaGateway {
  /** Calcula `diagnostico` (custo: todos os campos de todos os itens). Padrão: não. */
  diagnosticar?: boolean;
}

/**
 * Único ponto de contato com o SoftDesk (somente leitura, RN-01):
 * GET /login, POST /login e GET /chamado/json.
 */
export interface ISoftdeskGateway {
  /** Só `GET /login`; confere o cookie XSRF. */
  conferirPaginaLogin(sinal?: AbortSignal): Promise<void>;
  /** A senha só vive nesta chamada; o gateway não a guarda nem a loga. */
  autenticar(usuario: string, senha: string, perfil: PerfilLogin, sinal?: AbortSignal): Promise<SessaoHttp>;
  /** Atualiza os cookies de `sessao` com os `Set-Cookie` recebidos (o SoftDesk pode renovar o token). */
  pesquisar(
    sessao: SessaoHttp,
    filtro: FiltroPesquisa,
    sinal?: AbortSignal,
    opcoes?: OpcoesPesquisaGateway,
  ): Promise<PaginaPesquisa>;
}
