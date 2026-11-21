import { acumularPagina, novoAcumulador, MAX_BYTES_TODAS, MAX_ITENS_TODAS } from '../../src/core/domain/services/fila.service';
import { paraBasico } from '../../src/core/domain/entities/chamado';
import type { PaginaPesquisa } from '../../src/core/domain/ports/softdesk.gateway';

const pagina = (total: number, codigos: number[]): PaginaPesquisa =>
  ({
    total,
    lista: codigos.map((c) => ({ cd_chamado: c, st_chamado: 1, cd_atendente: 393, tt_chamado: `T${c}` })),
  }) as unknown as PaginaPesquisa;

const seq = (n: number): number[] => Array.from({ length: n }, (_, i) => 1000 - i);

describe('fila.service no modo todas', () => {
  it('constantes de regra: 300 itens e 60.000 bytes', () => {
    expect(MAX_ITENS_TODAS).toBe(300);
    expect(MAX_BYTES_TODAS).toBe(60_000);
  });

  it('A-04: teto de itens no último item de uma página curta, com total desatualizado (maior), é fim e não incompleto', () => {
    const ac = acumularPagina(novoAcumulador(0), pagina(500, [5, 4, 3]), { limite: 3, todas: true });
    expect(ac.itens).toHaveLength(3);
    expect(ac.proximoInicio).toBeNull();
    expect(ac.incompleto).toBe(false);
    expect(ac.paradaPor).toBeNull();
  });

  it('teto de itens com mais por ler: incompleto, parada itens, proximo logo após o último item', () => {
    const ac = acumularPagina(novoAcumulador(0), pagina(900, seq(200)), { limite: 50, todas: true });
    expect(ac.itens).toHaveLength(50);
    expect(ac.incompleto).toBe(true);
    expect(ac.paradaPor).toBe('itens');
    expect(ac.proximoInicio).toBe(50);
  });

  it('tamanho: o item que estoura o limite não entra e a continuação começa nele', () => {
    const ac = acumularPagina(novoAcumulador(0), pagina(900, seq(200)), { limite: 1000, todas: true, maxBytes: 1000 });
    expect(ac.incompleto).toBe(true);
    expect(ac.paradaPor).toBe('tamanho');
    expect(ac.itens.length).toBeGreaterThan(0);
    expect(ac.proximoInicio).toBe(ac.itens.length);
    expect(Buffer.byteLength(JSON.stringify(ac.itens))).toBeLessThanOrEqual(1000);
  });

  it('tamanho: um único item maior que o limite é aceito (não trava)', () => {
    const ac = acumularPagina(novoAcumulador(0), pagina(10, [9, 8]), { limite: 10, todas: true, maxBytes: 5 });
    expect(ac.itens).toHaveLength(1);
    expect(ac.paradaPor).toBe('tamanho');
    expect(ac.proximoInicio).toBe(1);
  });

  it('sem maxBytes (modo normal) o tamanho nunca para a leitura', () => {
    const ac = acumularPagina(novoAcumulador(0), pagina(900, seq(200)), { limite: 200 });
    expect(ac.itens).toHaveLength(200);
    expect(ac.paradaPor).toBeNull();
  });

  it('B-04: o JSON do array de itens nunca passa de maxBytes, nem no caso exato (colchetes e vírgulas contados)', () => {
    const pg = pagina(900, seq(5));
    const tres = pg.lista.slice(0, 3).map((i) => paraBasico(i));
    const exato = Buffer.byteLength(JSON.stringify(tres));
    const ac = acumularPagina(novoAcumulador(0), pg, { limite: 100, todas: true, maxBytes: exato });
    expect(ac.itens).toHaveLength(3);
    expect(Buffer.byteLength(JSON.stringify(ac.itens))).toBe(exato);
    const menos = acumularPagina(novoAcumulador(0), pagina(900, seq(5)), { limite: 100, todas: true, maxBytes: exato - 1 });
    expect(menos.itens).toHaveLength(2);
    expect(Buffer.byteLength(JSON.stringify(menos.itens))).toBeLessThanOrEqual(exato - 1);
  });

  it('B-05: página curta cujo resto foi todo filtrado (fechados) não gera continuação vazia', () => {
    const pg = {
      total: 900,
      lista: [
        { cd_chamado: 5, st_chamado: 1, cd_atendente: 393 },
        { cd_chamado: 4, st_chamado: 2, cd_atendente: 393 },
        { cd_chamado: 3, st_chamado: 3, cd_atendente: 393 },
      ],
    } as unknown as PaginaPesquisa;
    const ac = acumularPagina(novoAcumulador(0), pg, { limite: 1, todas: true, somenteAbertos: true });
    expect(ac.itens).toHaveLength(1);
    expect(ac.proximoInicio).toBeNull();
    expect(ac.incompleto).toBe(false);
    expect(ac.paradaPor).toBeNull();
    // Com um aberto ainda depois, a continuação é necessária.
    const pg2 = {
      total: 900,
      lista: [
        { cd_chamado: 5, st_chamado: 1, cd_atendente: 393 },
        { cd_chamado: 4, st_chamado: 2, cd_atendente: 393 },
        { cd_chamado: 3, st_chamado: 1, cd_atendente: 393 },
      ],
    } as unknown as PaginaPesquisa;
    const ac2 = acumularPagina(novoAcumulador(0), pg2, { limite: 1, todas: true, somenteAbertos: true });
    expect(ac2.proximoInicio).toBe(1);
    expect(ac2.paradaPor).toBe('itens');
  });

  it('B-06: o limite é em BYTES (UTF-8), não em caracteres: títulos acentuados', () => {
    const titulo = 'Solicitação de alteração de configuração ção ção ção';
    const pg = {
      total: 900,
      lista: [3, 2, 1].map((c) => ({ cd_chamado: c, st_chamado: 1, cd_atendente: 393, tt_chamado: titulo })),
    } as unknown as PaginaPesquisa;
    const basico = paraBasico(pg.lista[0]);
    const json = JSON.stringify(basico);
    const chars = json.length;
    const bytes = Buffer.byteLength(json);
    expect(bytes).toBeGreaterThan(chars);
    // Por caracteres caberiam 2 itens; por bytes só cabe 1.
    const maxBytes = 1 + 2 * (chars + 1);
    expect(1 + 2 * (bytes + 1)).toBeGreaterThan(maxBytes);
    const ac = acumularPagina(novoAcumulador(0), pg, { limite: 100, todas: true, maxBytes });
    expect(ac.itens).toHaveLength(1);
    expect(ac.paradaPor).toBe('tamanho');
    expect(ac.proximoInicio).toBe(1);
  });
});
