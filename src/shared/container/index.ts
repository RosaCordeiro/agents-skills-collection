import type { Config } from '../../core/domain/entities/config';
import type { ErroSoftdesk } from '../../core/domain/errors/erro-softdesk';
import type { ILogger } from '../../core/domain/ports/logger';
import type { ISoftdeskGateway } from '../../core/domain/ports/softdesk.gateway';
import type { IRelogio } from '../../core/domain/ports/relogio';
import type { ISessaoStore } from '../../core/domain/ports/sessao.store';
import type { IJanelaLogin } from '../../core/domain/ports/janela-login';
import type { IAbridorNavegador } from '../../core/domain/ports/abridor-navegador';
import type { INotificador } from '../../core/domain/ports/notificador';
import { EntrarUseCase } from '../../core/application/useCases/entrar.use-case';
import {
  EstadoSessaoUseCase,
  type LerUltimoAlerta,
} from '../../core/application/useCases/estado-sessao.use-case';
import { criarExigirSessao, type ExigirSessao } from '../../core/application/services/exigir-sessao';
import { AlertaContrato } from '../../core/application/services/alerta-contrato';
import { criarOperacao } from '../../core/application/services/operacao';
import { SaudeAutomatica } from '../../core/application/services/saude-automatica';
import { Varredura } from '../../core/application/services/varredura';
import { ListarFilaUseCase } from '../../core/application/useCases/listar-fila.use-case';
import { PesquisarUseCase } from '../../core/application/useCases/pesquisar.use-case';
import { ObterChamadoUseCase } from '../../core/application/useCases/obter-chamado.use-case';
import { VerificarSaudeUseCase } from '../../core/application/useCases/verificar-saude.use-case';
import { MAX_BYTES_TODAS, MAX_ITENS_TODAS, MAX_PAGINAS_TODAS } from '../../core/domain/services/fila.service';
import { NotificadorNulo } from '../../infraestructure/notificacao/notificador-nulo';
import { NotificadorWindows } from '../../infraestructure/notificacao/notificador-windows';
import { criarLoggerClamed } from '../../infraestructure/logger/clamed-logger.adapter';
import { executarComContexto, novoCorrelationId } from '../../infraestructure/logger/contexto';
import { RelogioSistema } from '../../infraestructure/relogio/relogio-sistema';
import { AbridorNavegadorWindows } from '../../infraestructure/login/abridor-navegador.windows';
import { JanelaLoginServer, gracaLoginDoTimeout, type Agendar } from '../../infraestructure/login/janela-login.server';
import { SessaoMemoriaStore } from '../../infraestructure/sessao/sessao-memoria.store';
import { SoftdeskHttpGateway, TIMEOUT_PADRAO_MS } from '../../infraestructure/softdesk/softdesk-http.gateway';

/**
 * Composição por função, sem tsyringe (ARCH-001 §4, ADR-003).
 * Os fragmentos seguintes acrescentam seus objetos nos pontos marcados abaixo;
 * `substitutos` é como os testes trocam qualquer porta.
 */
export interface Container {
  config: Config;
  logger: ILogger;
  relogio: IRelogio;
  gateway: ISoftdeskGateway;
  sessaoStore: ISessaoStore;
  janelaLogin: IJanelaLogin;
  abridorNavegador: IAbridorNavegador;
  entrar: EntrarUseCase;
  estadoSessao: EstadoSessaoUseCase;
  /** Caminho único das consultas ao SoftDesk (RN-14). */
  exigirSessao: ExigirSessao;
  notificador: INotificador;
  /** Último alerta de contrato, aviso de deriva e balão (RF-07). */
  alerta: AlertaContrato;
  /** Uma varredura por vez, com prazo total e cancelamento (RNF-04, RNF-05). */
  varredura: Varredura;
  listarFila: ListarFilaUseCase;
  pesquisar: PesquisarUseCase;
  obterChamado: ObterChamadoUseCase;
  verificarSaude: VerificarSaudeUseCase;
  /** Uma verificação de saúde depois do primeiro login de cada início (ARCH §17 camada 5). */
  saudeAutomatica: SaudeAutomatica;
}

/** Objetos que os testes podem trocar (os casos de uso e `exigirSessao` são sempre montados). */
export type Substitutos = Partial<
  Pick<
    Container,
    'logger' | 'relogio' | 'gateway' | 'sessaoStore' | 'janelaLogin' | 'abridorNavegador' | 'notificador'
  >
>;

/** Ajustes só para teste (não são configuração do usuário). */
export interface OpcoesContainer {
  /** Prazo de cada chamada ao SoftDesk, em ms (padrão 20 s; os testes o reduzem). */
  timeoutSoftdeskMs?: number;
  /** Espera do `entrar` pelo login, em ms (padrão `esperaLoginSegundos` da configuração). */
  esperaLoginMs?: number;
  /** Vida da janela de login, em ms (padrão 5 min). */
  vidaJanelaMs?: number;
  /** Agendador do vencimento da janela (os testes usam um manual). */
  agendarJanela?: Agendar;
  /** Troca a leitura do último alerta de contrato (padrão: o do `alerta` do container). */
  ultimoAlerta?: LerUltimoAlerta;
  /** Prazo total de uma varredura, em ms (padrão `prazoVarreduraSegundos`; os testes o reduzem). */
  prazoVarreduraMs?: number;
  /** Intervalo mínimo entre balões do mesmo código, em ms (padrão 10 min). */
  intervaloBalaoMs?: number;
  /** Intervalo de conferência da sessão durante uma varredura, em ms (padrão 50). */
  intervaloSessaoMs?: number;
  /** Teto de páginas lidas no modo `todas` (padrão 15; os testes o reduzem). */
  maxPaginasTodas?: number;
  /** Teto de itens devolvidos no modo `todas` (padrão 300; os testes o alteram). */
  maxItensTodas?: number;
  /** Tamanho máximo do JSON dos itens no modo `todas`, em bytes (padrão 60.000; os testes o reduzem). */
  maxBytesTodas?: number;
  /** Falso desliga a saúde automática do primeiro login (padrão: ligada). */
  saudeAutomatica?: boolean;
}

export function montarContainer(
  config: Config,
  substitutos: Substitutos = {},
  opcoes: OpcoesContainer = {},
): Container {
  const relogio = substitutos.relogio ?? new RelogioSistema();
  const logger = substitutos.logger ?? criarLoggerClamed(config);
  const gateway =
    substitutos.gateway ??
    new SoftdeskHttpGateway({
      baseUrl: config.baseUrl,
      logger,
      relogio,
      timeoutMs: opcoes.timeoutSoftdeskMs,
    });
  const sessaoStore = substitutos.sessaoStore ?? new SessaoMemoriaStore();
  // Ganchos da janela: usam objetos montados mais abaixo (só são chamados depois da montagem).
  let aoLoginAceito: () => void = () => undefined;
  let aoLoginFalhar: (erro: ErroSoftdesk) => void = () => undefined;
  const abridorNavegador = substitutos.abridorNavegador ?? new AbridorNavegadorWindows();
  const janelaLogin =
    substitutos.janelaLogin ??
    new JanelaLoginServer({
      gateway,
      sessao: sessaoStore,
      abridor: abridorNavegador,
      logger,
      relogio,
      perfilPadrao: config.perfilPadrao,
      vidaMs: opcoes.vidaJanelaMs,
      gracaMs: gracaLoginDoTimeout(opcoes.timeoutSoftdeskMs ?? TIMEOUT_PADRAO_MS),
      agendar: opcoes.agendarJanela,
      aoLoginAceito: () => aoLoginAceito(),
      aoLoginFalhar: (erro) => aoLoginFalhar(erro),
    });
  // Balão do Windows só quando `notificarWindows` está ligado (RF-07); o resto do tempo, nada.
  const notificador =
    substitutos.notificador ?? (config.notificarWindows ? new NotificadorWindows({ logger }) : new NotificadorNulo());
  const alerta = new AlertaContrato({ logger, relogio, notificador, intervaloBalaoMs: opcoes.intervaloBalaoMs });
  const estadoSessao = new EstadoSessaoUseCase(
    sessaoStore,
    janelaLogin,
    opcoes.ultimoAlerta ?? (() => alerta.ultimo()),
  );
  const entrar = new EntrarUseCase(
    sessaoStore,
    janelaLogin,
    estadoSessao,
    opcoes.esperaLoginMs ?? config.esperaLoginSegundos * 1000,
  );
  const exigirSessao = criarExigirSessao({ sessao: sessaoStore, janela: janelaLogin });
  const operacao = criarOperacao({ logger, alerta });
  const varredura = new Varredura({
    gateway,
    sessao: sessaoStore,
    prazoMs: opcoes.prazoVarreduraMs ?? config.prazoVarreduraSegundos * 1000,
    intervaloSessaoMs: opcoes.intervaloSessaoMs,
  });
  const limitesTodas = {
    maxPaginas: opcoes.maxPaginasTodas ?? MAX_PAGINAS_TODAS,
    maxItens: opcoes.maxItensTodas ?? MAX_ITENS_TODAS,
    maxBytes: opcoes.maxBytesTodas ?? MAX_BYTES_TODAS,
  };
  const listarFila = new ListarFilaUseCase({ config, exigirSessao, varredura, operacao, alerta, limitesTodas });
  const pesquisar = new PesquisarUseCase({ gateway, exigirSessao, varredura, operacao, alerta, limitesTodas });
  const obterChamado = new ObterChamadoUseCase({ gateway, exigirSessao, operacao, alerta });
  const verificarSaude = new VerificarSaudeUseCase({
    config,
    gateway,
    sessao: sessaoStore,
    exigirSessao,
    operacao,
    alerta,
  });
  const saudeAutomatica = new SaudeAutomatica({
    verificarSaude,
    logger,
    habilitada: opcoes.saudeAutomatica ?? true,
    emContexto: (fn) => executarComContexto({ correlationId: novoCorrelationId() }, fn),
  });
  aoLoginAceito = () => saudeAutomatica.disparar();
  aoLoginFalhar = (erro) => alerta.registrarErro(erro);
  return {
    config,
    logger,
    relogio,
    gateway,
    sessaoStore,
    janelaLogin,
    abridorNavegador,
    entrar,
    estadoSessao,
    exigirSessao,
    notificador,
    alerta,
    varredura,
    listarFila,
    pesquisar,
    obterChamado,
    verificarSaude,
    saudeAutomatica,
  };
}
