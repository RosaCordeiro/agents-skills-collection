import { Semaforo } from '../../src/infraestructure/softdesk/semaforo';

/** Tarefa que só termina quando o teste manda. */
function tarefaManual() {
  let terminar!: () => void;
  let falhar!: (e: Error) => void;
  const espera = new Promise<void>((resolve, reject) => {
    terminar = resolve;
    falhar = reject;
  });
  return { espera, terminar, falhar };
}

const soltar = () => new Promise<void>((r) => setImmediate(r));

describe('Semaforo (RNF-04, VAL-23 apoio)', () => {
  it('recusa menos de uma vaga ou vaga não inteira', () => {
    expect(() => new Semaforo(0)).toThrow(RangeError);
    expect(() => new Semaforo(1.5)).toThrow(RangeError);
    expect(() => new Semaforo(-1)).toThrow(RangeError);
  });

  it('com 2 vagas e 6 tarefas, nunca há mais de 2 em andamento e o pico é 2', async () => {
    const sem = new Semaforo(2);
    let simultaneas = 0;
    let picoVisto = 0;
    const tarefas = Array.from({ length: 6 }, () => tarefaManual());
    const ordemDeInicio: number[] = [];
    const resultados = tarefas.map((t, i) =>
      sem.executar(async () => {
        ordemDeInicio.push(i);
        simultaneas += 1;
        picoVisto = Math.max(picoVisto, simultaneas);
        await t.espera;
        simultaneas -= 1;
        return i;
      }),
    );
    await soltar();
    expect(sem.emUso).toBe(2);
    expect(sem.aguardando).toBe(4);
    expect(ordemDeInicio).toEqual([0, 1]);

    // terminar a segunda libera a vaga para a próxima da fila (FIFO)
    tarefas[1].terminar();
    await soltar();
    expect(ordemDeInicio).toEqual([0, 1, 2]);
    expect(sem.emUso).toBe(2);

    tarefas[0].terminar();
    tarefas[2].terminar();
    await soltar();
    expect(ordemDeInicio).toEqual([0, 1, 2, 3, 4]);
    tarefas[3].terminar();
    tarefas[4].terminar();
    await soltar();
    tarefas[5].terminar();
    expect(await Promise.all(resultados)).toEqual([0, 1, 2, 3, 4, 5]);

    expect(picoVisto).toBe(2);
    expect(sem.pico).toBe(2);
    expect(sem.emUso).toBe(0);
    expect(sem.aguardando).toBe(0);
  });

  it('com uma tarefa só, o pico é 1', async () => {
    const sem = new Semaforo(2);
    await sem.executar(async () => 'ok');
    expect(sem.pico).toBe(1);
    expect(sem.emUso).toBe(0);
  });

  it('devolve a vaga quando a tarefa falha', async () => {
    const sem = new Semaforo(1);
    await expect(
      sem.executar(async () => {
        throw new Error('falhou');
      }),
    ).rejects.toThrow('falhou');
    expect(sem.emUso).toBe(0);
    await expect(sem.executar(async () => 'depois')).resolves.toBe('depois');
  });

  it('a falha de uma tarefa não trava as que esperam', async () => {
    const sem = new Semaforo(1);
    const a = tarefaManual();
    const p1 = sem.executar(() => a.espera);
    const p2 = sem.executar(async () => 'segunda');
    await soltar();
    expect(sem.aguardando).toBe(1);
    a.falhar(new Error('x'));
    await expect(p1).rejects.toThrow('x');
    await expect(p2).resolves.toBe('segunda');
  });

  it('abortar na espera tira da fila sem ocupar vaga, e a fila segue', async () => {
    const sem = new Semaforo(1);
    const a = tarefaManual();
    const p1 = sem.executar(() => a.espera);
    const ctl = new AbortController();
    const p2 = sem.executar(async () => 'nunca', ctl.signal);
    const p3 = sem.executar(async () => 'terceira');
    await soltar();
    expect(sem.aguardando).toBe(2);
    ctl.abort(new Error('desisti'));
    await expect(p2).rejects.toThrow('desisti');
    expect(sem.aguardando).toBe(1);
    a.terminar();
    await p1;
    await expect(p3).resolves.toBe('terceira');
    expect(sem.emUso).toBe(0);
  });

  it('sinal já abortado rejeita sem tentar a vaga', async () => {
    const sem = new Semaforo(2);
    const ctl = new AbortController();
    ctl.abort(new Error('antes'));
    let rodou = false;
    await expect(
      sem.executar(async () => {
        rodou = true;
      }, ctl.signal),
    ).rejects.toThrow('antes');
    expect(rodou).toBe(false);
    expect(sem.emUso).toBe(0);
    expect(sem.pico).toBe(0);
  });

  it('abortar depois de obter a vaga não a perde nem a libera duas vezes', async () => {
    const sem = new Semaforo(1);
    const ctl = new AbortController();
    const a = tarefaManual();
    const p = sem.executar(() => a.espera, ctl.signal);
    await soltar();
    ctl.abort();
    expect(sem.emUso).toBe(1);
    a.terminar();
    await p;
    expect(sem.emUso).toBe(0);
  });

  it('liberar duas vezes não devolve vaga demais', async () => {
    const sem = new Semaforo(1);
    const liberar = await sem.adquirir();
    liberar();
    liberar();
    expect(sem.emUso).toBe(0);
    const l1 = await sem.adquirir();
    const esperando = sem.adquirir();
    await soltar();
    expect(sem.aguardando).toBe(1);
    l1();
    const l2 = await esperando;
    expect(sem.emUso).toBe(1);
    l2();
    expect(sem.emUso).toBe(0);
  });
});
