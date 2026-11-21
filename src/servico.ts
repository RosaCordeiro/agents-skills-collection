import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { Config } from './core/domain/entities/config';
import { ErroConfig, carregarConfig } from './infraestructure/config/carregar-config';
import {
  apagarDescoberta,
  gravarDescoberta,
  type ExecutarIcacls,
} from './infraestructure/descoberta/arquivo-descoberta';
import { criarServidorRest, ErroPortaOcupada, MENSAGEM_PORTA_OCUPADA, type ServidorRest } from './presentation/rest/servidor';
import { montarContainer, type Container, type OpcoesContainer, type Substitutos } from './shared/container';

/**
 * Entrada do serviço (ARCH-001 §6 F9, §7.2, §8.1). Monta o container com a configuração real,
 * sobe o REST em 127.0.0.1, grava o arquivo de descoberta e trata a parada (SIGINT, SIGTERM ou
 * `POST /v1/servico/parar`). NÃO há encerramento por ociosidade (RN-15, ADR-001): a sessão só cai
 * quando o SoftDesk a rejeita.
 */

export function lerVersao(): string {
  try {
    const pacote = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8')) as { version?: unknown };
    return typeof pacote.version === 'string' ? pacote.version : '0.0.0';
  } catch {
    return '0.0.0';
  }
}

export interface OpcoesServico {
  /** Padrão: `carregarConfig({ env })`. */
  config?: Config;
  env?: NodeJS.ProcessEnv;
  substitutos?: Substitutos;
  opcoesContainer?: OpcoesContainer;
  /** Falso pula o `icacls` (testes). Padrão: só no Windows. */
  restringirAcl?: boolean;
  executarIcacls?: ExecutarIcacls;
  /** Porta de escuta; padrão `config.porta`. `0` escolhe uma livre (testes). */
  porta?: number;
  /** Liga SIGINT e SIGTERM à parada (só o processo do serviço, não os testes). */
  tratarSinais?: boolean;
  versao?: string;
}

export interface ServicoEmExecucao {
  container: Container;
  servidor: ServidorRest;
  porta: number;
  token: string;
  /** Parada limpa e idempotente: janela, varredura, sessão, descoberta, porta. */
  parar(): Promise<void>;
  /** Resolve quando a parada terminou (por sinal, rota ou chamada direta). */
  aguardarParada(): Promise<void>;
}

export async function iniciarServico(opcoes: OpcoesServico = {}): Promise<ServicoEmExecucao> {
  const config = opcoes.config ?? carregarConfig({ env: opcoes.env });
  const container = montarContainer(config, opcoes.substitutos, opcoes.opcoesContainer);
  const { logger } = container;
  const token = crypto.randomBytes(32).toString('hex');
  const iniciadoEm = new Date();
  const versao = opcoes.versao ?? lerVersao();

  let parando: Promise<void> | null = null;
  let concluir: () => void = () => undefined;
  const parada = new Promise<void>((resolve) => {
    concluir = resolve;
  });

  const pararServico = (): Promise<void> => {
    if (parando) return parando;
    parando = (async () => {
      const porta = rest.porta;
      container.janelaLogin.fechar();
      container.listarFila.cancelarTodas();
      container.sessaoStore.descartar('parada');
      apagarDescoberta(config.diretorio);
      await rest.parar();
      try {
        logger.info('Serviço parado', {
          event: { name: 'servico', action: 'stop', outcome: 'success' },
          porta,
          versao,
          pid: process.pid,
        });
      } catch {
        // log nunca derruba a parada
      }
      concluir();
    })();
    return parando;
  };

  const rest = criarServidorRest({
    container,
    token,
    porta: opcoes.porta,
    info: { versao, pid: process.pid, iniciadoEm, parar: () => void pararServico() },
  });

  // 1. Porta primeiro: quem perde a disputa sai sem tocar no arquivo da instância que já roda.
  await rest.iniciar();

  // 2. ACL da pasta e só então o arquivo de descoberta.
  try {
    await gravarDescoberta(
      config.diretorio,
      { porta: rest.porta, token, pid: process.pid, iniciado_em: iniciadoEm.toISOString(), versao },
      { logger, restringirAcl: opcoes.restringirAcl, executarIcacls: opcoes.executarIcacls },
    );
  } catch (e) {
    await rest.parar();
    throw e;
  }

  try {
    logger.info('Serviço iniciado', {
      event: { name: 'servico', action: 'start', outcome: 'success' },
      porta: rest.porta,
      versao,
      pid: process.pid,
    });
  } catch {
    // log nunca derruba o início
  }

  if (opcoes.tratarSinais) {
    for (const sinal of ['SIGINT', 'SIGTERM'] as const) process.once(sinal, () => void pararServico());
  }

  return { container, servidor: rest, porta: rest.porta, token, parar: pararServico, aguardarParada: () => parada };
}

/** Ponto de entrada de `node dist/servico.js`. */
export async function principal(): Promise<void> {
  let servico: ServicoEmExecucao;
  try {
    servico = await iniciarServico({ tratarSinais: true });
  } catch (e) {
    if (e instanceof ErroPortaOcupada) {
      process.stderr.write(`softdesk-local: ${MENSAGEM_PORTA_OCUPADA}\n`);
    } else if (e instanceof ErroConfig) {
      process.stderr.write(`softdesk-local: ${e.message}\n`);
    } else {
      // Sem a mensagem da exceção (pode trazer caminho ou trecho de dado): só o tipo do problema.
      process.stderr.write('softdesk-local: não foi possível iniciar o serviço (veja o log).\n');
    }
    process.exitCode = 1;
    return;
  }
  await servico.aguardarParada();
  // Dá um instante para o logger descarregar o arquivo antes de o processo terminar.
  setTimeout(() => process.exit(0), 200);
}

if (require.main === module) {
  void principal();
}
