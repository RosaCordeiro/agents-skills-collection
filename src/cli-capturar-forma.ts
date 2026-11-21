import fs from 'node:fs';
import path from 'node:path';
import type { Config } from './core/domain/entities/config';
import { ehErroSoftdesk } from './core/domain/errors/erro-softdesk';
import type { IAbridorNavegador } from './core/domain/ports/abridor-navegador';
import type { ILogger } from './core/domain/ports/logger';
import { ErroConfig, carregarConfig } from './infraestructure/config/carregar-config';
import { NotificadorNulo } from './infraestructure/notificacao/notificador-nulo';
import { carregarContrato } from './infraestructure/softdesk/contrato';
import {
  compararForma,
  descreverDiferenca,
  NOME_ESCOPO,
  formaDaPesquisa,
  formaDoLogin,
  paraArquivoForma,
  temDiferenca,
  trocasCriticas,
  unirNoDourado,
  type FormaObservada,
} from './infraestructure/softdesk/forma';
import { SoftdeskHttpGateway } from './infraestructure/softdesk/softdesk-http.gateway';
import { montarContainer } from './shared/container';

/**
 * `npm run capturar-forma` (ARCH-001 §17 camada 6, VAL-32): versão produtiva do protótipo de captura.
 * Abre a janela de login (a senha só é digitada no navegador), entra, faz uma pesquisa mínima pelo
 * gateway, grava `forma-atual.json` com SÓ nomes de campos e tipos (nunca valores) e imprime a diferença
 * contra o contrato dourado: campos novos, ausentes e com tipo trocado. Com `--atualizar` regrava o
 * dourado UNINDO os conjuntos de tipos observados (campo ausente continua no contrato).
 * Não escreve nada em log: o terminal é a única saída (o log do serviço fica só do serviço).
 */

const LOGGER_MUDO: ILogger = { info: () => undefined, warn: () => undefined, error: () => undefined };

/**
 * Itens lidos na pesquisa de captura. 200 é o máximo de uma página do SoftDesk: uma amostra grande mostra
 * os campos que ora vêm nulos, ora com valor. Mesmo assim, regere o dourado com uma amostra grande e
 * variada no 1º uso real (README, "Contrato dourado").
 */
export const LIMITE_CAPTURA = 200;

/** Código de saída quando `--atualizar` recusou trocas de tipo de campo essencial ou usado. */
export const SAIDA_TROCA_DE_TIPO = 3;

export interface OpcoesCaptura {
  /** Padrão: `carregarConfig({ env })`. */
  config?: Config;
  env?: NodeJS.ProcessEnv;
  /** Padrão: o navegador do Windows (o endereço é impresso se ele não abrir). */
  abridor?: IAbridorNavegador;
  /** Uma linha por chamada; o programa real escreve em stdout. */
  saida: (linha: string) => void;
  /** Onde gravar `forma-atual.json`. */
  arquivoForma: string;
  /** O `contrato-dourado.json` do código-fonte (lido para comparar e, com `atualizar`, regravado). */
  arquivoDourado: string;
  atualizar?: boolean;
  /** Com `atualizar`: aceita trocar o tipo de campo essencial ou usado no dourado (passo humano, deliberado). */
  aceitarTrocaDeTipo?: boolean;
  /** Espera por tentativa de login, em ms (padrão: `esperaLoginSegundos` da configuração). */
  esperaLoginMs?: number;
  /** Tentativas de espera (padrão 3; a janela vive 5 min). */
  tentativasLogin?: number;
  timeoutSoftdeskMs?: number;
  agora?: () => Date;
}

/**
 * Devolve o código de saída: 0 se capturou algo, 1 se o login falhou ou nada foi capturado, 3 se o
 * `--atualizar` recusou trocas de tipo de campo essencial ou usado (sem `--aceitar-troca-de-tipo`).
 */
export async function capturarForma(opcoes: OpcoesCaptura): Promise<number> {
  const { saida } = opcoes;
  const agora = opcoes.agora ?? (() => new Date());
  const config = opcoes.config ?? carregarConfig({ env: opcoes.env ?? process.env });

  const forma: FormaObservada = { login: null, topo: null, treeview: null, item: null };
  const gateway = new SoftdeskHttpGateway({
    baseUrl: config.baseUrl,
    logger: LOGGER_MUDO,
    timeoutMs: opcoes.timeoutSoftdeskMs,
    observarForma: (rota, json) => {
      if (rota === 'login') forma.login = formaDoLogin(json) ?? forma.login;
      else Object.assign(forma, Object.fromEntries(Object.entries(formaDaPesquisa(json)).filter(([, v]) => v !== null)));
    },
  });
  const container = montarContainer(
    config,
    { gateway, logger: LOGGER_MUDO, notificador: new NotificadorNulo(), ...(opcoes.abridor ? { abridorNavegador: opcoes.abridor } : {}) },
    { saudeAutomatica: false, timeoutSoftdeskMs: opcoes.timeoutSoftdeskMs },
  );
  const janela = container.janelaLogin;

  try {
    // 1. Login pela janela local.
    const info = await janela.abrirOuReaproveitar();
    if (info.navegadorAberto) {
      saida('A janela de login abriu no navegador. Digite usuario e senha la; nada passa por este terminal.');
    } else {
      saida('O navegador nao abriu sozinho. Abra este endereco no navegador (vale uma vez e por poucos minutos):');
      saida(janela.enderecoManual() ?? '(janela indisponivel)');
    }
    const espera = opcoes.esperaLoginMs ?? config.esperaLoginSegundos * 1000;
    let resultado = await janela.aguardarResultado(espera);
    for (let i = 1; resultado === 'TEMPO' && i < (opcoes.tentativasLogin ?? 3); i++) {
      saida('Aguardando o login na janela...');
      resultado = await janela.aguardarResultado(espera);
    }
    if (resultado === 'TEMPO') {
      saida('Nao houve login a tempo. Rode o comando de novo.');
      return 1;
    }
    if (!resultado.ok) {
      saida(`Login recusado: ${resultado.erro.codigo}. Nada foi capturado do login.`);
      return 1;
    }

    // 2. Pesquisa mínima pelo gateway (a conferência de contrato não derruba a captura: o que chegou é observado antes).
    const sessao = container.sessaoStore.obter();
    if (!sessao) {
      saida('Sem sessao apos o login. Rode o comando de novo.');
      return 1;
    }
    try {
      await gateway.pesquisar(sessao, { atendente: [config.cdAtendente], limite: LIMITE_CAPTURA });
    } catch (e) {
      if (ehErroSoftdesk(e)) {
        const campos = e.campos && e.campos.length > 0 ? ` (campos: ${e.campos.join(', ')})` : '';
        saida(`A pesquisa foi recusada pelo contrato atual: ${e.codigo}${campos}. A forma recebida foi capturada mesmo assim.`);
      } else {
        saida('A pesquisa falhou por erro inesperado.');
      }
    }
  } finally {
    janela.fechar();
  }

  if (!forma.login && !forma.topo) {
    saida('Nada foi capturado.');
    return 1;
  }

  // 3. Forma atual (só nomes e tipos) e diferença contra o dourado.
  const brutoDourado = JSON.parse(fs.readFileSync(opcoes.arquivoDourado, 'utf8').replace(/^﻿/, '')) as unknown;
  const dourado = carregarContrato(brutoDourado);
  const quando = agora();
  fs.writeFileSync(opcoes.arquivoForma, `${JSON.stringify(paraArquivoForma(forma, quando), null, 2)}\n`, 'utf8');
  saida(`Forma atual gravada em ${opcoes.arquivoForma} (so nomes e tipos).`);

  const diferenca = compararForma(forma, dourado);
  for (const linha of descreverDiferenca(forma, diferenca)) saida(linha);

  // 4. Atualização do dourado, só a pedido.
  if (opcoes.atualizar) {
    const criticas = trocasCriticas(brutoDourado, forma);
    const aceitar = opcoes.aceitarTrocaDeTipo === true;
    const novo = unirNoDourado(brutoDourado, forma, quando.toISOString().slice(0, 10), { aceitarTrocaDeTipo: aceitar });
    fs.writeFileSync(opcoes.arquivoDourado, `${JSON.stringify(novo, null, 2)}\n`, 'utf8');
    saida(`Contrato dourado atualizado (tipos unidos): ${opcoes.arquivoDourado}`);
    saida('Campos novos entraram como "outro"; promova a "usado" ou "essencial" no arquivo, se for o caso.');
    if (criticas.length > 0) {
      saida(
        aceitar
          ? 'ATENCAO: troca de tipo ACEITA em campo essencial ou usado (--aceitar-troca-de-tipo). Ajuste o mapeamento (chamado.ts, fila.service.ts) para o novo tipo:'
          : 'ATENCAO: troca de tipo em campo essencial ou usado. Estes campos NAO foram regravados no dourado (ajuste o mapeamento em chamado.ts e fila.service.ts e rode de novo com --aceitar-troca-de-tipo):',
      );
      for (const t of criticas) {
        saida(`  TROCA    ${NOME_ESCOPO[t.escopo]}.${t.nome} (${t.marca}): esperado [${t.esperado.join(', ')}], observado [${t.observado.join(', ')}]`);
      }
    }
    saida('Proximos passos: npm run build, npm test e npm run servico:parar.');
    if (criticas.length > 0 && !aceitar) return SAIDA_TROCA_DE_TIPO;
  } else if (temDiferenca(diferenca)) {
    saida('Para aceitar esta forma no contrato dourado: npm run capturar-forma -- --atualizar');
  }
  return 0;
}

/** Ponto de entrada de `node dist/cli-capturar-forma.js [--atualizar]`. */
export async function principal(): Promise<void> {
  const raiz = path.resolve(__dirname, '..');
  const argumentos = process.argv.slice(2);
  const desconhecido = argumentos.find((a) => a !== '--atualizar' && a !== '--aceitar-troca-de-tipo');
  if (desconhecido !== undefined || (argumentos.includes('--aceitar-troca-de-tipo') && !argumentos.includes('--atualizar'))) {
    process.stderr.write('uso: npm run capturar-forma [-- --atualizar [--aceitar-troca-de-tipo]]\n');
    process.exitCode = 2;
    return;
  }
  let codigo = 1;
  try {
    codigo = await capturarForma({
      saida: (linha) => process.stdout.write(`${linha}\n`),
      arquivoForma: path.join(raiz, 'forma-atual.json'),
      arquivoDourado: path.join(raiz, 'src', 'infraestructure', 'softdesk', 'contrato-dourado.json'),
      atualizar: argumentos.includes('--atualizar'),
      aceitarTrocaDeTipo: argumentos.includes('--aceitar-troca-de-tipo'),
    });
  } catch (e) {
    // Sem a mensagem da exceção: pode trazer caminho ou trecho de dado.
    process.stderr.write(e instanceof ErroConfig ? `softdesk-local: ${e.message}\n` : 'softdesk-local: a captura falhou.\n');
  }
  process.exitCode = codigo;
  setTimeout(() => process.exit(codigo), 100);
}

if (require.main === module) {
  void principal();
}
