import fs from 'node:fs';
import path from 'node:path';
import {
  CONTRATO_DOURADO,
  carregarContrato,
  diagnosticarLista,
  semDiferenca,
} from '../../src/infraestructure/softdesk/contrato';
import {
  compararForma,
  descreverDiferenca,
  formaDaPesquisa,
  formaDoLogin,
  mapaDeTipos,
  paraArquivoForma,
  temDiferenca,
  trocasCriticas,
  unirNoDourado,
  type FormaObservada,
} from '../../src/infraestructure/softdesk/forma';
import { montarItem } from '../simulador/dados';

const item = (cd: number, mudar: Record<string, unknown> = {}, tirar: string[] = []): Record<string, unknown> => {
  const i = montarItem({ cd_chamado: cd, st_chamado: 1, cd_atendente: 393 });
  for (const n of tirar) delete i[n];
  return Object.assign(i, mudar);
};

const formaDe = (itens: Array<Record<string, unknown>>): FormaObservada => ({
  login: null,
  topo: null,
  treeview: null,
  item: mapaDeTipos(itens),
});

describe('diagnosticarLista (saúde com diagnóstico, §17 camada 5)', () => {
  it('lista que bate com o dourado → sem diferença', () => {
    expect(semDiferenca(diagnosticarLista([item(1), item(2)]))).toBe(true);
    expect(semDiferenca(diagnosticarLista([]))).toBe(true);
  });

  it('novos, ausentes e tipo trocado, só nomes, de todas as marcas', () => {
    const d = diagnosticarLista([item(1, { campo_novo: 'valor-que-nao-pode-aparecer', tt_chamado: 7 }, ['nm_usuario', 'cd_area'])]);
    expect(d).toEqual({ novos: ['campo_novo'], ausentes: ['cd_area', 'nm_usuario'], tipo_trocado: ['tt_chamado'] });
    expect(JSON.stringify(d).includes('valor-que-nao-pode-aparecer')).toBe(false);
  });

  it("critério 'algum' marca o campo que falta em qualquer item; 'todos' só o que falta em todos", () => {
    const lista = [item(1, {}, ['nm_usuario']), item(2)];
    expect(diagnosticarLista(lista, CONTRATO_DOURADO, 'algum').ausentes).toEqual(['nm_usuario']);
    expect(diagnosticarLista(lista, CONTRATO_DOURADO, 'todos').ausentes).toEqual([]);
    expect(diagnosticarLista([item(1, {}, ['nm_usuario']), item(2, {}, ['nm_usuario'])], CONTRATO_DOURADO, 'todos').ausentes).toEqual(['nm_usuario']);
  });

  it('campo nulo onde o dourado aceita nulo e texto não é troca de tipo (sem alarme falso)', () => {
    // ds_grupo_solucao e nm_atendente já vieram nulos e texto nas capturas reais
    const campo = Object.entries(CONTRATO_DOURADO.pesquisa.item).find(([, c]) => c.tipos.length > 1 && c.tipos.includes('null'));
    expect(campo).toBeDefined();
    const nome = (campo as [string, unknown])[0];
    expect(diagnosticarLista([item(1, { [nome]: null }), item(2, { [nome]: 'texto' })]).tipo_trocado).toEqual([]);
  });
});

describe('forma: captura só de nomes e tipos', () => {
  it('mapaDeTipos une os tipos vistos nas amostras e descarta valores', () => {
    const m = mapaDeTipos([{ a: 'x', b: 1 }, { a: null, c: [] }]);
    expect(m).toEqual({ a: ['null', 'string'], b: ['number'], c: ['array'] });
  });

  it('formaDaPesquisa separa topo, treeview e item; sem itens, item fica nulo', () => {
    const f = formaDaPesquisa({ lista: [{ cd_chamado: 1, tt_chamado: 'segredo' }], treeview: { total: 1 }, painel: {} });
    expect(f.topo).toEqual({ lista: ['array'], painel: ['object'], treeview: ['object'] });
    expect(f.treeview).toEqual({ total: ['number'] });
    expect(f.item).toEqual({ cd_chamado: ['number'], tt_chamado: ['string'] });
    expect(JSON.stringify(f).includes('segredo')).toBe(false);
    expect(formaDaPesquisa({ lista: [], treeview: { total: 0 } }).item).toBeNull();
    expect(formaDaPesquisa('texto')).toEqual({ topo: null, treeview: null, item: null });
    expect(formaDoLogin({ status: true, mensagem: 'm' })).toEqual({ mensagem: ['string'], status: ['boolean'] });
    expect(formaDoLogin([])).toBeNull();
  });
});

describe('compararForma e descreverDiferenca (VAL-32)', () => {
  it('igual ao dourado → nenhuma diferença', () => {
    const forma = formaDe([item(1), item(2)]);
    expect(temDiferenca(compararForma(forma, CONTRATO_DOURADO))).toBe(false);
  });

  it('mostra campo novo, ausente e com tipo trocado, e a descrição só traz nomes e tipos', () => {
    const forma = formaDe([item(1, { campo_novo: 'valor-secreto', tt_chamado: 12 }, ['nm_usuario'])]);
    const d = compararForma(forma, CONTRATO_DOURADO);
    expect(d.item?.novos).toEqual([{ nome: 'campo_novo', tipos: ['string'] }]);
    expect(d.item?.ausentes).toEqual(['nm_usuario']);
    expect(d.item?.tipo_trocado).toEqual([
      { nome: 'tt_chamado', esperado: CONTRATO_DOURADO.pesquisa.item.tt_chamado.tipos, observado: ['number'] },
    ]);
    expect(temDiferenca(d)).toBe(true);
    const texto = descreverDiferenca(forma, d).join('\n');
    expect(texto).toContain('NOVO     campo_novo (string)');
    expect(texto).toContain('AUSENTE  nm_usuario');
    expect(texto).toContain('TIPO     tt_chamado:');
    expect(texto).toContain('login: nao capturado');
    expect(texto.includes('valor-secreto')).toBe(false);
  });

  it('um campo que falta em só algumas amostras NÃO é ausente; com um tipo novo numa delas, é tipo trocado', () => {
    const d = compararForma(formaDe([item(1, {}, ['nm_usuario']), item(2, { tt_chamado: 3 })]), CONTRATO_DOURADO);
    expect(d.item?.ausentes).toEqual([]);
    expect(d.item?.tipo_trocado.map((t) => t.nome)).toEqual(['tt_chamado']);
  });

  it('compara também login, topo e treeview', () => {
    const forma: FormaObservada = {
      login: { status: ['string'], novo_login: ['boolean'] },
      topo: { lista: ['array'], treeview: ['object'], extra_topo: ['object'] },
      treeview: { total: ['number'] },
      item: null,
    };
    const d = compararForma(forma, CONTRATO_DOURADO);
    expect(d.login?.novos.map((n) => n.nome)).toEqual(['novo_login']);
    expect(d.login?.tipo_trocado.map((t) => t.nome)).toEqual(['status']);
    expect(d.login?.ausentes).toEqual(expect.arrayContaining(['dados', 'mensagem']));
    expect(d.topo?.novos.map((n) => n.nome)).toEqual(['extra_topo']);
    expect(d.treeview?.ausentes).toEqual(['has_interaction']);
    expect(d.item).toBeUndefined();
  });
});

describe('unirNoDourado (--atualizar)', () => {
  const bruto = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'infraestructure', 'softdesk', 'contrato-dourado.json'), 'utf8')) as Record<string, any>;

  it('troca de tipo em campo usado/essencial NÃO é regravada sem aceitar; com aceitar, une (B-3)', () => {
    const forma = formaDe([item(1, { tt_chamado: 12, campo_novo: 'x' })]);
    const antes = CONTRATO_DOURADO.pesquisa.item;
    const recusado = unirNoDourado(bruto, forma, '2030-01-02') as typeof bruto;
    expect(recusado.pesquisa.item.tt_chamado.tipos).toEqual(antes.tt_chamado.tipos); // intocado
    expect(recusado.pesquisa.item.campo_novo).toEqual({ tipos: ['string'], marca: 'outro' }); // o resto segue
    const aceito = unirNoDourado(bruto, forma, '2030-01-02', { aceitarTrocaDeTipo: true }) as typeof bruto;
    expect(aceito.pesquisa.item.tt_chamado.tipos).toEqual([...antes.tt_chamado.tipos, 'number']);
    expect(trocasCriticas(bruto, forma)).toEqual([
      { escopo: 'item', nome: 'tt_chamado', marca: 'usado', esperado: [...antes.tt_chamado.tipos], observado: ['number'] },
    ]);
  });

  it('essencial que passa a vir nulo é troca crítica; null em campo usado ou outro não é e entra no conjunto (B-1, B-3)', () => {
    const forma = formaDe([item(1, { cd_atendente: null }), item(2, { nm_usuario: null, hr_fechamento_chamado: '10:00' })]);
    expect(trocasCriticas(bruto, forma).map((t) => t.nome)).toEqual(['cd_atendente']);
    const novo = unirNoDourado(bruto, forma, '2030-01-02') as typeof bruto;
    expect(novo.pesquisa.item.cd_atendente.tipos).toEqual(CONTRATO_DOURADO.pesquisa.item.cd_atendente.tipos);
    expect(novo.pesquisa.item.nm_usuario.tipos).toContain('null'); // acrescenta null observado
    expect(novo.pesquisa.item.hr_fechamento_chamado.tipos).toEqual(['null', 'string']);
    expect(compararForma(forma, CONTRATO_DOURADO).item?.tipo_trocado.map((t) => t.nome)).toEqual(['cd_atendente']);
  });

  it('une os tipos observados, mantém marcas, acrescenta o campo novo como outro e NUNCA remove campo ausente', () => {
    const forma = formaDe([item(1, { campo_novo: 'x', tt_chamado: 12 }, ['nm_usuario'])]);
    const novo = unirNoDourado(bruto, forma, '2030-01-02', { aceitarTrocaDeTipo: true }) as typeof bruto;
    const antes = CONTRATO_DOURADO.pesquisa.item;
    // tipo trocado (aceito): o conjunto antigo continua e ganha number
    expect(novo.pesquisa.item.tt_chamado.tipos).toEqual([...antes.tt_chamado.tipos, 'number']);
    expect(novo.pesquisa.item.tt_chamado.marca).toBe('usado');
    // novo
    expect(novo.pesquisa.item.campo_novo).toEqual({ tipos: ['string'], marca: 'outro' });
    // ausente: continua com tudo
    expect(novo.pesquisa.item.nm_usuario).toEqual(antes.nm_usuario);
    expect(novo.capturado_em).toEqual([...(bruto.capturado_em as string[]), '2030-01-02']);
    // continua um contrato válido
    expect(() => carregarContrato(novo)).not.toThrow();
    // a entrada não foi alterada
    expect(bruto.pesquisa.item.campo_novo).toBeUndefined();
  });

  it('rodar duas vezes com a mesma forma não muda mais nada (idempotente)', () => {
    const forma = formaDe([item(1, { campo_novo: 'x', tt_chamado: 12 })]);
    const um = unirNoDourado(bruto, forma, '2030-01-02', { aceitarTrocaDeTipo: true });
    const dois = unirNoDourado(um, forma, '2030-01-02', { aceitarTrocaDeTipo: true });
    expect(dois).toEqual(um);
  });

  it('recusa partir de um dourado malformado', () => {
    expect(() => unirNoDourado({ login: {} }, formaDe([item(1)]), '2030-01-02')).toThrow();
  });

  it('forma-atual.json só tem nomes e tipos', () => {
    const forma = formaDe([item(1, { campo_novo: 'valor-secreto' })]);
    const arquivo = paraArquivoForma(forma, new Date('2030-01-02T03:04:05Z'));
    expect(arquivo.capturado_em).toBe('2030-01-02T03:04:05.000Z');
    expect(JSON.stringify(arquivo).includes('valor-secreto')).toBe(false);
    for (const tipos of Object.values(arquivo.pesquisa.item ?? {})) {
      expect(Array.isArray(tipos) && tipos.every((t) => typeof t === 'string')).toBe(true);
    }
  });
});
