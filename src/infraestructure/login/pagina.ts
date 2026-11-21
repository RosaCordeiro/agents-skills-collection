import type { PerfilLogin } from '../../core/domain/entities/sessao';
import type { CodigoErro } from '../../core/domain/errors/erro-softdesk';
import { LOGO_CLAMED_BASE64 } from './logo-clamed';

/**
 * Página da janela de login (ARCH-001 §19, RNF-09). Segue o protótipo aprovado
 * `docs/prototipos/MOCK-login-softdesk-local.html`: fundo verde escuro estático com trama,
 * cartão branco de 420 px, logo da Clamed, campos Usuário, Senha (com botão de mostrar) e Perfil.
 *
 * Tudo embutido: CSS inline, logo e trama como `data:`, sem fonte, imagem ou script externos.
 * O único script é o do botão de mostrar a senha e só roda com o `nonce` da resposta.
 * Nenhum texto dinâmico entra sem escape.
 */

export type EstadoPagina = 'ENTRADA' | 'CREDENCIAL' | 'REDE' | 'LAYOUT_LOGIN_MUDOU' | 'PRONTO';

export interface DadosPagina {
  estado: EstadoPagina;
  /** Valor do `nonce` do CSP desta resposta. */
  nonce: string;
  /** Token da janela (campo oculto do formulário; só no estado `ENTRADA`). */
  token?: string;
  /** Perfil pré-selecionado (padrão da configuração). */
  perfilPadrao?: PerfilLogin;
}

/** CSP exata de ARCH-001 §6 F1, com o nonce da resposta. */
export function montarCsp(nonce: string): string {
  return (
    `default-src 'none'; style-src 'unsafe-inline'; img-src data:; ` +
    `script-src 'nonce-${nonce}'; form-action 'self'; frame-ancestors 'none'`
  );
}

/** Estado fixo da página para o código de erro do login (qualquer outro código cai em `REDE`). */
export function estadoPaginaDoErro(codigo: CodigoErro): Exclude<EstadoPagina, 'ENTRADA' | 'PRONTO'> {
  if (codigo === 'CREDENCIAL') return 'CREDENCIAL';
  if (codigo === 'LAYOUT_LOGIN_MUDOU') return 'LAYOUT_LOGIN_MUDOU';
  return 'REDE';
}

export function esc(valor: string): string {
  return valor
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const MENSAGENS: Record<
  Exclude<EstadoPagina, 'ENTRADA' | 'PRONTO'>,
  { classe: 'erro' | 'aviso'; titulo: string; texto: string }
> = {
  CREDENCIAL: {
    classe: 'erro',
    titulo: 'Usuário ou senha incorretos.',
    texto: 'Confira os dados e peça ao Claude para entrar de novo.',
  },
  REDE: {
    classe: 'erro',
    titulo: 'Não consegui falar com o SoftDesk.',
    texto: 'Veja se a rede ou a VPN da Clamed está ativa e tente de novo.',
  },
  LAYOUT_LOGIN_MUDOU: {
    classe: 'aviso',
    titulo: 'O SoftDesk mudou a tela de login.',
    texto: 'O serviço precisa de ajuste. Avise o time responsável; não é a sua senha.',
  },
};

// A trama do protótipo é um SVG em `data:`; vai em base64 para a página não conter nenhuma URL
// (o `xmlns` do SVG seria uma URL externa aos olhos do teste VAL-34).
const TRAMA_SVG =
  "<svg xmlns='http://www.w3.org/2000/svg' width='60' height='104' viewBox='0 0 60 104'><g fill='none' " +
  "stroke='#a7c9b5' stroke-opacity='.35' stroke-width='1'><path d='M30 0 L60 17.3 L60 52 L30 69.3 L0 52 L0 17.3 Z'/>" +
  "<path d='M30 34.7 L60 52 M30 34.7 L0 52 M30 34.7 L30 69.3'/>" +
  "<path d='M30 69.3 L30 104 M0 52 L0 86.7 L30 104 M60 52 L60 86.7 L30 104'/></g></svg>";
const TRAMA_B64 = Buffer.from(TRAMA_SVG, 'utf8').toString('base64');

const CSS = `
:root{
  --verde:#15803d; --verde-escuro:#166534; --verde-mais-escuro:#14532d;
  --texto:#1c2a23; --texto-suave:#4d5d54; --borda:#98a79e;
  --erro:#b42318; --erro-bg:#fdecea; --aviso:#8a5a00; --aviso-bg:#fff4dc; --ok-bg:#e8f5ec;
  --fundo:#0a2a1d;
}
*{box-sizing:border-box}
html,body{margin:0}
body{font-family:'Roboto','Segoe UI',system-ui,sans-serif;color:var(--texto);background:var(--fundo);min-height:100vh;min-height:100svh}
.tela{position:relative;min-height:100vh;min-height:100svh;padding:28px 24px 40px;overflow:hidden;display:flex;align-items:center;justify-content:center;
  background:radial-gradient(ellipse at 50% 10%,#14503a 0%,#0e3a29 45%,#0a2a1d 100%)}
.trama{position:absolute;inset:auto 0 0 0;height:40%;pointer-events:none;opacity:.5;background-image:url("data:image/svg+xml;base64,${TRAMA_B64}");
  -webkit-mask-image:linear-gradient(to top,#000 0%,transparent 100%);mask-image:linear-gradient(to top,#000 0%,transparent 100%)}
.cartao{position:relative;width:100%;max-width:420px;margin:0 auto;padding:36px 32px;background:#fff;border-radius:12px;
  box-shadow:0 20px 50px rgba(4,20,13,.45);display:flex;flex-direction:column;gap:18px}
.cab{display:flex;flex-direction:column;align-items:center;gap:10px;text-align:center;margin-bottom:4px}
.cab img{height:38px;width:auto}
.cab h1{margin:6px 0 0;font-size:26px;font-weight:700;letter-spacing:-.005em;line-height:1.1;color:var(--verde-escuro)}
.apoio{display:flex;align-items:center;gap:10px;margin:0;font-size:10px;letter-spacing:.42em;padding-left:.42em;text-transform:uppercase;color:var(--texto-suave)}
.apoio::before,.apoio::after{content:"";width:22px;height:1px;background:currentColor;opacity:.6}
.sub{margin:4px 0 0;font-size:15px;color:var(--texto-suave)}
.col{display:flex;flex-direction:column;gap:18px}
.campo{display:flex;flex-direction:column;gap:6px}
label{font-size:14px;font-weight:500}
input,select{width:100%;height:46px;padding:0 14px;font:inherit;font-size:15px;color:var(--texto);background:#fff;border:1px solid var(--borda);border-radius:8px}
input::placeholder{color:#66756c}
input:hover,select:hover{border-color:var(--verde)}
input:focus,select:focus{outline:none;border-color:var(--verde);box-shadow:0 0 0 3px rgba(21,128,61,.22)}
.senha{position:relative;display:flex;align-items:center}
.senha input{padding-right:48px}
.olho{position:absolute;right:4px;width:44px;height:44px;display:flex;align-items:center;justify-content:center;border:0;border-radius:8px;background:transparent;color:var(--texto-suave);cursor:pointer}
.olho:focus-visible{outline:3px solid rgba(21,128,61,.4)}
button.entrar{height:48px;width:100%;font:inherit;font-size:16px;font-weight:500;color:#fff;background:var(--verde);border:1px solid var(--verde);border-radius:8px;cursor:pointer}
button.entrar:hover{background:var(--verde-escuro);border-color:var(--verde-escuro)}
button.entrar:active{background:var(--verde-mais-escuro);border-color:var(--verde-mais-escuro)}
button.entrar:focus-visible{outline:3px solid rgba(21,128,61,.4);outline-offset:2px}
.nota{margin:0;padding:10px 12px;font-size:14px;line-height:1.4;background:#f1f5f2;border-radius:8px;text-align:center}
.msg{margin:0;padding:12px 14px;font-size:14px;line-height:1.45;border-radius:8px;border-left:4px solid}
.msg strong{display:block;margin-bottom:2px}
.msg.erro{background:var(--erro-bg);border-color:var(--erro);color:#7a1a12}
.msg.aviso{background:var(--aviso-bg);border-color:#d99a00;color:var(--aviso)}
.pronto{display:flex;flex-direction:column;align-items:center;gap:12px;text-align:center;padding:8px 0 12px}
.pronto .check{width:56px;height:56px;border-radius:50%;background:var(--ok-bg);color:var(--verde);display:flex;align-items:center;justify-content:center}
.pronto h2{margin:0;font-size:22px;color:var(--verde-escuro)}
.pronto p{margin:0;font-size:15px;color:var(--texto-suave)}
@media (max-width:480px){.cartao{padding:28px 18px}.tela{padding:20px 12px 32px}}
`;

const ICONE_OLHO =
  '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" ' +
  'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/>' +
  '<circle cx="12" cy="12" r="3"/></svg>';

const ICONE_OK =
  '<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" ' +
  'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';

const SCRIPT_OLHO =
  "(function(){var b=document.getElementById('ver-senha'),i=document.getElementById('senha');" +
  "if(!b||!i)return;b.addEventListener('click',function(){i.type=i.type==='password'?'text':'password';});})();";

function cabecalho(comSub: boolean): string {
  return `    <header class="cab">
      <img src="data:image/png;base64,${LOGO_CLAMED_BASE64}" alt="Clamed Farmácias">
      <h1>SoftDesk Local</h1>
      <p class="apoio">Consulta de chamados</p>${
        comSub ? '\n      <p class="sub">Informe seu usuário e sua senha do SoftDesk.</p>' : ''
      }
    </header>`;
}

function formulario(token: string, perfilPadrao: PerfilLogin): string {
  const opcao = (v: PerfilLogin, nome: string): string =>
    `<option value="${v}"${v === perfilPadrao ? ' selected' : ''}>${nome}</option>`;
  return `    <form method="post" action="/entrar" novalidate>
      <input type="hidden" name="t" value="${esc(token)}">
      <div class="col">
        <div class="campo">
          <label for="usuario">Usuário</label>
          <input id="usuario" name="u" autocomplete="username" placeholder="Digite seu usuário" autofocus>
        </div>
        <div class="campo">
          <label for="senha">Senha</label>
          <div class="senha">
            <input id="senha" name="s" type="password" autocomplete="current-password" placeholder="Digite sua senha">
            <button type="button" class="olho" id="ver-senha" aria-label="Mostrar senha">
              ${ICONE_OLHO}
            </button>
          </div>
        </div>
        <div class="campo">
          <label for="perfil">Perfil</label>
          <select id="perfil" name="p">${opcao('A', 'Atendente')}${opcao('U', 'Solicitante')}${opcao('T', 'Técnico')}</select>
        </div>
        <button class="entrar" type="submit">Entrar</button>
        <p class="nota">Esta janela só existe no seu computador. A senha vai direto ao SoftDesk e não passa pelo chat.</p>
      </div>
    </form>`;
}

/**
 * Monta a página do estado pedido. Nos estados de erro a janela já foi encerrada (ARCH-001 §6 F1,
 * passo 6), então a página mostra só a mensagem fixa, sem formulário que não teria para onde enviar.
 */
export function renderizarPagina(dados: DadosPagina): string {
  const { estado } = dados;
  let miolo: string;
  let script = '';
  if (estado === 'ENTRADA') {
    miolo = `${cabecalho(true)}\n${formulario(dados.token ?? '', dados.perfilPadrao ?? 'A')}`;
    script = `\n<script nonce="${esc(dados.nonce)}">${SCRIPT_OLHO}</script>`;
  } else if (estado === 'PRONTO') {
    miolo = `${cabecalho(false)}
    <div class="pronto" role="status">
      <div class="check">${ICONE_OK}</div>
      <h2>Pronto</h2>
      <p>Você já pode voltar ao Claude e fechar esta janela.</p>
    </div>`;
  } else {
    const m = MENSAGENS[estado];
    miolo = `${cabecalho(true)}
    <p class="msg ${m.classe}" role="alert"><strong>${esc(m.titulo)}</strong>${esc(m.texto)}</p>`;
  }
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>SoftDesk Local</title>
<style>${CSS}</style>
</head>
<body>
<main class="tela">
  <div class="trama" aria-hidden="true"></div>
  <section class="cartao">
${miolo}
  </section>
</main>${script}
</body>
</html>
`;
}
