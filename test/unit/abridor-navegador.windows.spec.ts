import { AbridorNavegadorWindows, PRAZO_ABRIR_MS, type Executar } from '../../src/infraestructure/login/abridor-navegador.windows';

const TOKEN = 'a1'.repeat(24);
const OK = `http://127.0.0.1:54321/?t=${TOKEN}`;

function espiao(erro: Error | null = null): { exec: Executar; chamadas: Array<[string, string[]]> } {
  const chamadas: Array<[string, string[]]> = [];
  return {
    chamadas,
    exec: (arquivo, args, cb) => {
      chamadas.push([arquivo, args]);
      cb(erro);
    },
  };
}

describe('AbridorNavegadorWindows', () => {
  it('abre com cmd /c start "" <url> e devolve true', async () => {
    const e = espiao();
    expect(await new AbridorNavegadorWindows(e.exec).abrir(OK)).toBe(true);
    expect(e.chamadas).toEqual([['cmd', ['/c', 'start', '', OK]]]);
  });

  it('comando que nunca termina: devolve false após o prazo e passa timeout ao execFile (achado A-9)', async () => {
    jest.useFakeTimers();
    try {
      const preso: Executar = () => undefined;
      const p = new AbridorNavegadorWindows(preso).abrir(OK);
      await jest.advanceTimersByTimeAsync(PRAZO_ABRIR_MS + 1500);
      expect(await p).toBe(false);
    } finally {
      jest.useRealTimers();
    }
  });

  it('devolve false se o comando falhar ou lançar', async () => {
    expect(await new AbridorNavegadorWindows(espiao(new Error('x')).exec).abrir(OK)).toBe(false);
    const lanca: Executar = () => {
      throw new Error('boom');
    };
    expect(await new AbridorNavegadorWindows(lanca).abrir(OK)).toBe(false);
  });

  it.each([
    `https://127.0.0.1:54321/?t=${TOKEN}`,
    `http://localhost:54321/?t=${TOKEN}`,
    `http://127.0.0.1.evil.example:54321/?t=${TOKEN}`,
    `http://evil.example/?t=${TOKEN}`,
    `http://127.0.0.1/?t=${TOKEN}`,
    `http://127.0.0.1:0/?t=${TOKEN}`,
    `http://127.0.0.1:99999/?t=${TOKEN}`,
    `http://127.0.0.1:54321/outro?t=${TOKEN}`,
    'http://127.0.0.1:54321/?t=curto',
    `http://127.0.0.1:54321/?t=${TOKEN}&x=1`,
    `http://127.0.0.1:54321/?t=${TOKEN}"& calc`,
    `http://127.0.0.1:54321/?t=${'ZZ'.repeat(24)}`,
    'file:///C:/Windows/System32/calc.exe',
    'calc.exe',
    '',
  ])('URL fora do formato da janela não é aberta: %s', async (url) => {
    const e = espiao();
    expect(await new AbridorNavegadorWindows(e.exec).abrir(url)).toBe(false);
    expect(e.chamadas).toHaveLength(0);
  });
});
