import fs from 'node:fs';
import path from 'node:path';
import { LIMITE_CAPTURA, SAIDA_TROCA_DE_TIPO, capturarForma } from '../../src/cli-capturar-forma';
import type { IAbridorNavegador } from '../../src/core/domain/ports/abridor-navegador';
import { carregarContrato } from '../../src/infraestructure/softdesk/contrato';
import { sentinela } from '../simulador/apoio';
import { gerarMassa } from '../simulador/dados';
import { pastaTemporaria, removerPasta } from '../simulador/rest-apoio';
import { configTeste, postarLogin } from '../simulador/sessao-apoio';
import { SoftdeskSimulado } from '../simulador/softdesk-simulado';

const MEU = 393;
const RAIZ = path.resolve(__dirname, '..', '..');
const DOURADO_REAL = path.join(RAIZ, 'src', 'infraestructure', 'softdesk', 'contrato-dourado.json');

/** "Navegador" de teste: faz o POST do formulário como o usuário faria e não abre nada de verdade. */
class NavegadorQueLoga implements IAbridorNavegador {
  readonly urls: string[] = [];
  constructor(
    private readonly usuario: string,
    private readonly senha: string,
  ) {}
  async abrir(url: string): Promise<boolean> {
    this.urls.push(url);
    setTimeout(() => void postarLogin(url, { u: this.usuario, s: this.senha }).catch(() => undefined), 50);
    return true;
  }
}

describe('cli-capturar-forma (VAL-32, ARCH §17 camada 6)', () => {
  jest.setTimeout(60_000);
  let sim: SoftdeskSimulado;
  let pasta: string;
  let dourado: string;
  let forma: string;
  const usuario = sentinela('USU');
  const senha = sentinela('SENHA');
  const titulo = sentinela('TITULO-SECRETO');
  const pessoa = sentinela('PESSOA');
  let saida: string[];

  beforeEach(async () => {
    sim = await SoftdeskSimulado.iniciar({
      chamados: gerarMassa([{ cdAtendente: MEU, status: 1, quantidade: 4, titulo, solicitantes: [pessoa] }]),
      credenciais: { usuario, senha },
    });
    pasta = pastaTemporaria();
    dourado = path.join(pasta, 'contrato-dourado.json');
    forma = path.join(pasta, 'forma-atual.json');
    fs.copyFileSync(DOURADO_REAL, dourado);
    saida = [];
  });

  afterEach(async () => {
    await sim.fechar();
    removerPasta(pasta);
  });

  const rodar = (extra: { atualizar?: boolean; aceitarTrocaDeTipo?: boolean; senha?: string } = {}) =>
    capturarForma({
      config: configTeste(sim.url),
      abridor: new NavegadorQueLoga(usuario, extra.senha ?? senha),
      saida: (l) => saida.push(l),
      arquivoForma: forma,
      arquivoDourado: dourado,
      atualizar: extra.atualizar,
      aceitarTrocaDeTipo: extra.aceitarTrocaDeTipo,
      esperaLoginMs: 15_000,
      timeoutSoftdeskMs: 5_000,
      agora: () => new Date('2030-05-06T07:08:09Z'),
    });

  const texto = (): string => saida.join('\n');
  const lerForma = (): Record<string, any> => JSON.parse(fs.readFileSync(forma, 'utf8'));
  const sha = (arq: string): string => fs.readFileSync(arq, 'utf8');

  it('simulador igual ao dourado: tudo igual, e forma-atual.json só tem nomes e tipos', async () => {
    const dourado0 = sha(dourado);
    expect(await rodar()).toBe(0);
    for (const escopo of ['login', 'pesquisa.topo', 'pesquisa.treeview', 'pesquisa.item']) {
      expect(texto()).toContain(`${escopo}: igual ao contrato dourado`);
    }
    // forma-atual.json: só nomes e tipos
    const bruto = fs.readFileSync(forma, 'utf8');
    for (const proibido of [titulo, pessoa, usuario, senha, ...sim.cookiesEmitidos()]) {
      expect(bruto.includes(proibido)).toBe(false);
      expect(texto().includes(proibido)).toBe(false);
    }
    const f = lerForma();
    expect(f.capturado_em).toBe('2030-05-06T07:08:09.000Z');
    expect(f.pesquisa.item.tt_chamado).toEqual(['string']);
    expect(f.login.campos.status).toEqual(['boolean']);
    const tiposValidos = new Set(['array', 'boolean', 'null', 'number', 'object', 'string']);
    for (const mapa of [f.login.campos, f.pesquisa.topo, f.pesquisa.treeview, f.pesquisa.item]) {
      for (const tipos of Object.values(mapa as Record<string, unknown>)) {
        expect(Array.isArray(tipos) && (tipos as string[]).every((t) => tiposValidos.has(t))).toBe(true);
      }
    }
    // sem --atualizar o dourado não muda
    expect(sha(dourado)).toBe(dourado0);
    // a captura só fez as três chamadas permitidas
    expect(new Set(sim.registro.map((r) => `${r.metodo} ${r.caminho}`))).toEqual(
      new Set(['GET /login', 'POST /login', 'GET /chamado/json']),
    );
  });

  it('simulador alterado: mostra campos novos, ausentes e com tipo trocado; grava só nomes e tipos', async () => {
    const valorNovo = sentinela('VALOR-DO-CAMPO-NOVO');
    sim.aplicarDeriva({
      adicionar: { campo_inedito: valorNovo },
      alterar: { tt_chamado: 987654321 },
      remover: ['nm_usuario'],
    });
    const dourado0 = sha(dourado);
    expect(await rodar()).toBe(0);
    const t = texto();
    expect(t).toContain('pesquisa.item:');
    expect(t).toContain('NOVO     campo_inedito (string)');
    expect(t).toContain('AUSENTE  nm_usuario');
    expect(t).toContain('TIPO     tt_chamado: esperado [string], observado [number]');
    expect(t).toContain('npm run capturar-forma -- --atualizar');
    // os outros escopos continuam iguais
    expect(t).toContain('login: igual ao contrato dourado');
    expect(t).toContain('pesquisa.treeview: igual ao contrato dourado');
    // só nomes e tipos em disco e no terminal
    const bruto = fs.readFileSync(forma, 'utf8');
    for (const proibido of [valorNovo, titulo, pessoa, usuario, senha, '987654321', ...sim.cookiesEmitidos()]) {
      expect(bruto.includes(proibido)).toBe(false);
      expect(t.includes(proibido)).toBe(false);
    }
    const f = lerForma();
    expect(f.pesquisa.item.campo_inedito).toEqual(['string']);
    expect(f.pesquisa.item.tt_chamado).toEqual(['number']);
    expect(f.pesquisa.item.nm_usuario).toBeUndefined();
    expect(sha(dourado)).toBe(dourado0);
  });

  it('campo essencial ausente: a captura mostra o que chegou mesmo com a rota recusada pelo contrato atual', async () => {
    sim.aplicarDeriva({ remover: ['cd_atendente'] });
    expect(await rodar()).toBe(0);
    expect(texto()).toContain('CONTRATO_ROTA_MUDOU (campos: cd_atendente)');
    expect(texto()).toContain('AUSENTE  cd_atendente');
  });

  it('--atualizar com troca de tipo em campo usado: avisa, NÃO regrava o campo e sai com 3; o resto é atualizado (B-3)', async () => {
    const antes = JSON.parse(sha(dourado)) as Record<string, any>;
    sim.aplicarDeriva({ adicionar: { campo_inedito: 'x' }, alterar: { tt_chamado: 987654321 } });
    expect(await rodar({ atualizar: true })).toBe(SAIDA_TROCA_DE_TIPO);
    expect(texto()).toContain('ATENCAO: troca de tipo em campo essencial ou usado');
    expect(texto()).toContain('TROCA    pesquisa.item.tt_chamado (usado)');
    const depois = JSON.parse(sha(dourado)) as Record<string, any>;
    expect(depois.pesquisa.item.tt_chamado.tipos).toEqual(antes.pesquisa.item.tt_chamado.tipos);
    expect(depois.pesquisa.item.campo_inedito).toEqual({ tipos: ['string'], marca: 'outro' });
  });

  it('a captura pede a página inteira de 200 itens', () => {
    expect(LIMITE_CAPTURA).toBe(200);
  });

  it('--atualizar regrava o dourado UNINDO os tipos: nada some, campo novo entra como outro, marcas ficam', async () => {
    const antes = JSON.parse(sha(dourado)) as Record<string, any>;
    sim.aplicarDeriva({ adicionar: { campo_inedito: 'x' }, alterar: { tt_chamado: 987654321 }, remover: ['nm_usuario'] });
    expect(await rodar({ atualizar: true, aceitarTrocaDeTipo: true })).toBe(0);
    expect(texto()).toContain('troca de tipo ACEITA');
    expect(texto()).toContain('Contrato dourado atualizado');
    const depois = JSON.parse(sha(dourado)) as Record<string, any>;
    expect(() => carregarContrato(depois)).not.toThrow();
    const item = depois.pesquisa.item;
    expect(item.tt_chamado.tipos).toEqual([...antes.pesquisa.item.tt_chamado.tipos, 'number']);
    expect(item.tt_chamado.marca).toBe('usado');
    expect(item.campo_inedito).toEqual({ tipos: ['string'], marca: 'outro' });
    expect(item.nm_usuario).toEqual(antes.pesquisa.item.nm_usuario); // ausente não é removido
    expect(Object.keys(item)).toEqual(expect.arrayContaining(Object.keys(antes.pesquisa.item)));
    expect(depois.capturado_em).toEqual([...antes.capturado_em, '2030-05-06']);
    expect(depois.login).toEqual(antes.login);

    // Capturando de novo o mesmo simulador, contra o dourado já atualizado, só sobra o ausente.
    saida.length = 0;
    expect(await rodar()).toBe(0);
    expect(texto()).not.toContain('NOVO ');
    expect(texto()).not.toContain('TIPO ');
    expect(texto()).toContain('AUSENTE  nm_usuario');
  });

  it('senha errada na janela: login recusado, código 1, nada gravado e a senha não aparece', async () => {
    const errada = sentinela('SENHA-ERRADA');
    expect(await rodar({ senha: errada })).toBe(1);
    expect(texto()).toContain('Login recusado: CREDENCIAL');
    expect(fs.existsSync(forma)).toBe(false);
    expect(texto().includes(errada)).toBe(false);
    expect(texto().includes(senha)).toBe(false);
  });
});
