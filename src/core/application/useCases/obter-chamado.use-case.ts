import type { ChamadoBruto } from '../../domain/entities/chamado';
import { ErroSoftdesk } from '../../domain/errors/erro-softdesk';
import type { ISoftdeskGateway } from '../../domain/ports/softdesk.gateway';
import { schemaCodigoChamado, validarEntrada } from '../../../shared/schemas/entrada.schemas';
import type { AlertaContrato } from '../services/alerta-contrato';
import type { ExigirSessao } from '../services/exigir-sessao';
import type { ExecutarOperacao, ResultadoConsulta } from '../services/operacao';
import type { OpcoesExecucao } from './listar-fila.use-case';

/** Dados do chamado completo: o item de `lista` como veio, sem remodelar (RN-06). */
export interface DadosChamado {
  chamado: ChamadoBruto;
}

/**
 * RF-05 (ARCH-001 §6 F5): pesquisa pelo código (`limite: 10`) e exige igualdade exata em
 * `cd_chamado`. Inexistente e fora da visibilidade da sessão são indistinguíveis: `NAO_ENCONTRADO`.
 */
export class ObterChamadoUseCase {
  constructor(
    private readonly deps: {
      gateway: ISoftdeskGateway;
      exigirSessao: ExigirSessao;
      operacao: ExecutarOperacao;
      alerta: AlertaContrato;
    },
  ) {}

  async executar(entrada: unknown, opcoes: OpcoesExecucao = {}): Promise<ResultadoConsulta<DadosChamado>> {
    let codigoPedido: number | undefined;
    return this.deps.operacao(
      {
        name: 'chamado',
        action: 'get',
        camposFim: () => ({ cd_chamado: codigoPedido }),
      },
      async () => {
        const { codigo } = validarEntrada(schemaCodigoChamado, entrada);
        codigoPedido = codigo;
        return this.deps.exigirSessao(async (sessao) => {
          const pagina = await this.deps.gateway.pesquisar(sessao, { codigo, limite: 10 }, opcoes.sinal);
          const aviso = this.deps.alerta.avisoDeriva(pagina.deriva);
          const achado = pagina.lista.find((item) => item.cd_chamado === codigo);
          if (!achado) throw new ErroSoftdesk('NAO_ENCONTRADO');
          const dados: DadosChamado = { chamado: achado };
          return aviso ? { dados, aviso_deriva: aviso } : { dados };
        });
      },
    );
  }
}
