import { resolverDiretorio } from './infraestructure/config/carregar-config';
import { ClienteServico } from './presentation/mcp/cliente-servico';

/**
 * `npm run entrar` (ARCH-001 §8.1): pede `POST /v1/sessao/entrar` ao serviço (que abre a janela de
 * login no navegador) e espera o resultado. Se o navegador não abriu, mostra no terminal o endereço
 * de `GET /v1/sessao/janela`; esse é o único lugar onde o endereço (com o token de uso único) aparece,
 * nunca em log nem em arquivo. A senha só é digitada na janela: este programa não a vê nem a pede.
 * Se o serviço está parado, o próprio cliente o inicia (F9).
 */

export interface OpcoesEntrar {
  cliente: Pick<ClienteServico, 'chamar'>;
  /** Uma linha por chamada; o programa real escreve em stdout. */
  saida: (linha: string) => void;
  /** Quanto esperar antes de olhar o estado da janela (padrão 1 s). */
  primeiraVerificacaoMs?: number;
  /** Intervalo entre verificações enquanto o login não termina (padrão 2 s). */
  intervaloMs?: number;
}

const dormir = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

interface Envelope {
  success?: boolean;
  dados?: Record<string, unknown>;
  error?: { code?: string; message?: string; acao?: string };
}

function lerEnvelope(texto: string): Envelope | null {
  try {
    const j = JSON.parse(texto) as unknown;
    return j !== null && typeof j === 'object' ? (j as Envelope) : null;
  } catch {
    return null;
  }
}

/** Devolve o código de saída: 0 com sessão autenticada, 1 em qualquer outro caso. */
export async function executarEntrar(opcoes: OpcoesEntrar): Promise<number> {
  const { cliente, saida } = opcoes;
  let terminou = false;
  let enderecoMostrado = false;

  saida('Pedindo a janela de login ao servico local...');
  const pedido = cliente.chamar({ metodo: 'POST', caminho: '/v1/sessao/entrar' }).finally(() => {
    terminou = true;
  });

  const vigiar = async (): Promise<void> => {
    await dormir(opcoes.primeiraVerificacaoMs ?? 1000);
    while (!terminou && !enderecoMostrado) {
      const r = await cliente.chamar({ metodo: 'GET', caminho: '/v1/sessao' });
      const janela = (lerEnvelope(r.texto)?.dados?.janela ?? null) as { aberta?: boolean; navegador_aberto?: boolean | null } | null;
      if (janela?.aberta === true) {
        if (janela.navegador_aberto === false) {
          const j = await cliente.chamar({ metodo: 'GET', caminho: '/v1/sessao/janela' });
          const url = lerEnvelope(j.texto)?.dados?.url;
          if (typeof url === 'string' && url !== '') {
            enderecoMostrado = true;
            saida('O navegador nao abriu sozinho. Abra este endereco no navegador (vale uma vez e por poucos minutos):');
            saida(url);
          }
        } else if (janela.navegador_aberto === true) {
          enderecoMostrado = true;
          saida('A janela de login abriu no navegador. Digite usuario e senha la; nada passa por este terminal.');
        }
      }
      if (!enderecoMostrado) await dormir(opcoes.intervaloMs ?? 2000);
    }
  };

  // A vigília termina sozinha na próxima volta depois que o pedido acabar.
  void vigiar().catch(() => undefined);
  const resultado = await pedido;
  const env = lerEnvelope(resultado.texto);
  if (resultado.sucesso && env?.dados) {
    const perfil = typeof env.dados.perfil === 'string' ? ` (perfil ${env.dados.perfil})` : '';
    saida(`Sessao autenticada${perfil}.`);
    return 0;
  }
  const codigo = env?.error?.code ?? 'ERRO';
  saida(`Nao foi possivel entrar: ${codigo}.`);
  if (env?.error?.message) saida(env.error.message);
  if (env?.error?.acao) saida(env.error.acao);
  return 1;
}

/** Ponto de entrada de `node dist/cli-entrar.js`. */
export async function principal(): Promise<void> {
  const cliente = new ClienteServico({ diretorio: resolverDiretorio(process.env) });
  const codigo = await executarEntrar({ cliente, saida: (linha) => process.stdout.write(`${linha}\n`) });
  process.exitCode = codigo;
}

if (require.main === module) {
  void principal();
}
