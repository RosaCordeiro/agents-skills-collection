import type { z } from 'zod';
import {
  schemaCodigoChamado,
  schemaFila,
  schemaPesquisa,
  schemaSemEntrada,
} from '../../shared/schemas/entrada.schemas';
import type { PedidoServico } from './cliente-servico';

/**
 * Catálogo das sete tools MCP (ARCH-001 §7.1). Cada tool usa o MESMO schema zod estrito do REST
 * (campo desconhecido, como `senha`, vira `FILTRO_INVALIDO`). Nenhuma tool pede usuário ou senha e o
 * endereço da janela de login NUNCA sai por aqui (ADR-007).
 */

export interface DefinicaoTool {
  nome: string;
  descricao: string;
  schema: z.ZodType;
  /** Converte a entrada JÁ validada no pedido REST equivalente. */
  pedido(entrada: any): PedidoServico;
}

const SEM_CREDENCIAL =
  'Nunca pede usuário nem senha: se não houver sessão, a janela de login local abre sozinha no navegador e a pessoa digita lá.';

const queryDaFila = (e: Record<string, unknown>): string => {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(e)) if (v !== undefined) q.set(k, String(v));
  const s = q.toString();
  return s ? `?${s}` : '';
};

export const TOOLS: readonly DefinicaoTool[] = [
  {
    nome: 'softdesk_entrar',
    descricao:
      'Garante uma sessão no SoftDesk. Se ainda não houver, abre automaticamente a janela de login local no navegador e espera pela pessoa entrar (até o tempo configurado, 2 minutos por padrão). ' +
      SEM_CREDENCIAL +
      ' Sem parâmetros. Somente leitura no SoftDesk.',
    schema: schemaSemEntrada,
    pedido: () => ({ metodo: 'POST', caminho: '/v1/sessao/entrar' }),
  },
  {
    nome: 'softdesk_estado_sessao',
    descricao:
      'Mostra o estado da sessão no SoftDesk (autenticada ou não, usuário, perfil, janela de login aberta, último alerta). Não abre janela. ' +
      SEM_CREDENCIAL +
      ' Sem parâmetros.',
    schema: schemaSemEntrada,
    pedido: () => ({ metodo: 'GET', caminho: '/v1/sessao' }),
  },
  {
    nome: 'softdesk_minha_fila',
    descricao:
      'Lista a fila de chamados em atendimento do usuário da sessão, com paginação (inicio, limite; teto de 200) e filtros de texto opcionais (solicitante_nome, titulo_contem, prioridade_nome, tipo_nome). Com todas: true devolve TODAS as abertas de uma vez (o serviço lê as páginas sozinho, até 15 páginas, 300 itens, cerca de 60 KB de resposta e 90 s; se parar antes vem incompleto: true, parada_por (paginas, itens, tamanho ou prazo) e proximo_inicio para continuar); todas: true não pode ser usado junto de limite. Se não houver sessão, a janela de login local abre sozinha e a resposta orienta a repetir. ' +
      SEM_CREDENCIAL,
    schema: schemaFila,
    pedido: (e) => ({ metodo: 'GET', caminho: `/v1/fila${queryDaFila(e)}` }),
  },
  {
    nome: 'softdesk_pesquisar',
    descricao:
      'Pesquisa chamados no SoftDesk por código, atendente, status, prioridade, grupo de solução, tipo, cliente, palavra-chave, período e outros filtros, mais filtros de texto no cliente e paginação. Com todas: true devolve TODOS os que casam (leitura de páginas feita pelo serviço, até 15 páginas, 300 itens, cerca de 60 KB de resposta e 90 s; se parar antes vem incompleto: true, parada_por (paginas, itens, tamanho ou prazo) e proximo_inicio); todas: true não pode ser usado junto de limite. Somente leitura. Se não houver sessão, a janela de login local abre sozinha. ' +
      SEM_CREDENCIAL,
    schema: schemaPesquisa,
    pedido: (e) => ({ metodo: 'POST', caminho: '/v1/chamados/pesquisa', corpo: e }),
  },
  {
    nome: 'softdesk_chamado_completo',
    descricao:
      'Devolve o chamado completo pelo código (inteiro maior que zero). Somente leitura. Se não houver sessão, a janela de login local abre sozinha. ' +
      SEM_CREDENCIAL,
    schema: schemaCodigoChamado,
    pedido: (e) => ({ metodo: 'GET', caminho: `/v1/chamados/${e.codigo}` }),
  },
  {
    nome: 'softdesk_atividades',
    descricao:
      'Lista as atividades (somente leitura) de um chamado pelo código. Pode devolver NAO_DISPONIVEL enquanto a rota de atividades do SoftDesk não tiver sido descoberta; nesse caso use o MCP oficial do SoftDesk. ' +
      SEM_CREDENCIAL,
    schema: schemaCodigoChamado,
    pedido: (e) => ({ metodo: 'GET', caminho: `/v1/chamados/${e.codigo}/atividades` }),
  },
  {
    nome: 'softdesk_saude',
    descricao:
      'Confere a saúde do serviço local e se o SoftDesk ainda responde no formato esperado (página de login e, com sessão, a rota de pesquisa). Não abre janela. ' +
      SEM_CREDENCIAL +
      ' Sem parâmetros.',
    schema: schemaSemEntrada,
    pedido: () => ({ metodo: 'GET', caminho: '/v1/saude' }),
  },
];

export const NOMES_TOOLS: readonly string[] = TOOLS.map((t) => t.nome);
