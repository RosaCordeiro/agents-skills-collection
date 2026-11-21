import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { ILogger } from '../../core/domain/ports/logger';

/**
 * Arquivo de descoberta do serviço (ARCH-001 §7.2, RNF-02): `<diretório>/servico.json` com
 * `{ porta, token, pid, iniciado_em, versao }`. O serviço grava (depois de restringir a ACL da
 * PASTA) e apaga na parada; MCP e CLI só leem, por `lerDescoberta`. O token nunca vai para log.
 */

export const NOME_ARQUIVO_DESCOBERTA = 'servico.json';

export interface Descoberta {
  porta: number;
  token: string;
  pid: number;
  iniciado_em: string;
  versao: string;
}

export const caminhoDescoberta = (diretorio: string): string => path.join(diretorio, NOME_ARQUIVO_DESCOBERTA);

/** Executa o `icacls`; os testes trocam por um espião para não alterar ACL de verdade. */
export type ExecutarIcacls = (argumentos: string[]) => Promise<void>;

const executarIcaclsReal: ExecutarIcacls = (argumentos) =>
  new Promise<void>((resolve, reject) => {
    execFile('icacls', argumentos, { windowsHide: true, timeout: 10_000 }, (erro) => (erro ? reject(erro) : resolve()));
  });

/** Conta do usuário atual no formato do `icacls` (`DOMINIO\usuario` quando há domínio). */
export function contaAtual(env: NodeJS.ProcessEnv = process.env): string {
  const usuario = env.USERNAME?.trim() || os.userInfo().username;
  const dominio = env.USERDOMAIN?.trim();
  return dominio ? `${dominio}\\${usuario}` : usuario;
}

/** Argumentos de `icacls` que deixam só o usuário atual com acesso total à pasta (e ao que ela criar). */
export function argumentosIcacls(diretorio: string, conta: string): string[] {
  return [diretorio, '/inheritance:r', '/grant:r', `${conta}:(OI)(CI)F`];
}

export interface OpcoesGravarDescoberta {
  logger?: ILogger;
  /** Falso pula a ACL (fora do Windows ou em teste). Padrão: só no Windows. */
  restringirAcl?: boolean;
  executarIcacls?: ExecutarIcacls;
  conta?: string;
}

/**
 * Cria a pasta, restringe a ACL (ANTES de gravar o arquivo, para não haver janela de exposição) e
 * grava o arquivo. Falha da ACL só gera `warn`; falha de gravação lança. Devolve se a ACL foi aplicada.
 */
export async function gravarDescoberta(
  diretorio: string,
  dados: Descoberta,
  opcoes: OpcoesGravarDescoberta = {},
): Promise<{ aclAplicada: boolean }> {
  fs.mkdirSync(diretorio, { recursive: true });
  let aclAplicada = false;
  const aplicar = opcoes.restringirAcl ?? process.platform === 'win32';
  if (aplicar) {
    try {
      await (opcoes.executarIcacls ?? executarIcaclsReal)(
        argumentosIcacls(diretorio, opcoes.conta ?? contaAtual()),
      );
      aclAplicada = true;
    } catch {
      try {
        opcoes.logger?.warn('Não foi possível restringir a ACL da pasta do serviço', {
          event: { name: 'servico', action: 'start', outcome: 'failure' },
          motivo: 'acl',
        });
      } catch {
        // log nunca derruba o início
      }
    }
  }
  // gravação atômica: um leitor nunca vê o arquivo truncado
  const destino = caminhoDescoberta(diretorio);
  const temporario = `${destino}.tmp`;
  fs.writeFileSync(temporario, JSON.stringify(dados), { encoding: 'utf8', mode: 0o600 });
  fs.renameSync(temporario, destino);
  return { aclAplicada };
}

export function apagarDescoberta(diretorio: string): void {
  try {
    fs.rmSync(caminhoDescoberta(diretorio), { force: true });
  } catch {
    // já não existe ou sem acesso: a parada segue
  }
}

/** Lê o arquivo; `null` se ausente ou fora do formato. Usada por MCP, CLI e testes. */
export function lerDescoberta(diretorio: string): Descoberta | null {
  let texto: string;
  try {
    texto = fs.readFileSync(caminhoDescoberta(diretorio), 'utf8');
  } catch {
    return null;
  }
  try {
    const d = JSON.parse(texto.replace(/^\uFEFF/, '')) as Record<string, unknown>;
    if (
      typeof d.porta === 'number' &&
      Number.isInteger(d.porta) &&
      typeof d.token === 'string' &&
      d.token.length > 0 &&
      typeof d.pid === 'number' &&
      typeof d.iniciado_em === 'string' &&
      typeof d.versao === 'string'
    ) {
      return { porta: d.porta, token: d.token, pid: d.pid, iniciado_em: d.iniciado_em, versao: d.versao };
    }
  } catch {
    // JSON inválido
  }
  return null;
}
