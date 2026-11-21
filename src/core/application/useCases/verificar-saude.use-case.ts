import type { Config } from '../../domain/entities/config';
import type { ISessaoStore } from '../../domain/ports/sessao.store';
import type { DerivaDetalhada, ISoftdeskGateway } from '../../domain/ports/softdesk.gateway';
import type { AlertaContrato } from '../services/alerta-contrato';
import type { ExigirSessao } from '../services/exigir-sessao';
import type { ExecutarOperacao, ResultadoConsulta } from '../services/operacao';
import type { OpcoesExecucao } from './listar-fila.use-case';

export interface DadosSaude {
  ok: true;
  modo: 'login' | 'pesquisa';
  duracao_ms: number;
  /**
   * Diagnóstico contra o contrato dourado (ARCH §17 camada 5, VAL-32): só nomes de campos novos,
   * ausentes e com tipo trocado, de todas as marcas. Ausente quando a resposta bate com o contrato.
   */
  deriva?: DerivaDetalhada;
}

/**
 * RF-06 (ARCH-001 §6 F6): sem sessão só confere a página de login (`GET /login` com o cookie
 * XSRF), NÃO abre a janela nem pede senha; com sessão faz a pesquisa mínima (`limite: 1`, atendente
 * configurado) e confere o contrato. Falha de contrato vira o erro tipado (e o alerta).
 */
export class VerificarSaudeUseCase {
  constructor(
    private readonly deps: {
      config: Pick<Config, 'cdAtendente'>;
      gateway: ISoftdeskGateway;
      sessao: ISessaoStore;
      exigirSessao: ExigirSessao;
      operacao: ExecutarOperacao;
      alerta: AlertaContrato;
    },
  ) {}

  async executar(opcoes: OpcoesExecucao = {}): Promise<ResultadoConsulta<DadosSaude>> {
    return this.deps.operacao(
      {
        name: 'saude',
        action: 'check',
        camposFim: (r) => ({ modo: r.dados.modo }),
      },
      async () => {
        const inicio = Date.now();
        if (this.deps.sessao.obter() === null) {
          await this.deps.gateway.conferirPaginaLogin(opcoes.sinal);
          return { dados: { ok: true, modo: 'login', duracao_ms: Date.now() - inicio } };
        }
        return this.deps.exigirSessao(async (sessao) => {
          const pagina = await this.deps.gateway.pesquisar(
            sessao,
            { atendente: [this.deps.config.cdAtendente], limite: 1 },
            opcoes.sinal,
            { diagnosticar: true },
          );
          const aviso = this.deps.alerta.avisoDeriva(pagina.deriva);
          // Deriva do diagnóstico: campo essencial/usado gera log, ultimo_alerta e balão; campo `outro`
          // (que nenhum mapeamento usa) só vai para o log.
          const jaAvisados = new Set(aviso?.campos ?? []);
          const outros = new Set(pagina.diagnostico_outros ?? []);
          const achados = [...(pagina.diagnostico?.ausentes ?? []), ...(pagina.diagnostico?.tipo_trocado ?? [])];
          this.deps.alerta.derivaDiagnostico(
            achados.filter((n) => !jaAvisados.has(n) && !outros.has(n)),
            achados.filter((n) => !jaAvisados.has(n) && outros.has(n)),
          );
          const dados: DadosSaude = {
            ok: true,
            modo: 'pesquisa',
            duracao_ms: Date.now() - inicio,
            ...(pagina.diagnostico ? { deriva: pagina.diagnostico } : {}),
          };
          return aviso ? { dados, aviso_deriva: aviso } : { dados };
        });
      },
    );
  }
}
