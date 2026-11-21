import { inspect } from 'node:util';

/**
 * Jar mínimo em memória (do protótipo validado em produção), sem domínio nem caminho: o
 * gateway só o usa com a origem do SoftDesk. Guarda `nome=valor` e apaga o cookie quando o
 * servidor o expira (`Max-Age<=0` ou `Expires` no passado). Nunca aparece em log nem em
 * serialização: `inspect` e `JSON.stringify` mostram só um marcador.
 */

export interface SetCookieAnalisado {
  nome: string;
  valor: string;
  /** `true` quando o servidor está apagando o cookie. */
  apagar: boolean;
}

/** Lê uma linha de `Set-Cookie`. Devolve `null` se não há `nome=valor` aproveitável. */
export function analisarSetCookie(linha: string, agora: number = Date.now()): SetCookieAnalisado | null {
  const partes = linha.split(';');
  const par = partes[0] ?? '';
  const i = par.indexOf('=');
  if (i <= 0) return null;
  const nome = par.slice(0, i).trim();
  if (nome === '') return null;
  const valor = par.slice(i + 1).trim();
  let apagar = false;
  for (const atributo of partes.slice(1)) {
    const j = atributo.indexOf('=');
    const chave = (j < 0 ? atributo : atributo.slice(0, j)).trim().toLowerCase();
    const v = j < 0 ? '' : atributo.slice(j + 1).trim();
    if (chave === 'max-age') {
      const n = Number(v);
      if (Number.isFinite(n) && n <= 0) apagar = true;
    } else if (chave === 'expires') {
      const t = Date.parse(v);
      if (Number.isFinite(t) && t <= agora) apagar = true;
    }
  }
  return { nome, valor, apagar };
}

export interface FonteSetCookie {
  getSetCookie?: () => string[];
}

export class CookieJar {
  private readonly cookies: Map<string, string>;

  /** Com `mapa`, o jar escreve nele (é assim que a sessão acompanha as renovações). */
  constructor(mapa: Map<string, string> = new Map()) {
    this.cookies = mapa;
  }

  get mapa(): Map<string, string> {
    return this.cookies;
  }

  get tamanho(): number {
    return this.cookies.size;
  }

  obter(nome: string): string | undefined {
    return this.cookies.get(nome);
  }

  tem(nome: string): boolean {
    return this.cookies.has(nome);
  }

  definir(nome: string, valor: string): void {
    this.cookies.set(nome, valor);
  }

  apagar(nome: string): void {
    this.cookies.delete(nome);
  }

  /** Guarda os `Set-Cookie` de uma resposta (de toda resposta, não só da primeira). */
  guardarDe(cabecalhos: FonteSetCookie): void {
    const linhas = typeof cabecalhos.getSetCookie === 'function' ? cabecalhos.getSetCookie() : [];
    for (const linha of linhas) {
      const c = analisarSetCookie(linha);
      if (!c) continue;
      if (c.apagar) this.cookies.delete(c.nome);
      else this.cookies.set(c.nome, c.valor);
    }
  }

  /** Valor do cabeçalho `Cookie`; vazio se não há cookies. */
  cabecalho(): string {
    return [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; ');
  }

  toJSON(): string {
    return '[CookieJar]';
  }

  [inspect.custom](): string {
    return '[CookieJar]';
  }
}
