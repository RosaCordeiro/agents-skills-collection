import fs from 'node:fs';
import path from 'node:path';
import type { ErroSoftdesk } from '../../src/core/domain/errors/erro-softdesk';
import {
  CONTRATO_DOURADO,
  MARCAS_CAMPO,
  TIPOS_CAMPO,
  carregarContrato,
  classificarLogin,
  classificarPesquisa,
  compararItem,
  conferirItem,
  conferirLista,
  diagnosticarLista,
  evidenciaDe,
  tipoAceito,
  tipoDe,
  tipoDeMidia,
  type RespostaClassificavel,
} from '../../src/infraestructure/softdesk/contrato';
import { montarItem } from '../simulador/dados';

const json = (status: number, valor: unknown, extra: Partial<RespostaClassificavel> = {}): RespostaClassificavel => ({
  status,
  contentType: 'application/json',
  ehJson: true,
  json: valor,
  ...extra,
});
const html = (status = 200, extra: Partial<RespostaClassificavel> = {}): RespostaClassificavel => ({
  status,
  contentType: 'text/html; charset=UTF-8',
  ehJson: false,
  ...extra,
});

function codigo(e: ErroSoftdesk | null): string | null {
  return e ? e.codigo : null;
}

const itemBom = () => montarItem({ cd_chamado: 10, st_chamado: 1, cd_atendente: 393 });
const paginaBoa = { lista: [itemBom()], treeview: { total: 1, has_interaction: false } };

describe('contrato dourado (§17 camada 2)', () => {
  const caminho = path.join(__dirname, '..', '..', 'src', 'infraestructure', 'softdesk', 'contrato-dourado.json');
  const bruto = JSON.parse(fs.readFileSync(caminho, 'utf8'));

  it('carrega e valida; o embutido é o do arquivo', () => {
    expect(carregarContrato(bruto)).toEqual(CONTRATO_DOURADO);
  });

  it('marcas: 3 essenciais e 8 usados, nos campos certos', () => {
    const item = CONTRATO_DOURADO.pesquisa.item;
    const por = (m: string) => Object.keys(item).filter((n) => item[n].marca === m).sort();
    expect(por('essencial')).toEqual(['cd_atendente', 'cd_chamado', 'st_chamado']);
    expect(por('usado')).toEqual(
      ['da_chamado', 'ds_prioridade', 'ds_status', 'ds_tipo_chamado', 'ha_chamado', 'nm_usuario', 'qtd_interacoes', 'tt_chamado'].sort(),
    );
    expect(Object.keys(item).length).toBeGreaterThan(60);
    expect(item.cd_chamado.tipos).toEqual(['number']);
    expect(item.st_chamado.tipos).toEqual(['number']);
    expect(item.cd_atendente.tipos).toEqual(['number']);
  });

  it('guarda o conjunto de tipos observados (campos que ora vêm nulos, ora texto)', () => {
    const item = CONTRATO_DOURADO.pesquisa.item;
    expect([...item.nm_atendente.tipos].sort()).toEqual(['null', 'string']);
    expect([...item.ds_grupo_solucao.tipos].sort()).toEqual(['null', 'string']);
    expect([...item.st_atendente.tipos].sort()).toEqual(['null', 'number']);
  });

  it('login: status booleano é o essencial', () => {
    expect(CONTRATO_DOURADO.login.campos.status).toEqual({ tipos: ['boolean'], marca: 'essencial' });
  });

  it('só nomes, tipos e marcas: nenhum valor de chamado no arquivo', () => {
    const visitar = (no: unknown, ondeEstou: string): void => {
      if (Array.isArray(no)) {
        no.forEach((x, i) => visitar(x, `${ondeEstou}[${i}]`));
      } else if (no !== null && typeof no === 'object') {
        for (const [k, v] of Object.entries(no)) visitar(v, `${ondeEstou}.${k}`);
      }
    };
    visitar(bruto, 'raiz');
    for (const bloco of [bruto.login.campos, bruto.pesquisa.topo, bruto.pesquisa.treeview, bruto.pesquisa.item]) {
      for (const [nome, campo] of Object.entries<Record<string, unknown>>(bloco)) {
        expect(Object.keys(campo).sort()).toEqual(['marca', 'tipos']);
        expect(MARCAS_CAMPO as readonly unknown[]).toContain(campo.marca);
        for (const t of campo.tipos as unknown[]) expect(TIPOS_CAMPO as readonly unknown[]).toContain(t);
        expect(nome).toMatch(/^[a-z][a-z0-9_]*$/);
      }
    }
    // os únicos textos livres do arquivo são a descrição e os nomes das fontes
    expect(Object.keys(bruto).sort()).toEqual(['capturado_em', 'descricao', 'fontes', 'login', 'pesquisa', 'versao']);
  });

  it('carregarContrato recusa contrato malformado', () => {
    const clone = () => JSON.parse(JSON.stringify(bruto));
    const semMarca = clone();
    semMarca.pesquisa.item.cd_chamado.marca = 'usado';
    expect(() => carregarContrato(semMarca)).toThrow(/cd_chamado deve ser essencial/);
    const tipoRuim = clone();
    tipoRuim.pesquisa.item.tt_chamado.tipos = ['texto'];
    expect(() => carregarContrato(tipoRuim)).toThrow(/tipo desconhecido/);
    const marcaRuim = clone();
    marcaRuim.pesquisa.item.tt_chamado.marca = 'importante';
    expect(() => carregarContrato(marcaRuim)).toThrow(/marca desconhecida/);
    const semItem = clone();
    delete semItem.pesquisa.item;
    expect(() => carregarContrato(semItem)).toThrow();
    expect(() => carregarContrato(null)).toThrow();
  });
});

describe('classificarLogin (VAL-06 unit, §7.4)', () => {
  it('página de login: 200 com cookie XSRF está dentro do contrato', () => {
    expect(classificarLogin('pagina', html(200, { temXsrf: true }))).toBeNull();
  });

  it('página sem cookie XSRF → LAYOUT_LOGIN_MUDOU com destaque', () => {
    const e = classificarLogin('pagina', html(200, { temXsrf: false }))!;
    expect(e.codigo).toBe('LAYOUT_LOGIN_MUDOU');
    expect(e.destaque).toBe(true);
    expect(e.evidencia).toEqual({ http_status: 200, content_type: 'text/html' });
  });

  it.each([301, 302, 404, 403, 204])('página com HTTP %i (depois dos redirecionamentos) → LAYOUT_LOGIN_MUDOU', (status) => {
    const e = classificarLogin('pagina', html(status, { temXsrf: true, locationPath: '/outro' }))!;
    expect(e.codigo).toBe('LAYOUT_LOGIN_MUDOU');
    expect(e.destaque).toBe(true);
    expect(e.evidencia?.http_status).toBe(status);
  });

  it('HTTP 5xx na página é REDE, não mudança de layout', () => {
    expect(codigo(classificarLogin('pagina', html(503, { temXsrf: false })))).toBe('REDE');
  });

  it('envio: 401 → CREDENCIAL, sem destaque', () => {
    const e = classificarLogin('envio', json(401, { status: false }))!;
    expect(e.codigo).toBe('CREDENCIAL');
    expect(e.destaque).toBe(false);
  });

  it('envio: 401 com corpo HTML também é CREDENCIAL', () => {
    expect(codigo(classificarLogin('envio', html(401)))).toBe('CREDENCIAL');
  });

  it('envio: JSON com status false → CREDENCIAL; a mensagem do SoftDesk não é repetida', () => {
    const e = classificarLogin('envio', json(200, { status: false, mensagem: 'Senha do fulano invalida' }))!;
    expect(e.codigo).toBe('CREDENCIAL');
    expect(JSON.stringify([e.mensagem, e.acao, e.evidencia])).not.toContain('fulano');
  });

  it('envio: JSON com status true está dentro do contrato', () => {
    expect(classificarLogin('envio', json(200, { status: true, mensagem: 'ok', rota: '/x', tipo_retorno: 1, dados: [] }))).toBeNull();
  });

  it('envio: resposta HTML → LAYOUT_LOGIN_MUDOU com destaque e evidência sem corpo', () => {
    const e = classificarLogin('envio', html(200))!;
    expect(e.codigo).toBe('LAYOUT_LOGIN_MUDOU');
    expect(e.destaque).toBe(true);
    expect(Object.keys(e.evidencia ?? {}).sort()).toEqual(['content_type', 'http_status']);
  });

  it.each([
    ['JSON sem status', { mensagem: 'x' }],
    ['status em texto', { status: 'true' }],
    ['status numérico', { status: 1 }],
    ['status nulo', { status: null }],
    ['array', [{ status: true }]],
    ['texto', 'ok'],
    ['nulo', null],
  ])('envio: %s → LAYOUT_LOGIN_MUDOU', (_nome, corpo) => {
    expect(codigo(classificarLogin('envio', json(200, corpo)))).toBe('LAYOUT_LOGIN_MUDOU');
  });

  it('envio: redirecionamento no POST não é JSON → LAYOUT_LOGIN_MUDOU; 5xx → REDE', () => {
    expect(codigo(classificarLogin('envio', html(302, { locationPath: '/home' })))).toBe('LAYOUT_LOGIN_MUDOU');
    expect(codigo(classificarLogin('envio', html(500)))).toBe('REDE');
    expect(codigo(classificarLogin('envio', json(502, { status: true })))).toBe('REDE');
  });
});

describe('classificarPesquisa (VAL-07 unit, VAL-13 classificação, §7.4)', () => {
  it('resposta completa está dentro do contrato; lista vazia também', () => {
    expect(classificarPesquisa(json(200, paginaBoa))).toBeNull();
    expect(classificarPesquisa(json(200, { lista: [], treeview: { total: 0 } }))).toBeNull();
  });

  it.each([
    ['sem lista', { treeview: { total: 3 } }],
    ['lista que não é array', { lista: {}, treeview: { total: 3 } }],
    ['lista nula', { lista: null, treeview: { total: 3 } }],
    ['sem treeview', { lista: [] }],
    ['treeview sem total', { lista: [], treeview: { has_interaction: false } }],
    ['total em texto', { lista: [], treeview: { total: '3' } }],
    ['total nulo', { lista: [], treeview: { total: null } }],
    ['treeview que não é objeto', { lista: [], treeview: 3 }],
    ['item da lista que não é objeto', { lista: [1, 2], treeview: { total: 2 } }],
    ['item nulo', { lista: [null], treeview: { total: 1 } }],
    ['raiz em array', [{ lista: [] }]],
  ])('%s → CONTRATO_ROTA_MUDOU com destaque', (_nome, corpo) => {
    const e = classificarPesquisa(json(200, corpo))!;
    expect(e.codigo).toBe('CONTRATO_ROTA_MUDOU');
    expect(e.destaque).toBe(true);
  });

  it('HTML 200, 404, 400, 204 e outros 3xx → CONTRATO_ROTA_MUDOU', () => {
    expect(codigo(classificarPesquisa(html(200)))).toBe('CONTRATO_ROTA_MUDOU');
    expect(codigo(classificarPesquisa(html(404)))).toBe('CONTRATO_ROTA_MUDOU');
    expect(codigo(classificarPesquisa(json(400, { lista: [], treeview: { total: 0 } })))).toBe('CONTRATO_ROTA_MUDOU');
    expect(codigo(classificarPesquisa(html(204)))).toBe('CONTRATO_ROTA_MUDOU');
    expect(codigo(classificarPesquisa(html(302, { locationPath: '/novo-caminho' })))).toBe('CONTRATO_ROTA_MUDOU');
    expect(codigo(classificarPesquisa(html(301)))).toBe('CONTRATO_ROTA_MUDOU');
  });

  it('401 e 403 → SESSAO_EXPIRADA (sem destaque)', () => {
    for (const status of [401, 403]) {
      const e = classificarPesquisa(json(status, { message: 'Unauthenticated.' }))!;
      expect(e.codigo).toBe('SESSAO_EXPIRADA');
      expect(e.destaque).toBe(false);
      expect(e.evidencia?.http_status).toBe(status);
    }
  });

  it('3xx cujo Location termina em /login → SESSAO_EXPIRADA', () => {
    for (const loc of ['/login', '/app/login', '/login/', '/LOGIN']) {
      for (const status of [301, 302, 303, 307, 308]) {
        expect(codigo(classificarPesquisa(html(status, { locationPath: loc })))).toBe('SESSAO_EXPIRADA');
      }
    }
    expect(classificarPesquisa(html(302, { locationPath: '/login' }))!.evidencia).toEqual({
      http_status: 302,
      content_type: 'text/html',
      location_path: '/login',
    });
  });

  it('3xx para outro caminho, inclusive /login-novo ou /logout, não é sessão expirada', () => {
    for (const loc of ['/login-novo', '/logout', '/loginx', '/']) {
      expect(codigo(classificarPesquisa(html(302, { locationPath: loc })))).toBe('CONTRATO_ROTA_MUDOU');
    }
    // /login só em resposta 3xx: um 200 com o caminho de login não vale
    expect(codigo(classificarPesquisa(html(200, { locationPath: '/login' })))).toBe('CONTRATO_ROTA_MUDOU');
  });

  it('5xx → REDE, antes de qualquer outra regra', () => {
    expect(codigo(classificarPesquisa(html(500)))).toBe('REDE');
    expect(codigo(classificarPesquisa(json(502, paginaBoa)))).toBe('REDE');
    expect(codigo(classificarPesquisa(html(503, { locationPath: '/login' })))).toBe('REDE');
  });
});

describe('evidenciaDe / tipoDeMidia', () => {
  it('só status, tipo de mídia (sem parâmetros) e caminho do Location', () => {
    const e = evidenciaDe({
      status: 302,
      contentType: 'Text/HTML; charset=utf-8; boundary=segredo',
      locationPath: '/login',
      ehJson: false,
      json: { senha: 'x' },
      temXsrf: true,
    });
    expect(e).toEqual({ http_status: 302, content_type: 'text/html', location_path: '/login' });
    expect(tipoDeMidia(null)).toBeUndefined();
    expect(tipoDeMidia('')).toBeUndefined();
    expect(tipoDeMidia(' application/json ;x=y')).toBe('application/json');
  });
});

describe('tipoDe', () => {
  it('classifica os valores do JSON', () => {
    expect(tipoDe('a')).toBe('string');
    expect(tipoDe(1)).toBe('number');
    expect(tipoDe(true)).toBe('boolean');
    expect(tipoDe(null)).toBe('null');
    expect(tipoDe([])).toBe('array');
    expect(tipoDe({})).toBe('object');
  });
});

describe('conferirItem (§17 camada 3; VAL-29, VAL-30, VAL-31 unit)', () => {
  it('item igual à forma do contrato: nada a reportar', () => {
    expect(conferirItem(itemBom())).toEqual({ essenciais: [], usados: [], novos: [] });
  });

  it('VAL-29: campo usado ausente → usados, sem derrubar o contrato', () => {
    const item = itemBom();
    delete item.nm_usuario;
    expect(conferirItem(item)).toEqual({ essenciais: [], usados: ['nm_usuario'], novos: [] });
  });

  it.each([
    ['nm_usuario', 123],
    ['qtd_interacoes', 'muitas'],
    ['tt_chamado', ['a']],
    ['da_chamado', { dia: 1 }],
    ['ha_chamado', false],
  ])('VAL-29: campo usado %s com tipo fora do conjunto (%p) → usados', (campo, valor) => {
    const item = itemBom();
    item[campo] = valor;
    expect(conferirItem(item)).toEqual({ essenciais: [], usados: [campo], novos: [] });
  });

  // Tolerância a null em campo usado: emenda aprovada em 2026-11-21 (SPEC-001 v0.9 RN-17, ARCH-001 §17, ADR-009; REVIEW-001-B B-1).
  it('tolerância a null por desenho: null em campo usado ou outro NUNCA gera deriva; 1 item nulo entre 3000 não dispara alarme (B-1)', () => {
    const lista = Array.from({ length: 3000 }, (_, i) => montarItem({ cd_chamado: i + 1, st_chamado: 1, cd_atendente: 393 }));
    lista[1500] = { ...lista[1500], ds_tipo_chamado: null, ds_prioridade: null, nm_usuario: null, qtd_interacoes: null, hr_fechamento_chamado: null };
    expect(conferirLista(lista)).toEqual({ essenciais: [], usados: [], novos: [] });
    expect(diagnosticarLista(lista).tipo_trocado).toEqual([]);
  });

  it('essencial continua estrito: null em cd_atendente e st_chamado → essenciais (B-1)', () => {
    const item = itemBom();
    item.cd_atendente = null;
    item.st_chamado = null;
    expect(conferirItem(item).essenciais.sort()).toEqual(['cd_atendente', 'st_chamado']);
  });

  it('tipoAceito: null aceito em usado/outro, nunca em essencial; campo só visto nulo aceita qualquer tipo; usado com tipo trocado continua desvio (B-1, B-2)', () => {
    expect(tipoAceito({ tipos: ['string'], marca: 'usado' }, 'null')).toBe(true);
    expect(tipoAceito({ tipos: ['string'], marca: 'outro' }, 'null')).toBe(true);
    expect(tipoAceito({ tipos: ['number'], marca: 'essencial' }, 'null')).toBe(false);
    expect(tipoAceito({ tipos: ['null'], marca: 'outro' }, 'string')).toBe(true);
    expect(tipoAceito({ tipos: ['null'], marca: 'essencial' }, 'string')).toBe(false);
    expect(tipoAceito({ tipos: ['string'], marca: 'usado' }, 'number')).toBe(false);
  });

  it('saúde: chamado fechado (campos "outro" que o dourado só viu nulos agora com valor) NÃO gera tipo_trocado (B-2)', () => {
    const fechado = montarItem({ cd_chamado: 10, st_chamado: 2, cd_atendente: 393 });
    Object.assign(fechado, { hr_fechamento_chamado: '10:00', hr_resolucao_chamado: '09:30', dt_termino_previsto_chamado: '2026-11-20' });
    expect(diagnosticarLista([fechado]).tipo_trocado).toEqual([]);
    expect(conferirItem(fechado)).toEqual({ essenciais: [], usados: [], novos: [] });
  });

  it('VAL-30: essencial ausente → essenciais', () => {
    for (const campo of ['cd_chamado', 'st_chamado', 'cd_atendente']) {
      const item = itemBom();
      delete item[campo];
      expect(conferirItem(item)).toEqual({ essenciais: [campo], usados: [], novos: [] });
    }
  });

  it('VAL-30: st_chamado em texto e cd_atendente nulo → essenciais', () => {
    const item = itemBom();
    item.st_chamado = 'Em atendimento';
    item.cd_atendente = null;
    expect(conferirItem(item).essenciais.sort()).toEqual(['cd_atendente', 'st_chamado']);
  });

  it('VAL-31: campo novo → só em novos', () => {
    const item = itemBom();
    item.campo_novo_xyz = 'qualquer valor';
    item.outro_novo = 1;
    expect(conferirItem(item)).toEqual({ essenciais: [], usados: [], novos: ['campo_novo_xyz', 'outro_novo'] });
  });

  it('campo "outro" ausente ou com tipo trocado não é problema para a conferência', () => {
    const item = itemBom();
    delete item.cd_cliente;
    item.nr_anexo = 'texto';
    expect(conferirItem(item)).toEqual({ essenciais: [], usados: [], novos: [] });
  });

  it('campo nulo permitido pelo conjunto de tipos não gera alarme falso', () => {
    const item = itemBom();
    item.nm_atendente = null;
    item.ds_grupo_solucao = 'Suporte';
    expect(conferirItem(item)).toEqual({ essenciais: [], usados: [], novos: [] });
  });

  it('nome de campo que coincide com membro de Object (constructor, toString, __proto__) é campo novo', () => {
    const item = itemBom();
    Object.defineProperty(item, '__proto__', { value: 1, enumerable: true, configurable: true, writable: true });
    Object.defineProperty(item, 'constructor', { value: 'x', enumerable: true, configurable: true, writable: true });
    Object.defineProperty(item, 'toString', { value: 'y', enumerable: true, configurable: true, writable: true });
    const c = conferirItem(item);
    expect(c.novos.sort()).toEqual(['__proto__', 'constructor', 'toString']);
    expect(c.essenciais).toEqual([]);
  });

  it('compararItem informa também os desvios de campos "outro" (base da saúde com diagnóstico)', () => {
    const item = itemBom();
    delete item.cd_cliente;
    item.nr_anexo = 'texto';
    const { desvios } = compararItem(item);
    expect(desvios).toEqual(
      expect.arrayContaining([
        { nome: 'cd_cliente', marca: 'outro', motivo: 'ausente' },
        { nome: 'nr_anexo', marca: 'outro', motivo: 'tipo_trocado' },
      ]),
    );
    expect(desvios).toHaveLength(2);
  });

  it('conferirLista junta os itens: cada nome aparece uma vez por resposta', () => {
    const itens = Array.from({ length: 5 }, (_, i) => {
      const it = montarItem({ cd_chamado: i + 1, st_chamado: 1, cd_atendente: 393 });
      delete it.nm_usuario;
      it.campo_novo = i;
      if (i === 3) delete it.cd_atendente;
      return it;
    });
    expect(conferirLista(itens)).toEqual({
      essenciais: ['cd_atendente'],
      usados: ['nm_usuario'],
      novos: ['campo_novo'],
    });
    expect(conferirLista([])).toEqual({ essenciais: [], usados: [], novos: [] });
  });

  it('usa o contrato recebido, não só o embutido', () => {
    const outro = carregarContrato(JSON.parse(JSON.stringify(CONTRATO_DOURADO)));
    outro.pesquisa.item.tt_chamado.tipos = ['number'];
    expect(conferirItem(itemBom(), outro).usados).toEqual(['tt_chamado']);
    expect(conferirItem(itemBom()).usados).toEqual([]);
  });
});
