import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { z } from 'zod';
import { NIVEIS_LOG, type Config } from '../../core/domain/entities/config';
import { PERFIS_LOGIN } from '../../core/domain/entities/sessao';

/**
 * Carrega a configuração local (ARCH-001 §8.2, RN-12).
 * Precedência: variável de ambiente > `<diretório>/config.json` (opcional) > padrão.
 * Schema estrito: chave desconhecida ou valor fora da regra impede o início.
 * Não há segredo de configuração; ainda assim as mensagens de problema citam só chave e regra, nunca o valor.
 */

export class ErroConfig extends Error {
  readonly problemas: string[];

  constructor(problemas: string[]) {
    super(`Configuração inválida: ${problemas.join('; ')}`);
    this.name = 'ErroConfig';
    this.problemas = problemas;
    Object.setPrototypeOf(this, ErroConfig.prototype);
  }
}

export const NOME_ARQUIVO_CONFIG = 'config.json';

type ChaveConfig = Exclude<keyof Config, 'diretorio'>;

/** Variável de ambiente de cada chave do `config.json` (tabela §8.2). */
export const VARIAVEIS_AMBIENTE: Readonly<Record<ChaveConfig, string>> = {
  baseUrl: 'SOFTDESK_LOCAL_BASE_URL',
  cdAtendente: 'SOFTDESK_LOCAL_CD_ATENDENTE',
  perfilPadrao: 'SOFTDESK_LOCAL_PERFIL_PADRAO',
  esperaLoginSegundos: 'SOFTDESK_LOCAL_ESPERA_LOGIN_S',
  porta: 'SOFTDESK_LOCAL_PORTA',
  prazoVarreduraSegundos: 'SOFTDESK_LOCAL_PRAZO_VARREDURA_S',
  notificarWindows: 'SOFTDESK_LOCAL_NOTIFICAR',
  nivelLog: 'LOG_LEVEL',
};

export const VARIAVEL_DIRETORIO = 'SOFTDESK_LOCAL_DIR';

export const PADRAO: Readonly<Omit<Config, 'diretorio'>> = {
  baseUrl: 'https://helpdesk.clamed.com.br',
  cdAtendente: 393,
  perfilPadrao: 'A',
  esperaLoginSegundos: 120,
  porta: 47821,
  prazoVarreduraSegundos: 90,
  notificarWindows: true,
  nivelLog: 'info',
};

const HOSTS_LOCAIS = new Set(['127.0.0.1', 'localhost']);

const campoBaseUrl = z.string('deve ser texto').superRefine((valor, ctx) => {
  let url: URL;
  try {
    url = new URL(valor);
  } catch {
    ctx.addIssue({ code: 'custom', message: 'deve ser uma URL válida' });
    return;
  }
  const local = HOSTS_LOCAIS.has(url.hostname);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) {
    ctx.addIssue({
      code: 'custom',
      message: 'exige https (http só para 127.0.0.1 ou localhost)',
    });
  }
  if (url.username || url.password) {
    ctx.addIssue({ code: 'custom', message: 'não pode ter usuário ou senha na URL' });
  }
  if (url.search || url.hash || (url.pathname !== '/' && url.pathname !== '')) {
    ctx.addIssue({ code: 'custom', message: 'deve ser só a origem (sem caminho, query ou fragmento)' });
  }
});

function inteiro(min: number, max?: number) {
  const regra = max === undefined ? `deve ser inteiro >= ${min}` : `deve ser inteiro de ${min} a ${max}`;
  let s = z.number(regra).int(regra).min(min, regra);
  if (max !== undefined) s = s.max(max, regra);
  return s;
}

const camposConfig = {
  baseUrl: campoBaseUrl,
  cdAtendente: inteiro(1),
  perfilPadrao: z.enum(PERFIS_LOGIN, `deve ser ${PERFIS_LOGIN.join(', ')}`),
  esperaLoginSegundos: inteiro(1, 280),
  porta: inteiro(1024, 65535),
  prazoVarreduraSegundos: inteiro(20, 300),
  notificarWindows: z.boolean('deve ser true ou false'),
  nivelLog: z.enum(NIVEIS_LOG, `deve ser um de: ${NIVEIS_LOG.join(', ')}`),
};

const esquemaParcial = z.object(camposConfig).partial();
/** Arquivo: estrito, chave desconhecida é erro. */
const esquemaArquivo = esquemaParcial.strict();

function coagirAmbiente(chave: ChaveConfig, bruto: string): unknown {
  switch (chave) {
    case 'cdAtendente':
    case 'esperaLoginSegundos':
    case 'porta':
    case 'prazoVarreduraSegundos':
      return /^\d+$/.test(bruto.trim()) ? Number(bruto.trim()) : bruto;
    case 'notificarWindows': {
      const v = bruto.trim().toLowerCase();
      if (v === 'true') return true;
      if (v === 'false') return false;
      return bruto;
    }
    case 'perfilPadrao':
      return bruto.trim().toUpperCase();
    case 'nivelLog':
      return bruto.trim().toLowerCase();
    default:
      return bruto.trim();
  }
}

export interface OpcoesCarregarConfig {
  /** Padrão: `process.env`. */
  env?: NodeJS.ProcessEnv;
  /** Devolve o conteúdo do arquivo ou `null` se não existe. Padrão: lê do disco. */
  lerArquivo?: (caminho: string) => string | null;
}

export function resolverDiretorio(env: NodeJS.ProcessEnv): string {
  const explicito = env[VARIAVEL_DIRETORIO]?.trim();
  if (explicito) return path.resolve(explicito);
  const base = env.LOCALAPPDATA?.trim() || path.join(os.homedir(), 'AppData', 'Local');
  return path.join(base, 'softdesk-local');
}

function lerArquivoDoDisco(caminho: string): string | null {
  try {
    return fs.readFileSync(caminho, 'utf8');
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw new ErroConfig([`${NOME_ARQUIVO_CONFIG}: não foi possível ler o arquivo`]);
  }
}

function formatarProblemas(erro: z.ZodError, rotulo: (chave: string) => string): string[] {
  const problemas: string[] = [];
  for (const issue of erro.issues) {
    if (issue.code === 'unrecognized_keys') {
      for (const chave of issue.keys) problemas.push(`${rotulo(chave)}: chave desconhecida`);
      continue;
    }
    const chave = String(issue.path[0] ?? '(raiz)');
    problemas.push(`${rotulo(chave)}: ${issue.message}`);
  }
  return problemas;
}

export function carregarConfig(opcoes: OpcoesCarregarConfig = {}): Config {
  const env = opcoes.env ?? process.env;
  const lerArquivo = opcoes.lerArquivo ?? lerArquivoDoDisco;
  const diretorio = resolverDiretorio(env);
  const problemas: string[] = [];

  // 1) arquivo
  let doArquivo: z.infer<typeof esquemaParcial> = {};
  const caminhoArquivo = path.join(diretorio, NOME_ARQUIVO_CONFIG);
  const texto = lerArquivo(caminhoArquivo);
  if (texto !== null) {
    let json: unknown;
    let jsonOk = true;
    try {
      json = JSON.parse(texto.replace(/^﻿/, ''));
    } catch {
      // A mensagem do JSON.parse traz trecho do conteúdo: não é repassada.
      jsonOk = false;
      problemas.push(`${NOME_ARQUIVO_CONFIG}: não é um JSON válido`);
    }
    if (jsonOk) {
      const r = esquemaArquivo.safeParse(json);
      if (r.success) doArquivo = r.data;
      else problemas.push(...formatarProblemas(r.error, (c) => `${NOME_ARQUIVO_CONFIG} › ${c}`));
    }
  }

  // 2) ambiente
  const candidatoEnv: Record<string, unknown> = {};
  const chaves = Object.keys(VARIAVEIS_AMBIENTE) as ChaveConfig[];
  const porVariavel = new Map<string, string>();
  for (const chave of chaves) {
    const nomeVar = VARIAVEIS_AMBIENTE[chave];
    porVariavel.set(chave, nomeVar);
    const bruto = env[nomeVar];
    if (bruto === undefined || bruto.trim() === '') continue;
    candidatoEnv[chave] = coagirAmbiente(chave, bruto);
  }
  let doAmbiente: z.infer<typeof esquemaParcial> = {};
  const rEnv = esquemaParcial.safeParse(candidatoEnv);
  if (rEnv.success) doAmbiente = rEnv.data;
  else problemas.push(...formatarProblemas(rEnv.error, (c) => porVariavel.get(c) ?? c));

  if (problemas.length > 0) throw new ErroConfig(problemas);

  const mesclado = { ...PADRAO, ...doArquivo, ...doAmbiente };
  const baseUrl = new URL(mesclado.baseUrl).origin;
  return { ...mesclado, baseUrl, diretorio };
}
