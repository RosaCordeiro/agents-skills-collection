import http from 'node:http';
import type { ISoftdeskGateway } from '../../src/core/domain/ports/softdesk.gateway';
import type { SessaoHttp } from '../../src/core/domain/entities/sessao';
import { ErroSoftdesk } from '../../src/core/domain/errors/erro-softdesk';
import net from 'node:net';
import os from 'node:os';
import { JanelaLoginServer, gracaLoginDoTimeout } from '../../src/infraestructure/login/janela-login.server';
import { montarCsp } from '../../src/infraestructure/login/pagina';
import { descreverErro, sentinela } from '../simulador/apoio';
import { gerarMassa } from '../simulador/dados';
import {
  baseDe,
  formulario,
  janelaFechada,
  montarAmbiente,
  postarLogin,
  requisitar,
  tokenDe,
  type Ambiente,
} from '../simulador/sessao-apoio';
import { SoftdeskSimulado } from '../simulador/softdesk-simulado';

describe('janela de login (fragmento 3)', () => {
  let sim: SoftdeskSimulado;
  let amb: Ambiente;

  beforeEach(async () => {
    sim = await SoftdeskSimulado.iniciar({ chamados: gerarMassa([{ cdAtendente: 393, status: 1, quantidade: 3 }]) });
    amb = montarAmbiente(sim);
  });
  afterEach(async () => {
    amb.c.janelaLogin.fechar();
    await sim.fechar();
  });

  /** Abre a janela e devolve o endereço que o "navegador" recebeu. */
  async function abrir(): Promise<string> {
    await amb.c.janelaLogin.abrirOuReaproveitar();
    return amb.abridor.urls[amb.abridor.urls.length - 1];
  }

  describe('VAL-05: proteções da janela', () => {
    it('Host diferente de 127.0.0.1:<porta> → 403, e a janela continua respondendo ao Host certo', async () => {
      const url = await abrir();
      const porta = new URL(url).port;
      for (const host of ['evil.example', 'localhost:' + porta, '127.0.0.1', '127.0.0.1:1', `127.0.0.1:${porta}.evil.example`]) {
        const r = await requisitar(url, { host });
        expect(r.status).toBe(403);
        expect(r.corpo).not.toContain(tokenDe(url));
      }
      const ok = await requisitar(url);
      expect(ok.status).toBe(200);
      expect(ok.corpo).toContain('SoftDesk Local');
      expect(sim.requisicoes('/login')).toHaveLength(0);
    });

    it('Host errado também recusa o POST, sem chamar o SoftDesk', async () => {
      const url = await abrir();
      const r = await requisitar(`${baseDe(url)}/entrar`, {
        metodo: 'POST',
        host: 'evil.example',
        corpo: formulario(tokenDe(url), { u: 'u', s: sentinela() }),
      });
      expect(r.status).toBe(403);
      expect(sim.requisicoes('/login')).toHaveLength(0);
      expect(amb.c.sessaoStore.estado()).toBe('AGUARDANDO_LOGIN');
    });

    it('Origin de outro site no POST → 403', async () => {
      const url = await abrir();
      const r = await requisitar(`${baseDe(url)}/entrar`, {
        metodo: 'POST',
        corpo: formulario(tokenDe(url), { u: 'u', s: sentinela() }),
        headers: { Origin: 'http://outro-site.example' },
      });
      expect(r.status).toBe(403);
      expect(sim.requisicoes('/login')).toHaveLength(0);
    });

    it('Origin "null" (POST do próprio formulário com Referrer-Policy no-referrer) só vale com Sec-Fetch-Site same-origin', async () => {
      // Achado na validação em produção (21/11/2026): o navegador envia `Origin: null` no POST do próprio
      // formulário por causa do `Referrer-Policy: no-referrer`; a janela recusava o login legítimo.
      const url = await abrir();
      const base = baseDe(url);
      const corpo = formulario(tokenDe(url), { u: 'u', s: sentinela() });
      const semHeader = await requisitar(`${base}/entrar`, { metodo: 'POST', corpo, headers: { Origin: 'null' } });
      expect(semHeader.status).toBe(403);
      const outroSite = await requisitar(`${base}/entrar`, {
        metodo: 'POST',
        corpo,
        headers: { Origin: 'null', 'Sec-Fetch-Site': 'cross-site' },
      });
      expect(outroSite.status).toBe(403);
      expect(sim.requisicoes('/login')).toHaveLength(0);
      // Mesmo token ainda vale: a recusa não o consumiu. Agora, o caso legítimo do navegador.
      const legitimo = await requisitar(`${base}/entrar`, {
        metodo: 'POST',
        corpo,
        headers: { Origin: 'null', 'Sec-Fetch-Site': 'same-origin' },
      });
      expect(legitimo.status).not.toBe(403);
      expect(sim.requisicoes('/login').length).toBeGreaterThan(0);
    });

    it('token errado, ausente ou de outro tamanho → 403 (GET e POST); nada chega ao SoftDesk', async () => {
      const url = await abrir();
      const base = baseDe(url);
      const certo = tokenDe(url);
      const errado = certo.slice(0, -1) + (certo.endsWith('0') ? '1' : '0');
      for (const caminho of ['/', '/?t=', `/?t=${errado}`, `/?t=${certo}00`, `/?t=${certo.slice(2)}`, '/?x=1']) {
        const r = await requisitar(`${base}${caminho}`);
        expect(r.status).toBe(403);
      }
      const p1 = await postarLogin(url, { u: 'u', s: sentinela() }, errado);
      const p2 = await postarLogin(url, { u: 'u', s: sentinela() }, '');
      expect(p1.status).toBe(403);
      expect(p2.status).toBe(403);
      expect(sim.requisicoes('/login')).toHaveLength(0);
      // Tentativas erradas não consomem o token legítimo.
      expect((await requisitar(url)).status).toBe(200);
    });

    it('caminho desconhecido → 404; método estranho não chama o SoftDesk', async () => {
      const url = await abrir();
      expect((await requisitar(`${baseDe(url)}/qualquer`)).status).toBe(404);
      expect((await requisitar(`${baseDe(url)}/entrar`, { metodo: 'GET' })).status).toBe(404);
      expect(sim.requisicoes('/login')).toHaveLength(0);
    });

    it('token reusado: com o login em andamento, GET e novo POST com o mesmo token → 403; ao terminar a janela fecha', async () => {
      let liberar!: (s: SessaoHttp) => void;
      const espera = new Promise<SessaoHttp>((resolve) => {
        liberar = resolve;
      });
      let chamadas = 0;
      const gatewayLento: ISoftdeskGateway = {
        conferirPaginaLogin: async () => undefined,
        autenticar: () => {
          chamadas += 1;
          return espera;
        },
        pesquisar: async () => ({ lista: [], total: 0 }),
      };
      amb = montarAmbiente(sim, {}, { gateway: gatewayLento });
      const url = await abrir();
      const primeiro = postarLogin(url, { u: 'usu', s: sentinela() });
      // espera o gateway ser chamado
      for (let i = 0; i < 100 && chamadas === 0; i++) await new Promise((r) => setTimeout(r, 5));
      expect(chamadas).toBe(1);
      expect(amb.c.sessaoStore.estado()).toBe('AUTENTICANDO');

      expect((await requisitar(url)).status).toBe(403);
      expect((await postarLogin(url, { u: 'usu', s: sentinela() })).status).toBe(403);
      expect(chamadas).toBe(1);

      liberar({ cookies: new Map([['k', 'v']]), criadaEm: new Date() });
      const r1 = await primeiro;
      expect(r1.status).toBe(200);
      expect(r1.corpo).toContain('Pronto');
      expect(await janelaFechada(url)).toBe(true);
      expect(amb.c.sessaoStore.estado()).toBe('AUTENTICADA');
    });

    it('token vencido (relógio de teste): GET e POST → 403 e a janela fecha; estado volta a SEM_SESSAO', async () => {
      const url = await abrir();
      expect((await requisitar(url)).status).toBe(200);
      amb.relogio.avancar(5 * 60 * 1000 - 1);
      expect((await requisitar(url)).status).toBe(200); // ainda dentro dos 5 min
      amb.relogio.avancar(1);
      const r = await requisitar(url);
      expect(r.status).toBe(403);
      expect(amb.c.janelaLogin.info()).toBeNull();
      expect(amb.c.sessaoStore.estado()).toBe('SEM_SESSAO');
      expect(await amb.c.janelaLogin.aguardarResultado(50)).toBe('TEMPO');
      expect(await janelaFechada(url)).toBe(true);
      expect(sim.requisicoes('/login')).toHaveLength(0);
    });

    it('token vencido também recusa o POST (sem chamar o SoftDesk)', async () => {
      const url = await abrir();
      amb.relogio.avancar(5 * 60 * 1000);
      const r = await postarLogin(url, { u: 'u', s: sentinela() });
      expect(r.status).toBe(403);
      expect(sim.requisicoes('/login')).toHaveLength(0);
      expect(amb.c.sessaoStore.estado()).toBe('SEM_SESSAO');
    });

    it('o temporizador de 5 min fecha o servidor mesmo sem nenhuma requisição', async () => {
      const url = await abrir();
      expect(amb.agendador.quantidade).toBe(1);
      amb.agendador.disparar();
      expect(amb.c.janelaLogin.info()).toBeNull();
      expect(amb.c.sessaoStore.estado()).toBe('SEM_SESSAO');
      expect(await janelaFechada(url)).toBe(true);
    });

    it('corpo acima de 4 KB → 413, sem chamar o SoftDesk e sem consumir o token', async () => {
      const url = await abrir();
      const grande = new URLSearchParams({ t: tokenDe(url), u: 'u', s: 'x'.repeat(5000), p: 'A' }).toString();
      const r = await requisitar(`${baseDe(url)}/entrar`, { metodo: 'POST', corpo: grande });
      expect(r.status).toBe(413);
      expect(sim.requisicoes('/login')).toHaveLength(0);
      expect((await requisitar(url)).status).toBe(200);
    });

    it('corpo em pedaços acima de 4 KB (sem Content-Length) → 413', async () => {
      const url = await abrir();
      const grande = new URLSearchParams({ t: tokenDe(url), u: 'u', s: 'x'.repeat(5000) }).toString();
      const r = await requisitar(`${baseDe(url)}/entrar`, {
        metodo: 'POST',
        corpo: grande,
        headers: { 'Transfer-Encoding': 'chunked' },
      }).catch((e: NodeJS.ErrnoException) => ({ status: e.code === 'ECONNRESET' ? 413 : 0 }));
      expect(r.status).toBe(413);
      expect(sim.requisicoes('/login')).toHaveLength(0);
    });
  });

  describe('cabeçalhos e CSP (ARCH §6 F1)', () => {
    it('GET devolve os cabeçalhos exigidos e a CSP exata com o nonce da própria página', async () => {
      const url = await abrir();
      const r = await requisitar(url);
      expect(r.status).toBe(200);
      expect(r.headers['cache-control']).toBe('no-store');
      expect(r.headers['referrer-policy']).toBe('no-referrer');
      expect(r.headers['x-frame-options']).toBe('DENY');
      const csp = r.headers['content-security-policy'] as string;
      const nonce = /script-src 'nonce-([^']+)'/.exec(csp)?.[1] as string;
      expect(nonce.length).toBeGreaterThanOrEqual(16);
      expect(csp).toBe(montarCsp(nonce));
      expect(csp).toBe(
        `default-src 'none'; style-src 'unsafe-inline'; img-src data:; script-src 'nonce-${nonce}'; form-action 'self'; frame-ancestors 'none'`,
      );
      expect(r.corpo).toContain(`<script nonce="${nonce}">`);
      expect(r.corpo.match(/<script/g)).toHaveLength(1);
    });

    it('o nonce muda a cada resposta', async () => {
      const url = await abrir();
      const n = async (): Promise<string> => {
        const r = await requisitar(url);
        return /'nonce-([^']+)'/.exec(r.headers['content-security-policy'] as string)?.[1] as string;
      };
      const a = await n();
      const b = await n();
      expect(a).not.toBe(b);
    });

    it('as recusas também levam os cabeçalhos de proteção', async () => {
      const url = await abrir();
      const r = await requisitar(url, { host: 'evil.example' });
      expect(r.status).toBe(403);
      expect(r.headers['cache-control']).toBe('no-store');
      expect(r.headers['x-frame-options']).toBe('DENY');
      expect(r.headers['content-security-policy']).toContain("default-src 'none'");
    });

    it('o formulário traz o perfil padrão da configuração e o token como campo oculto', async () => {
      const url = await abrir();
      const r = await requisitar(url);
      expect(r.corpo).toContain(`name="t" value="${tokenDe(url)}"`);
      expect(r.corpo).toContain('<option value="A" selected>');
    });
  });

  describe('reaproveitamento (RN-14)', () => {
    it('abrir várias vezes, inclusive juntas, abre uma só janela e um só navegador', async () => {
      const [a, b, c] = await Promise.all([
        amb.c.janelaLogin.abrirOuReaproveitar(),
        amb.c.janelaLogin.abrirOuReaproveitar(),
        amb.c.janelaLogin.abrirOuReaproveitar(),
      ]);
      const d = await amb.c.janelaLogin.abrirOuReaproveitar();
      expect(amb.abridor.urls).toHaveLength(1);
      expect(a.expiraEm.getTime()).toBe(b.expiraEm.getTime());
      expect(c.expiraEm.getTime()).toBe(d.expiraEm.getTime());
      expect(a.navegadorAberto).toBe(true);
    });

    it('info() não expõe porta, token nem endereço; enderecoManual() devolve o mesmo endereço do navegador', async () => {
      const url = await abrir();
      const info = amb.c.janelaLogin.info();
      expect(info).not.toBeNull();
      const texto = JSON.stringify(info);
      expect(texto).not.toContain(tokenDe(url));
      expect(texto).not.toContain(new URL(url).port);
      expect(Object.keys(info as object).sort()).toEqual(['aberta', 'expiraEm', 'navegadorAberto']);
      expect(amb.c.janelaLogin.enderecoManual()).toBe(url);
    });

    it('com navegador que não abriu, a janela existe e informa navegadorAberto false', async () => {
      amb = montarAmbiente(sim, {}, { abridorNavegador: { abrir: async () => false } });
      const info = await amb.c.janelaLogin.abrirOuReaproveitar();
      expect(info.aberta).toBe(true);
      expect(info.navegadorAberto).toBe(false);
      expect(amb.c.janelaLogin.enderecoManual()).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/\?t=[0-9a-f]{48}$/);
    });

    it('RN-10: o servidor da janela escuta só em 127.0.0.1 (endereço real do socket; nenhuma outra interface IPv4 conecta)', async () => {
      const u = await abrir();
      const escuta = (amb.c.janelaLogin as JanelaLoginServer).escutaEm();
      expect(escuta).not.toBeNull();
      expect(escuta?.address).toBe('127.0.0.1');
      expect(String(escuta?.port)).toBe(new URL(u).port);
      const externos = Object.values(os.networkInterfaces())
        .flat()
        .filter((i): i is NonNullable<typeof i> => !!i && i.family === 'IPv4' && !i.internal);
      for (const i of externos) {
        const abriu = await new Promise<boolean>((resolve) => {
          const sock = net.connect({ host: i.address, port: Number(new URL(u).port) });
          sock.once('connect', () => {
            sock.destroy();
            resolve(true);
          });
          sock.once('error', () => resolve(false));
        });
        expect(abriu).toBe(false);
      }
    });

    it('o token tem 24 bytes (48 hex) e muda a cada janela', async () => {
      const u1 = await abrir();
      expect(tokenDe(u1)).toMatch(/^[0-9a-f]{48}$/);
      expect(new URL(u1).hostname).toBe('127.0.0.1');
      amb.c.janelaLogin.fechar();
      expect(await janelaFechada(u1)).toBe(true);
      const u2 = await abrir();
      expect(tokenDe(u2)).not.toBe(tokenDe(u1));
      expect(amb.abridor.urls).toHaveLength(2);
    });

    it('fechar() encerra a janela, quem espera recebe TEMPO e o estado volta a SEM_SESSAO', async () => {
      const url = await abrir();
      const espera = amb.c.janelaLogin.aguardarResultado(5000);
      amb.c.janelaLogin.fechar();
      expect(await espera).toBe('TEMPO');
      expect(amb.c.janelaLogin.info()).toBeNull();
      expect(amb.c.sessaoStore.estado()).toBe('SEM_SESSAO');
      expect(await janelaFechada(url)).toBe(true);
    });
  });

  describe('vencimento da janela com login em andamento (achado A-2)', () => {
    function gatewayControlado(): {
      gateway: ISoftdeskGateway;
      liberar: (s: SessaoHttp) => void;
      chamadas: () => number;
      sinal: () => AbortSignal | undefined;
    } {
      let sinalRecebido: AbortSignal | undefined;
      let liberar!: (s: SessaoHttp) => void;
      const espera = new Promise<SessaoHttp>((resolve) => {
        liberar = resolve;
      });
      let n = 0;
      const gateway: ISoftdeskGateway = {
        conferirPaginaLogin: async () => undefined,
        autenticar: (_u, _s, _p, sinal) => {
          n += 1;
          sinalRecebido = sinal;
          return espera;
        },
        pesquisar: async () => ({ lista: [], total: 0 }),
      };
      return { gateway, liberar, chamadas: () => n, sinal: () => sinalRecebido };
    }
    const esperarChamada = async (n: () => number): Promise<void> => {
      for (let i = 0; i < 200 && n() === 0; i++) await new Promise((r) => setTimeout(r, 5));
    };

    it('aos 5 min o login já enviado NÃO é derrubado: termina, a página é Pronto e a sessão fica autenticada', async () => {
      const g = gatewayControlado();
      amb = montarAmbiente(sim, {}, { gateway: g.gateway });
      const url = await abrir();
      const envio = postarLogin(url, { u: 'usu', s: sentinela() });
      await esperarChamada(g.chamadas);
      expect(amb.c.sessaoStore.estado()).toBe('AUTENTICANDO');

      amb.relogio.avancar(5 * 60 * 1000 + 1000);
      amb.agendador.disparar(); // vencimento dos 5 min
      // Uma requisição qualquer depois do prazo não derruba o login em andamento (só recusa o token usado).
      expect((await requisitar(url)).status).toBe(403);
      expect(amb.c.sessaoStore.estado()).toBe('AUTENTICANDO');
      // Quem consulta durante o login não volta o estado para AGUARDANDO_LOGIN (achado A-8).
      await amb.c.janelaLogin.abrirOuReaproveitar();
      expect(amb.c.sessaoStore.estado()).toBe('AUTENTICANDO');

      g.liberar({ cookies: new Map([['k', 'v']]), criadaEm: new Date() });
      const r = await envio;
      expect(r.status).toBe(200);
      expect(r.corpo).toContain('Pronto');
      expect(amb.c.sessaoStore.estado()).toBe('AUTENTICADA');
      expect(await janelaFechada(url)).toBe(true);
    });

    it('se o login nunca concluir, a folga encerra a janela (sem ficar pendurada)', async () => {
      const g = gatewayControlado();
      amb = montarAmbiente(sim, {}, { gateway: g.gateway });
      const url = await abrir();
      const envio = postarLogin(url, { u: 'usu', s: sentinela() }).catch(() => null);
      await esperarChamada(g.chamadas);
      amb.agendador.disparar();
      expect(amb.agendador.quantidade).toBe(1); // folga armada
      amb.agendador.disparar();
      expect(amb.c.janelaLogin.info()).toBeNull();
      expect(await janelaFechada(url)).toBe(true);
      await envio;
    });

    it('achado 1 da REVIEW-002: a janela passa um AbortSignal ao login e o aciona quando fecha (a senha não segue)', async () => {
      const g = gatewayControlado();
      amb = montarAmbiente(sim, {}, { gateway: g.gateway });
      const url = await abrir();
      const envio = postarLogin(url, { u: 'usu', s: sentinela() }).catch(() => null);
      await esperarChamada(g.chamadas);
      const sinal = g.sinal();
      expect(sinal instanceof AbortSignal).toBe(true);
      expect(sinal?.aborted).toBe(false);
      amb.c.janelaLogin.fechar();
      expect(sinal?.aborted).toBe(true);
      await envio;
    });

    it('achado 1 da REVIEW-002: a folga do login em andamento deriva do timeout do gateway (3 x timeout + 10 s), não fixa em 30 s', async () => {
      expect(gracaLoginDoTimeout(20_000)).toBe(70_000);
      const g = gatewayControlado();
      amb = montarAmbiente(sim, {}, { gateway: g.gateway }); // timeoutSoftdeskMs de teste: 5000
      const url = await abrir();
      const envio = postarLogin(url, { u: 'usu', s: sentinela() }).catch(() => null);
      await esperarChamada(g.chamadas);
      amb.agendador.disparar(); // vencimento dos 5 min: arma a folga
      expect(amb.agendador.prazos[amb.agendador.prazos.length - 1]).toBe(3 * 5000 + 10_000);
      amb.agendador.disparar();
      await envio;
    });

    it('vencimento durante a leitura do corpo: a conexão cai (ou 410) e a senha NÃO é enviada ao SoftDesk', async () => {
      const g = gatewayControlado();
      amb = montarAmbiente(sim, {}, { gateway: g.gateway });
      const url = await abrir();
      const corpo = formulario(tokenDe(url), { u: 'usu', s: sentinela() });
      const u = new URL(url);
      const resposta = await new Promise<number | string>((resolve) => {
        const req = http.request(
          {
            host: u.hostname,
            port: u.port,
            path: '/entrar',
            method: 'POST',
            agent: false,
            headers: { Host: u.host, 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': String(Buffer.byteLength(corpo)) },
          },
          (res) => {
            res.resume();
            res.on('end', () => resolve(res.statusCode ?? 0));
          },
        );
        req.on('error', (e) => resolve((e as NodeJS.ErrnoException).code ?? 'erro'));
        req.write(corpo.slice(0, 10));
        setTimeout(() => {
          amb.agendador.disparar(); // a janela vence com o corpo pela metade
          req.end(corpo.slice(10));
        }, 50);
      });
      expect([410, 'ECONNRESET', 'EPIPE']).toContain(resposta);
      expect(g.chamadas()).toBe(0);
      expect(amb.c.sessaoStore.estado()).toBe('SEM_SESSAO');
    });
  });

  describe('login pela janela', () => {
    it('sucesso: página "Pronto", sessão autenticada, janela encerrada e um único POST /login', async () => {
      const usuario = sentinela('USU');
      const senha = sentinela('SENHA');
      sim.credenciais = { usuario, senha };
      const url = await abrir();
      const espera = amb.c.janelaLogin.aguardarResultado(5000);
      const r = await postarLogin(url, { u: usuario, s: senha, p: 'T' });
      expect(r.status).toBe(200);
      expect(r.corpo).toContain('Pronto');
      expect(r.corpo).not.toContain('<form');
      const res = await espera;
      expect(res).not.toBe('TEMPO');
      expect((res as { ok: boolean }).ok).toBe(true);
      expect(amb.c.sessaoStore.estado()).toBe('AUTENTICADA');
      expect(amb.c.sessaoStore.resumo()).toMatchObject({ usuario, perfil: 'T' });
      expect(sim.logins).toHaveLength(1);
      expect(sim.logins[0]).toMatchObject({ usuario, perfil: 'T', xsrfOk: true });
      expect(amb.c.janelaLogin.info()).toBeNull();
      expect(await janelaFechada(url)).toBe(true);
    });

    it('formulário incompleto: mostra o formulário de novo, sem consumir o token nem chamar o SoftDesk', async () => {
      const url = await abrir();
      const r = await postarLogin(url, { u: '', s: '' });
      expect(r.status).toBe(200);
      expect(r.corpo).toContain('<form');
      expect(sim.requisicoes('/login', 'POST')).toHaveLength(0);
      expect(amb.c.sessaoStore.estado()).toBe('AGUARDANDO_LOGIN');
      const bom = await postarLogin(url, { u: 'x', s: sentinela() });
      expect(bom.corpo).toContain('Pronto');
    });

    it('perfil inválido no corpo é tratado como formulário incompleto', async () => {
      const url = await abrir();
      const r = await postarLogin(url, { u: 'x', s: sentinela(), p: 'Z' });
      expect(r.corpo).toContain('<form');
      expect(sim.requisicoes('/login', 'POST')).toHaveLength(0);
    });

    it.each([
      ['status_falso', 'CREDENCIAL', 'Usuário ou senha incorretos.'],
      ['500', 'REDE', 'Não consegui falar com o SoftDesk.'],
      ['html', 'LAYOUT_LOGIN_MUDOU', 'O SoftDesk mudou a tela de login.'],
    ] as const)('falha %s → página só com o estado %s, sem repetir usuário nem texto do SoftDesk', async (cenario, codigo, titulo) => {
      sim.login = cenario;
      const usuario = sentinela('USU');
      const senha = sentinela('SENHA');
      const url = await abrir();
      const espera = amb.c.janelaLogin.aguardarResultado(5000);
      const r = await postarLogin(url, { u: usuario, s: senha });
      expect(r.status).toBe(200);
      expect(r.corpo).toContain(titulo);
      expect(r.corpo).not.toContain('<form');
      expect(r.corpo).not.toContain(usuario);
      expect(r.corpo).not.toContain(senha);
      expect(r.corpo).not.toContain('Credenciais inválidas'); // texto do SoftDesk
      const res = await espera;
      expect(res).toMatchObject({ ok: false });
      const erro = (res as { erro: ErroSoftdesk }).erro;
      expect(erro.codigo).toBe(codigo);
      expect(`${erro.mensagem} ${erro.acao}`).not.toContain(usuario);
      expect(amb.c.sessaoStore.estado()).toBe('SEM_SESSAO');
      expect(amb.c.sessaoStore.obter()).toBeNull();
      expect(await janelaFechada(url)).toBe(true);
    });

    it('depois de falhar, um novo "abrir" gera outra janela, com outro token', async () => {
      sim.login = 'status_falso';
      const u1 = await abrir();
      await postarLogin(u1, { u: 'x', s: sentinela() });
      expect(await janelaFechada(u1)).toBe(true);
      sim.login = 'ok';
      const u2 = await abrir();
      expect(u2).not.toBe(u1);
      expect(amb.abridor.urls).toHaveLength(2);
      expect((await requisitar(u2)).status).toBe(200);
    });

    it('a senha nunca aparece em log, resposta, estado, resumo ou erro (RN-13)', async () => {
      const usuario = sentinela('USU');
      const senha = sentinela('SENHA');
      const saidas: string[] = [];

      // 1) login recusado
      sim.credenciais = { usuario, senha: 'outra-senha' };
      const u1 = await abrir();
      const espera1 = amb.c.janelaLogin.aguardarResultado(5000);
      const r1 = await postarLogin(u1, { u: usuario, s: senha });
      saidas.push(r1.corpo, JSON.stringify(r1.headers));
      const res1 = (await espera1) as { erro: ErroSoftdesk };
      saidas.push(descreverErro(res1.erro), JSON.stringify(amb.c.estadoSessao.executar()));

      // 2) login aceito
      sim.credenciais = { usuario, senha };
      const u2 = await abrir();
      const r2 = await postarLogin(u2, { u: usuario, s: senha });
      saidas.push(r2.corpo, JSON.stringify(r2.headers));
      saidas.push(JSON.stringify(amb.c.estadoSessao.executar()), JSON.stringify(amb.c.sessaoStore.resumo()));
      saidas.push(JSON.stringify([...(amb.c.sessaoStore.obter()?.cookies ?? new Map())]));

      const tudo = saidas.join('\n');
      expect(tudo).not.toContain(senha);
      expect(amb.logger.texto()).not.toContain(senha);
      // O usuário também não vai para log (§8.3).
      expect(amb.logger.texto()).not.toContain(usuario);
      // Token e endereço da janela também não.
      expect(amb.logger.texto()).not.toContain(tokenDe(u1));
      expect(amb.logger.texto()).not.toContain(tokenDe(u2));
      expect(amb.logger.texto()).not.toMatch(/127\.0\.0\.1:\d+/);
      expect(amb.logger.registros.length).toBeGreaterThan(0);
    });
  });
});
