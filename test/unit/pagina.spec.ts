import fs from 'node:fs';
import path from 'node:path';
import {
  esc,
  estadoPaginaDoErro,
  montarCsp,
  renderizarPagina,
  type EstadoPagina,
} from '../../src/infraestructure/login/pagina';
import { LOGO_CLAMED_BASE64 } from '../../src/infraestructure/login/logo-clamed';

const ESTADOS: EstadoPagina[] = ['ENTRADA', 'CREDENCIAL', 'REDE', 'LAYOUT_LOGIN_MUDOU', 'PRONTO'];
const NONCE = 'bm9uY2UtZGUtdGVzdGU=';
const pagina = (estado: EstadoPagina, extra: { token?: string; perfilPadrao?: 'A' | 'U' | 'T' } = {}): string =>
  renderizarPagina({ estado, nonce: NONCE, token: 'a'.repeat(48), ...extra });

describe('VAL-34: página da janela de login sem recurso externo', () => {
  it.each(ESTADOS)('%s: nenhuma URL, fonte, folha de estilo ou script externo', (estado) => {
    const html = pagina(estado);
    expect(html).not.toMatch(/https?:\/\//i);
    expect(html).not.toMatch(/(^|[\s"'(=])\/\/[a-z0-9]/i); // URL sem protocolo
    expect(html).not.toMatch(/<link\b/i);
    expect(html).not.toMatch(/@import/i);
    expect(html).not.toMatch(/@font-face/i);
    expect(html).not.toMatch(/<iframe|<object|<embed|<base\b/i);
    expect(html).not.toMatch(/<script[^>]*\ssrc=/i);
    expect(html).not.toMatch(/\son[a-z]+\s*=/i); // sem manipulador inline (o CSP o bloquearia)
    // Todo `src=` e todo `url(` aponta para `data:`.
    for (const m of html.matchAll(/\ssrc="([^"]*)"/g)) expect(m[1].startsWith('data:image/png;base64,')).toBe(true);
    for (const m of html.matchAll(/url\(\s*["']?([^"')]*)/g)) expect(m[1].startsWith('data:')).toBe(true);
    expect(html).not.toMatch(/\shref=/i);
  });

  it.each(ESTADOS)('%s: imagem embutida (logo da Clamed em data URI)', (estado) => {
    const html = pagina(estado);
    expect(html).toContain(`<img src="data:image/png;base64,${LOGO_CLAMED_BASE64}"`);
    expect(html).toMatch(/alt="Clamed Farmácias"/);
  });

  it('o logo embutido é idêntico ao arquivo assets/logo-clamed.png (186 x 60)', () => {
    const arquivo = fs.readFileSync(
      path.join(__dirname, '..', '..', 'src', 'infraestructure', 'login', 'assets', 'logo-clamed.png'),
    );
    expect(arquivo.toString('base64')).toBe(LOGO_CLAMED_BASE64);
    expect(arquivo.readUInt32BE(16)).toBe(186);
    expect(arquivo.readUInt32BE(20)).toBe(60);
  });

  it('só o estado de entrada tem script, e ele leva o nonce da resposta', () => {
    const html = pagina('ENTRADA');
    const scripts = [...html.matchAll(/<script\b([^>]*)>/g)];
    expect(scripts).toHaveLength(1);
    expect(scripts[0][1].trim()).toBe(`nonce="${NONCE}"`);
    for (const e of ESTADOS.filter((x) => x !== 'ENTRADA')) expect(pagina(e)).not.toMatch(/<script/i);
  });

  it('o script não carrega nada nem mexe em rede: só alterna o tipo do campo de senha', () => {
    const js = /<script[^>]*>([\s\S]*?)<\/script>/.exec(pagina('ENTRADA'))?.[1] as string;
    expect(js).not.toMatch(/fetch|XMLHttpRequest|WebSocket|import\(|eval|document\.write|location|src\s*=/);
    expect(js).toContain("i.type=i.type==='password'?'text':'password'");
  });

  it('script-src do CSP só aceita o nonce (sem unsafe-inline, unsafe-eval, *, https:)', () => {
    const csp = montarCsp(NONCE);
    const script = /script-src ([^;]+)/.exec(csp)?.[1] as string;
    expect(script).toBe(`'nonce-${NONCE}'`);
    expect(csp).not.toMatch(/unsafe-eval|\*|https?:/);
    expect(csp).toBe(
      `default-src 'none'; style-src 'unsafe-inline'; img-src data:; script-src 'nonce-${NONCE}'; form-action 'self'; frame-ancestors 'none'`,
    );
  });
});

describe('os 5 estados da página (ARCH §19, protótipo aprovado)', () => {
  it('ENTRADA: cartão com logo, título, campos Usuário, Senha (com mostrar), Perfil, botão Entrar e a nota', () => {
    const html = pagina('ENTRADA');
    expect(html).toContain('<h1>SoftDesk Local</h1>');
    expect(html).toContain('Consulta de chamados');
    expect(html).toContain('Informe seu usuário e sua senha do SoftDesk.');
    expect(html).toContain('<label for="usuario">Usuário</label>');
    expect(html).toContain('<label for="senha">Senha</label>');
    expect(html).toContain('<label for="perfil">Perfil</label>');
    expect(html).toContain('aria-label="Mostrar senha"');
    expect(html).toContain('type="password"');
    expect(html).toContain('<button class="entrar" type="submit">Entrar</button>');
    expect(html).toContain('<form method="post" action="/entrar"');
    expect(html).toContain('Esta janela só existe no seu computador. A senha vai direto ao SoftDesk e não passa pelo chat.');
    expect(html).toContain('Atendente');
    expect(html).toContain('Solicitante');
    expect(html).toContain('Técnico');
    expect(html).toContain('max-width:420px');
    expect(html).not.toMatch(/role="alert"/);
  });

  it('sem animação em nenhum estado (nenhum @keyframes, animation ou transition)', () => {
    for (const e of ESTADOS) expect(pagina(e)).not.toMatch(/@keyframes|animation|transition/i);
  });

  it('usa as cores e a pilha de fontes do protótipo (verde #15803d, fundo #0a2a1d)', () => {
    const html = pagina('ENTRADA');
    expect(html).toContain('--verde:#15803d');
    expect(html).toContain('--fundo:#0a2a1d');
    expect(html).toContain("'Roboto','Segoe UI',system-ui");
  });

  it('CREDENCIAL: mensagem fixa em erro vermelho, sem formulário', () => {
    const html = pagina('CREDENCIAL');
    expect(html).toContain('<p class="msg erro" role="alert"><strong>Usuário ou senha incorretos.</strong>');
    expect(html).toContain('Confira os dados e peça ao Claude para entrar de novo.');
    expect(html).not.toContain('<form');
  });

  it('REDE: mensagem fixa em erro vermelho', () => {
    const html = pagina('REDE');
    expect(html).toContain('<p class="msg erro" role="alert"><strong>Não consegui falar com o SoftDesk.</strong>');
    expect(html).toContain('Veja se a rede ou a VPN da Clamed está ativa e tente de novo.');
    expect(html).not.toContain('<form');
  });

  it('LAYOUT_LOGIN_MUDOU: aviso âmbar dizendo que não é a senha', () => {
    const html = pagina('LAYOUT_LOGIN_MUDOU');
    expect(html).toContain('<p class="msg aviso" role="alert"><strong>O SoftDesk mudou a tela de login.</strong>');
    expect(html).toContain('não é a sua senha');
    expect(html).not.toContain('<form');
  });

  it('PRONTO: confirmação de login aceito, sem formulário', () => {
    const html = pagina('PRONTO');
    expect(html).toContain('<h2>Pronto</h2>');
    expect(html).toContain('Você já pode voltar ao Claude e fechar esta janela.');
    expect(html).toContain('role="status"');
    expect(html).not.toContain('<form');
  });

  it('só a entrada leva o token (campo oculto); os demais estados não o repetem', () => {
    const token = 'b'.repeat(48);
    expect(pagina('ENTRADA', { token })).toContain(`<input type="hidden" name="t" value="${token}">`);
    for (const e of ESTADOS.filter((x) => x !== 'ENTRADA')) expect(pagina(e, { token })).not.toContain(token);
  });

  it('perfil padrão da configuração vem selecionado', () => {
    expect(pagina('ENTRADA', { perfilPadrao: 'T' })).toContain('<option value="T" selected>');
    expect(pagina('ENTRADA', { perfilPadrao: 'T' })).not.toContain('<option value="A" selected>');
    expect(pagina('ENTRADA')).toContain('<option value="A" selected>');
  });

  it('texto dinâmico é escapado (token e nonce)', () => {
    const html = renderizarPagina({ estado: 'ENTRADA', nonce: 'n"><img src=x>', token: '"><script>alert(1)</script>' });
    expect(html).not.toContain('"><script>alert(1)');
    expect(html).not.toContain('<img src=x>');
    expect(html).toContain('&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(esc(`<a href="x" onclick='y'>&`)).toBe('&lt;a href=&quot;x&quot; onclick=&#39;y&#39;&gt;&amp;');
  });

  it('estadoPaginaDoErro: CREDENCIAL, LAYOUT_LOGIN_MUDOU e o resto cai em REDE', () => {
    expect(estadoPaginaDoErro('CREDENCIAL')).toBe('CREDENCIAL');
    expect(estadoPaginaDoErro('LAYOUT_LOGIN_MUDOU')).toBe('LAYOUT_LOGIN_MUDOU');
    expect(estadoPaginaDoErro('REDE')).toBe('REDE');
    expect(estadoPaginaDoErro('ERRO_INTERNO')).toBe('REDE');
  });
});
