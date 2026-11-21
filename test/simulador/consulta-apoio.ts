import type { INotificador } from '../../src/core/domain/ports/notificador';
import type { CodigoErro } from '../../src/core/domain/errors/erro-softdesk';
import { ErroSoftdesk } from '../../src/core/domain/errors/erro-softdesk';
import { capturarErro, sentinela } from './apoio';
import type { EspecChamado } from './dados';
import type { Ambiente } from './sessao-apoio';
import type { RegistroRequisicao, SoftdeskSimulado } from './softdesk-simulado';

/** Ajudantes dos testes de consulta (fragmento 4). */

/** Notificador falso: guarda os códigos que receberam balão. */
export class NotificadorEspiao implements INotificador {
  readonly codigos: Array<CodigoErro | 'DERIVA'> = [];
  alertar(codigo: CodigoErro | 'DERIVA'): void {
    this.codigos.push(codigo);
  }
}

/** Login direto pelo gateway e sessão guardada no store (sem passar pela janela de login). */
export async function logarDireto(amb: Ambiente): Promise<void> {
  const sessao = await amb.c.gateway.autenticar(sentinela('USU'), sentinela('SENHA'), 'A');
  amb.c.sessaoStore.guardar(sessao, { usuario: sentinela('USU'), perfil: 'A', desde: amb.relogio.agora() });
}

/** Requisições de pesquisa ao simulador, na ordem. */
export const pesquisas = (sim: SoftdeskSimulado): RegistroRequisicao[] => sim.requisicoes('/chamado/json', 'GET');

export async function erroSoftdesk(fn: () => Promise<unknown>): Promise<ErroSoftdesk> {
  const e = await capturarErro(fn);
  expect(e).toBeInstanceOf(ErroSoftdesk);
  return e as ErroSoftdesk;
}

export const dormir = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** Itens do atendente na ordem do simulador (a "lista do servidor" quando se filtra por atendente). */
export const doAtendente = (todos: readonly EspecChamado[], cd: number): EspecChamado[] =>
  todos.filter((c) => c.cd_atendente === cd);

export const FECHADOS = new Set([2, 3, 4, 6]);
export const abertoSpec = (c: EspecChamado): boolean => !FECHADOS.has(c.st_chamado);
