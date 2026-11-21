import type { Container } from '../../shared/container';

/** Roteador próprio e pequeno (ARCH-001 §4: 10 rotas em loopback, sem framework). */

export interface InfoServico {
  versao: string;
  pid: number;
  iniciadoEm: Date;
  /** Pede a parada do serviço (a rota de parar a chama depois de enviar a resposta). */
  parar(): void;
}

export interface ContextoRota {
  container: Container;
  servico: InfoServico;
  /** Segmentos capturados do caminho (ex.: `codigo`). */
  params: Record<string, string>;
  query: URLSearchParams;
  /** JSON do corpo; `undefined` quando não veio corpo. */
  corpo: unknown;
  /** Aborta quando a conexão do cliente fecha antes da resposta. */
  sinal: AbortSignal;
}

export interface RespostaRota {
  status?: number;
  dados: unknown;
  aviso_deriva?: { campos: string[] };
  /** Roda depois que a resposta foi enviada (parada do serviço). */
  depois?: () => void;
}

export interface Rota {
  metodo: 'GET' | 'POST';
  /** Caminho com `{nome}` para segmentos. */
  caminho: string;
  tratar(ctx: ContextoRota): Promise<RespostaRota>;
}

interface RotaCompilada extends Rota {
  regex: RegExp;
  nomes: string[];
}

export type Resolucao =
  | { tipo: 'rota'; rota: Rota; params: Record<string, string> }
  | { tipo: 'metodo_nao_permitido' }
  | { tipo: 'nao_encontrada' };

export class Roteador {
  private readonly rotas: RotaCompilada[];

  constructor(rotas: Rota[]) {
    this.rotas = rotas.map((r) => {
      const nomes: string[] = [];
      const padrao = r.caminho
        .split('/')
        .map((seg) => {
          const m = /^\{(\w+)\}$/.exec(seg);
          if (m) {
            nomes.push(m[1]);
            return '([^/]+)';
          }
          return seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        })
        .join('/');
      return { ...r, regex: new RegExp(`^${padrao}$`), nomes };
    });
  }

  resolver(metodo: string, caminho: string): Resolucao {
    let existe = false;
    for (const r of this.rotas) {
      const m = r.regex.exec(caminho);
      if (!m) continue;
      existe = true;
      if (r.metodo !== metodo) continue;
      const params: Record<string, string> = {};
      r.nomes.forEach((n, i) => {
        try {
          params[n] = decodeURIComponent(m[i + 1]);
        } catch {
          params[n] = m[i + 1];
        }
      });
      return { tipo: 'rota', rota: r, params };
    }
    return existe ? { tipo: 'metodo_nao_permitido' } : { tipo: 'nao_encontrada' };
  }
}
