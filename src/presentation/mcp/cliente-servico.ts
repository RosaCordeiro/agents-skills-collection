import crypto from 'node:crypto';
import { ErroSoftdesk } from '../../core/domain/errors/erro-softdesk';
import { lerDescoberta } from '../../infraestructure/descoberta/arquivo-descoberta';
import { montarEnvelopeErro } from '../../shared/envelope/envelope';
import { iniciarServicoEmSegundoPlano, type OpcoesIniciarServico } from './iniciar-servico';

/**
 * Cliente REST do MCP (ARCH-001 §7.2, §14 F6). Lê o arquivo de descoberta a CADA chamada, envia
 * `Authorization: Bearer` e `X-Correlation-Id` (UUID por chamada) e devolve o corpo recebido sem
 * alterar. Arquivo ausente, conexão recusada ou 401: inicia o serviço (uma vez) e repete.
 * O timeout padrão (310 s) fica acima do teto de 280 s da espera de login (`esperaLoginSegundos`).
 * Queda no meio do pedido (ECONNRESET etc.) NÃO inicia outro serviço nem repete o pedido.
 */

export const TIMEOUT_PADRAO_MS = 310_000;

export interface ResultadoChamada {
  /** Corpo exatamente como o serviço respondeu (ou envelope local de erro serializado). */
  texto: string;
  sucesso: boolean;
}

export interface PedidoServico {
  metodo: 'GET' | 'POST';
  caminho: string;
  corpo?: unknown;
}

export type IniciarServico = () => Promise<boolean>;

export interface OpcoesClienteServico {
  diretorio: string;
  /** Padrão: 310 s. */
  timeoutMs?: number;
  /** Padrão: inicia `dist/servico.js` (F9). Injetável para teste. */
  iniciar?: IniciarServico;
  /** Opções do início padrão (executável, tempo máximo). Ignorado se `iniciar` vier. */
  opcoesInicio?: Omit<OpcoesIniciarServico, 'diretorio'>;
}

type Tentativa = { tipo: 'resposta'; status: number; texto: string } | { tipo: 'recusada' } | { tipo: 'falha' };

export class ClienteServico {
  private readonly timeoutMs: number;
  private readonly iniciar: IniciarServico;
  private iniciando: Promise<boolean> | null = null;

  constructor(private readonly opcoes: OpcoesClienteServico) {
    this.timeoutMs = opcoes.timeoutMs ?? TIMEOUT_PADRAO_MS;
    this.iniciar =
      opcoes.iniciar ?? (() => iniciarServicoEmSegundoPlano({ diretorio: opcoes.diretorio, ...opcoes.opcoesInicio }));
  }

  async chamar(pedido: PedidoServico, correlationId: string = crypto.randomUUID()): Promise<ResultadoChamada> {
    let t = await this.tentar(pedido, correlationId);
    if (t.tipo === 'recusada' || (t.tipo === 'resposta' && t.status === 401)) {
      if (!(await this.iniciarUmaVez())) return this.indisponivel(correlationId);
      t = await this.tentar(pedido, correlationId);
    }
    if (t.tipo !== 'resposta') return this.indisponivel(correlationId);
    try {
      const j = JSON.parse(t.texto) as { success?: unknown } | null;
      if (j !== null && typeof j === 'object' && typeof j.success === 'boolean') {
        return { texto: t.texto, sucesso: j.success };
      }
    } catch {
      // cai no envelope local
    }
    return this.indisponivel(correlationId);
  }

  /** Vários pedidos ao mesmo tempo no mesmo MCP compartilham um único início. */
  private iniciarUmaVez(): Promise<boolean> {
    if (!this.iniciando) {
      this.iniciando = this.iniciar()
        .catch(() => false)
        .finally(() => {
          this.iniciando = null;
        });
    }
    return this.iniciando;
  }

  private async tentar(pedido: PedidoServico, correlationId: string): Promise<Tentativa> {
    const desc = lerDescoberta(this.opcoes.diretorio);
    if (!desc) return { tipo: 'recusada' };
    const headers: Record<string, string> = {
      Authorization: `Bearer ${desc.token}`,
      'X-Correlation-Id': correlationId,
    };
    let body: string | undefined;
    if (pedido.corpo !== undefined) {
      body = JSON.stringify(pedido.corpo);
      headers['Content-Type'] = 'application/json';
    }
    try {
      const r = await fetch(`http://127.0.0.1:${desc.porta}${pedido.caminho}`, {
        method: pedido.metodo,
        headers,
        body,
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      return { tipo: 'resposta', status: r.status, texto: await r.text() };
    } catch (e) {
      const codigo = ((e as { cause?: { code?: string } }).cause ?? (e as { code?: string })).code;
      // Só "conexão recusada" prova que o serviço está parado. Reset/queda com o pedido já entregue
      // não repete nem sobe outro serviço (RNF-05, RN-14).
      if (codigo === 'ECONNREFUSED') return { tipo: 'recusada' };
      return { tipo: 'falha' };
    }
  }

  private indisponivel(correlationId: string): ResultadoChamada {
    return {
      texto: JSON.stringify(montarEnvelopeErro(new ErroSoftdesk('SERVICO_INDISPONIVEL'), correlationId), null, 2),
      sucesso: false,
    };
  }
}
