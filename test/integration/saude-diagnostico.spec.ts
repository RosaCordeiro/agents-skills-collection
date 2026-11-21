import { sentinela } from '../simulador/apoio';
import { NotificadorEspiao, logarDireto } from '../simulador/consulta-apoio';
import { gerarMassa } from '../simulador/dados';
import { subirServico, type Servico } from '../simulador/rest-apoio';
import { montarAmbiente, type Ambiente } from '../simulador/sessao-apoio';
import { SoftdeskSimulado } from '../simulador/softdesk-simulado';

const MEU = 393;

/** Saúde com diagnóstico (ARCH §17 camada 5): deriva { novos, ausentes, tipo_trocado }, só nomes. */
describe('saúde com diagnóstico de deriva (VAL-32, camada 5)', () => {
  let sim: SoftdeskSimulado;
  let amb: Ambiente | undefined;
  let svc: Servico | undefined;

  beforeEach(async () => {
    sim = await SoftdeskSimulado.iniciar({ chamados: gerarMassa([{ cdAtendente: MEU, status: 1, quantidade: 3 }]) });
  });

  afterEach(async () => {
    amb?.c.janelaLogin.fechar();
    amb = undefined;
    await svc?.encerrar();
    svc = undefined;
    await sim.fechar();
  });

  async function comSessao(): Promise<Ambiente> {
    amb = montarAmbiente(sim);
    await logarDireto(amb);
    return amb;
  }

  it('resposta igual ao contrato: sem deriva e sem aviso', async () => {
    const a = await comSessao();
    const r = await a.c.verificarSaude.executar();
    expect(r.dados.modo).toBe('pesquisa');
    expect(r.dados.deriva).toBeUndefined();
    expect(r.aviso_deriva).toBeUndefined();
  });

  it('campo novo, ausente e com tipo trocado aparecem nas três listas; só nomes, nunca valores', async () => {
    const valor = sentinela('VALOR-NOVO');
    const a = await comSessao();
    sim.aplicarDeriva({ adicionar: { campo_inedito: valor }, alterar: { ds_prioridade: 7 }, remover: ['nm_usuario', 'cd_area'] });
    const r = await a.c.verificarSaude.executar();
    expect(r.dados.deriva).toEqual({
      novos: ['campo_inedito'],
      ausentes: ['cd_area', 'nm_usuario'],
      tipo_trocado: ['ds_prioridade'],
    });
    // O aviso do envelope continua só com os campos USADOS (nm_usuario e ds_prioridade; cd_area é "outro").
    expect([...(r.aviso_deriva?.campos ?? [])].sort()).toEqual(['ds_prioridade', 'nm_usuario']);
    expect(JSON.stringify(r).includes(valor)).toBe(false);
    expect(a.logger.texto().includes(valor)).toBe(false);
  });

  it('saúde automática após o 1º login (B-4): deriva vira log softdesk_deriva com só nomes, ultimo_alerta e balão', async () => {
    const notificador = new NotificadorEspiao();
    amb = montarAmbiente(sim, { saudeAutomatica: true }, { notificador });
    await logarDireto(amb);
    sim.aplicarDeriva({ remover: ['cd_area'], alterar: { ds_prioridade: 7 } });
    amb.c.saudeAutomatica.disparar();
    await amb.c.saudeAutomatica.aguardar();
    const log = amb.logger.registros.filter((r) => r.campos.keywords?.includes('softdesk_deriva'));
    expect(log.length).toBeGreaterThan(0);
    const auto = amb.logger.registros.find((r) => r.campos.event?.name === 'saude' && r.campos.event?.action === 'auto');
    expect([...((auto?.campos.campos_deriva as string[] | undefined) ?? [])].sort()).toEqual(['cd_area', 'ds_prioridade']);
    expect(amb.c.estadoSessao.executar().ultimo_alerta?.codigo).toBe('DERIVA');
    expect(notificador.codigos).toEqual(['DERIVA']);
  });

  it('REVIEW-002 achado 3: deriva só de campo "outro" vai para o log, sem balão nem ultimo_alerta (nem na saúde automática)', async () => {
    const notificador = new NotificadorEspiao();
    amb = montarAmbiente(sim, { saudeAutomatica: true }, { notificador });
    await logarDireto(amb);
    sim.aplicarDeriva({ remover: ['cd_area'] }); // cd_area é marca "outro"
    const r = await amb.c.verificarSaude.executar();
    expect(r.dados.deriva?.ausentes).toEqual(['cd_area']);
    expect(r.aviso_deriva).toBeUndefined();
    amb.c.saudeAutomatica.disparar();
    await amb.c.saudeAutomatica.aguardar();
    expect(notificador.codigos).toEqual([]);
    expect(amb.c.estadoSessao.executar().ultimo_alerta).toBeNull();
    const log = amb.logger.registros.filter((x) => x.campos.keywords?.includes('softdesk_deriva'));
    expect(log.length).toBeGreaterThan(0);
  });

  it('só campo novo: deriva com o nome, mas sem aviso_deriva (campo novo não derruba nada)', async () => {
    const a = await comSessao();
    sim.aplicarDeriva({ adicionar: { so_novo: 'x' } });
    const r = await a.c.verificarSaude.executar();
    expect(r.dados.deriva).toEqual({ novos: ['so_novo'], ausentes: [], tipo_trocado: [] });
    expect(r.aviso_deriva).toBeUndefined();
  });

  it('sem sessão a saúde só confere a página de login e não traz deriva', async () => {
    amb = montarAmbiente(sim);
    const r = await amb.c.verificarSaude.executar();
    expect(r.dados.modo).toBe('login');
    expect(r.dados.deriva).toBeUndefined();
  });

  it('pelo REST (GET /v1/saude) o diagnóstico sai no envelope', async () => {
    svc = await subirServico(sim);
    svc.svc.container.sessaoStore.guardar(
      await svc.svc.container.gateway.autenticar(sentinela('USU'), sentinela('SENHA'), 'A'),
      { usuario: sentinela('USU'), perfil: 'A', desde: new Date() },
    );
    sim.aplicarDeriva({ adicionar: { campo_rest: 1 } });
    const r = await svc.chamar('/v1/saude');
    expect(r.status).toBe(200);
    expect(r.json.dados.deriva).toEqual({ novos: ['campo_rest'], ausentes: [], tipo_trocado: [] });
  });
});
