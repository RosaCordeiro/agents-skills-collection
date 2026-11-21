import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { lerDescoberta } from '../../infraestructure/descoberta/arquivo-descoberta';

/**
 * Início automático do serviço pelo MCP (ARCH-001 §6 F9, RN-15, CA-17).
 * Sobe `dist/servico.js` com o próprio Node, desacoplado (`detached`, `windowsHide`, `stdio: 'ignore'`,
 * `unref`) para sobreviver ao MCP, e espera até `tempoMaxMs` o arquivo de descoberta e a resposta de
 * `GET /v1/servico`. Vários MCPs ao mesmo tempo: todos tentam subir, a porta fixa deixa uma só instância
 * viva (quem perde sai sozinho sem tocar no arquivo) e todos acabam lendo o mesmo arquivo.
 * Nada aqui escreve em stdout (stdout do MCP é o protocolo).
 */

export const TEMPO_MAX_INICIO_MS = 10_000;

/** `dist/presentation/mcp/` -> `dist/servico.js` (relativo ao próprio dist do MCP). */
export const CAMINHO_SERVICO_PADRAO = path.join(__dirname, '..', '..', 'servico.js');

/** Variáveis que o serviço destacado herda (nada de credenciais de outros MCPs). */
const PREFIXOS_ENV = ['SOFTDESK_LOCAL_'];
const NOMES_ENV = new Set(
  [
    'SystemRoot', 'SystemDrive', 'windir', 'ComSpec', 'PATHEXT', 'PATH', 'LOCALAPPDATA', 'APPDATA', 'USERPROFILE', 'USERNAME',
    'USERDOMAIN', 'HOMEDRIVE', 'HOMEPATH', 'TEMP', 'TMP', 'ProgramData', 'ProgramFiles', 'ProgramFiles(x86)',
    'LOG_LEVEL', 'PREFIX_LOGGER', 'AMBIENTE', 'NODE_EXTRA_CA_CERTS', 'SSL_CERT_FILE', 'SSL_CERT_DIR',
    'HTTP_PROXY', 'HTTPS_PROXY', 'NO_PROXY',
  ].map((n) => n.toUpperCase()),
);

/**
 * `NODE_OPTIONS` segue para o serviço (estações com inspeção TLS usam `--use-openssl-ca` ou
 * `--use-system-ca`), mas sem as opções que carregam código ou abrem depurador (`--require`, `--import`,
 * `--loader`, `--inspect`...). Opção com valor em palavra separada leva o valor junto.
 */
export function opcoesNodeSeguras(valor: string): string {
  const partes = valor.split(/\s+/).filter((p) => p !== '');
  const saida: string[] = [];
  for (let i = 0; i < partes.length; i++) {
    const p = partes[i];
    if (/^(-r|--require|--import|--loader|--experimental-loader|--env-file|--inspect(-brk|-wait)?|--eval|-e|--print|-p)(=|$)/.test(p)) {
      if (!p.includes('=') && !p.startsWith('--inspect') && i + 1 < partes.length) i++;
      continue;
    }
    saida.push(p);
  }
  return saida.join(' ');
}

/** Ambiente mínimo para o serviço destacado (lista de permissão, sem diferenciar maiúsculas). */
export function ambienteMinimo(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const saida: NodeJS.ProcessEnv = {};
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) continue;
    const K = k.toUpperCase();
    if (K === 'NODE_OPTIONS') {
      const seguro = opcoesNodeSeguras(v);
      if (seguro !== '') saida[k] = seguro;
      continue;
    }
    if (NOMES_ENV.has(K) || PREFIXOS_ENV.some((p) => K.startsWith(p))) saida[k] = v;
  }
  return saida;
}

export interface OpcoesIniciarServico {
  diretorio: string;
  /** Padrão: `dist/servico.js` ao lado deste dist. */
  caminhoServico?: string;
  /** Padrão: `process.execPath`. Injetável para teste. */
  executavel?: string;
  /** Padrão: 10 s. Injetável para teste. */
  tempoMaxMs?: number;
  intervaloMs?: number;
  /** Padrão: `ambienteMinimo(process.env)`. */
  env?: NodeJS.ProcessEnv;
  /** Padrão: a raiz do pacote do serviço (pai de `dist/`). */
  cwd?: string;
}

const dormir = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** `true` se o arquivo de descoberta aponta para um serviço que responde `GET /v1/servico` com o token. */
export async function servicoResponde(diretorio: string): Promise<boolean> {
  const desc = lerDescoberta(diretorio);
  if (!desc) return false;
  try {
    const r = await fetch(`http://127.0.0.1:${desc.porta}/v1/servico`, {
      headers: { Authorization: `Bearer ${desc.token}` },
      signal: AbortSignal.timeout(2_000),
    });
    return r.status === 200;
  } catch {
    return false;
  }
}

/** Inicia o serviço em segundo plano e espera ele responder. `true` se está de pé ao fim. */
export async function iniciarServicoEmSegundoPlano(opcoes: OpcoesIniciarServico): Promise<boolean> {
  const caminho = opcoes.caminhoServico ?? CAMINHO_SERVICO_PADRAO;
  const tempoMax = opcoes.tempoMaxMs ?? TEMPO_MAX_INICIO_MS;
  const intervalo = opcoes.intervaloMs ?? 100;
  const fim = Date.now() + tempoMax;

  // Outro MCP pode ter acabado de subir o serviço: só voltar a ler o arquivo.
  if (await servicoResponde(opcoes.diretorio)) return true;

  let falhouAoLancar = false;
  if (!fs.existsSync(caminho)) {
    falhouAoLancar = true;
  } else {
    try {
      const filho = spawn(opcoes.executavel ?? process.execPath, [caminho], {
        detached: true,
        windowsHide: true,
        stdio: 'ignore',
        // cwd = repo do serviço: não prende a pasta do projeto do Claude e o logger lê o package.json certo.
        cwd: opcoes.cwd ?? path.resolve(path.dirname(caminho), '..'),
        env: opcoes.env ?? ambienteMinimo(process.env),
      });
      filho.once('error', () => {
        falhouAoLancar = true;
      });
      filho.unref();
    } catch {
      falhouAoLancar = true;
    }
  }

  while (!falhouAoLancar && Date.now() < fim) {
    if (await servicoResponde(opcoes.diretorio)) return true;
    await dormir(Math.min(intervalo, Math.max(0, fim - Date.now())));
  }
  // Uma última leitura: a instância de outro MCP pode ter ganhado a disputa no último instante.
  return servicoResponde(opcoes.diretorio);
}
