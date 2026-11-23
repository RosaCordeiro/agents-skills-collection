import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { Humor } from '../types'

const PANE = 'lico'

const FUR = '#8a5a3b'
const FUR_DARK = '#5f3b25'
const CREAM = '#ecd3ad'
const NOSE = '#2a1a13'
const GOLD = '#f2c94c'

type Roupa = { nome: string; sleeve: string }
const ROUPAS: Record<string, Roupa> = {
  mago: { nome: 'Mago', sleeve: FUR },
  moletom: { nome: 'Dev', sleeve: '#0f5c4a' },
  cientista: { nome: 'Cientista', sleeve: '#f5f7fa' },
  heroi: { nome: 'Herói', sleeve: '#2447b5' },
  pijama: { nome: 'Pijama', sleeve: '#8fb4e8' },
}
const IDS = Object.keys(ROUPAS)

const HUMOR_TXT: Record<Humor, string> = {
  calmo: 'de boa, esperando',
  trabalhando: 'trabalhando...',
  feliz: 'terminei!',
  chamando: 'preciso de você',
}

// Mesmos valores que o contrato (types/index.d.ts): a tag muda se o formato mudar.
const roupaAtom = atom({ plugin: 'lico-mascote', key: 'roupa' } as const, 'mago', {
  shape: 'roupa-1',
})
const humorAtom = atom({ plugin: 'lico-mascote', key: 'humor' } as const, 'calmo', {
  shape: 'humor-1',
})

// ---------- SVG ----------

const estrela = (cx: number, cy: number, r: number, fill: string, twinkle = false): string => {
  const pts: string[] = []
  for (let i = 0; i < 10; i++) {
    const ang = (Math.PI / 5) * i - Math.PI / 2
    const raio = i % 2 === 0 ? r : r * 0.45
    pts.push(`${(cx + raio * Math.cos(ang)).toFixed(1)},${(cy + raio * Math.sin(ang)).toFixed(1)}`)
  }
  const anim = twinkle
    ? `<animate attributeName="opacity" values="1;0.25;1" dur="${(1.2 + (cx % 5) / 10).toFixed(1)}s" repeatCount="indefinite"/>`
    : ''
  return `<polygon points="${pts.join(' ')}" fill="${fill}">${anim}</polygon>`
}

const movimento = (
  tipo: string,
  valores: string,
  dur: number,
  begin = 0,
  extra = '',
): string =>
  `<animateTransform attributeName="transform" type="${tipo}" values="${valores}" dur="${dur}s" begin="${begin}s" repeatCount="indefinite" ${extra}/>`

function atrasDoCorpo(roupa: string): string {
  if (roupa === 'mago')
    return `<path d="M70 140 Q38 222 58 264 L182 264 Q202 222 170 140 Z" fill="#5b34a8"/>
      <path d="M84 150 Q64 222 76 262 L164 262 Q176 222 156 150 Z" fill="#7a52c9" opacity=".5"/>`
  if (roupa === 'heroi')
    return `<g>${movimento('rotate', '-2 120 142;2 120 142;-2 120 142', 2.4)}
      <path d="M72 142 Q34 232 50 270 L190 270 Q206 232 168 142 Z" fill="#d62839"/>
      <path d="M86 150 Q66 232 78 266 L162 266 Q174 232 154 150 Z" fill="#f05a6a" opacity=".45"/></g>`
  return ''
}

function roupaDoCorpo(roupa: string): string {
  switch (roupa) {
    case 'mago':
      return `<circle cx="120" cy="158" r="6" fill="${GOLD}"/>
        <g>${movimento('translate', '0 0;0 -6;0 0', 2.6)}
          <line x1="186" y1="150" x2="206" y2="112" stroke="#3b2a1a" stroke-width="4" stroke-linecap="round"/>
          ${estrela(208, 106, 11, GOLD, true)}
        </g>`
    case 'moletom':
      return `<ellipse cx="120" cy="192" rx="55" ry="63" fill="#0f5c4a"/>
        <path d="M92 206 L148 206 L156 238 L84 238 Z" fill="#0c4a3b"/>
        <ellipse cx="120" cy="158" rx="42" ry="15" fill="#0c4a3b"/>
        <path d="M110 164 L108 190" stroke="#b7e31c" stroke-width="3" stroke-linecap="round"/>
        <path d="M130 164 L132 190" stroke="#b7e31c" stroke-width="3" stroke-linecap="round"/>`
    case 'cientista':
      return `<ellipse cx="120" cy="192" rx="55" ry="63" fill="#f5f7fa"/>
        <path d="M102 152 L120 192 L138 152" stroke="#c4ccd4" stroke-width="3" fill="none" stroke-linejoin="round"/>
        <circle cx="120" cy="206" r="2.5" fill="#c4ccd4"/><circle cx="120" cy="224" r="2.5" fill="#c4ccd4"/>
        <rect x="134" y="206" width="18" height="22" rx="3" fill="none" stroke="#c4ccd4" stroke-width="2.5"/>
        <line x1="142" y1="200" x2="142" y2="212" stroke="#d62839" stroke-width="3" stroke-linecap="round"/>`
    case 'heroi':
      return `<ellipse cx="120" cy="192" rx="55" ry="63" fill="#2447b5"/>
        <circle cx="120" cy="192" r="18" fill="#f7c600" stroke="#b88a00" stroke-width="2.5"/>
        <path d="M113 182 L113 200 L129 200" stroke="#2447b5" stroke-width="5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`
    case 'pijama':
      return `<ellipse cx="120" cy="192" rx="55" ry="63" fill="#8fb4e8"/>
        ${estrela(98, 190, 6, '#ffffff')}${estrela(142, 212, 5, '#ffffff')}${estrela(116, 230, 4.5, '#ffffff')}${estrela(146, 176, 4, '#ffffff')}`
    default:
      return ''
  }
}

function roupaDaCabeca(roupa: string, humor: Humor): string {
  switch (roupa) {
    case 'mago':
      return `<ellipse cx="120" cy="72" rx="58" ry="11" fill="#4b2a8a"/>
        <path d="M84 70 Q112 30 134 -6 Q150 36 158 70 Z" fill="#5b34a8"/>
        <path d="M86 64 Q122 78 156 64 L158 72 Q122 86 84 72 Z" fill="${GOLD}"/>
        ${estrela(124, 36, 7, GOLD, true)}${estrela(140, 54, 4.5, GOLD, true)}${estrela(110, 52, 3.5, GOLD, true)}`
    case 'moletom':
      return `<path d="M70 104 Q70 40 120 40 Q170 40 170 104" stroke="#2b2f36" stroke-width="7" fill="none" stroke-linecap="round"/>
        <rect x="60" y="92" width="18" height="32" rx="8" fill="#b7e31c" stroke="#2b2f36" stroke-width="4"/>
        <rect x="162" y="92" width="18" height="32" rx="8" fill="#b7e31c" stroke="#2b2f36" stroke-width="4"/>`
    case 'cientista':
      return `<circle cx="100" cy="${humor === 'trabalhando' ? 105 : 100}" r="15" fill="#ffffff" fill-opacity=".28" stroke="#2b2f36" stroke-width="3.5"/>
        <circle cx="140" cy="${humor === 'trabalhando' ? 105 : 100}" r="15" fill="#ffffff" fill-opacity=".28" stroke="#2b2f36" stroke-width="3.5"/>
        <line x1="115" y1="100" x2="125" y2="100" stroke="#2b2f36" stroke-width="3.5"/>`
    case 'heroi':
      return `<path d="M78 92 Q100 80 120 90 Q140 80 162 92 L162 114 Q140 120 128 108 Q120 105 112 108 Q100 120 78 114 Z" fill="#2447b5"/>`
    case 'pijama':
      return `<path d="M78 80 Q98 34 148 28 Q188 26 194 68 Q162 52 152 76 Q122 88 78 80 Z" fill="#6e8fd6"/>
        <path d="M74 76 Q120 98 164 78 L160 68 Q120 88 78 66 Z" fill="#ffffff"/>
        <circle cx="194" cy="68" r="10" fill="#ffffff"/>`
    default:
      return ''
  }
}

function olhos(humor: Humor): string {
  if (humor === 'feliz')
    return `<path d="M92 103 Q100 92 108 103" stroke="${NOSE}" stroke-width="4" fill="none" stroke-linecap="round"/>
      <path d="M132 103 Q140 92 148 103" stroke="${NOSE}" stroke-width="4" fill="none" stroke-linecap="round"/>`
  const ey = humor === 'trabalhando' ? 105 : 100
  const rx = humor === 'chamando' ? 8 : 6.5
  const ry = humor === 'chamando' ? 9.5 : 7
  const pisca = `<animate attributeName="ry" values="${ry};${ry};${ry};0.8;${ry}" keyTimes="0;0.9;0.94;0.97;1" dur="4s" repeatCount="indefinite"/>`
  const olho = (cx: number) =>
    `<ellipse cx="${cx}" cy="${ey}" rx="${rx}" ry="${ry}" fill="${NOSE}">${pisca}</ellipse>
     <circle cx="${cx + 2.4}" cy="${ey - 2.8}" r="2.2" fill="#ffffff"/>`
  const sobrancelhas =
    humor === 'chamando'
      ? `<path d="M88 88 L108 80" stroke="${FUR_DARK}" stroke-width="3.5" stroke-linecap="round"/>
         <path d="M152 88 L132 80" stroke="${FUR_DARK}" stroke-width="3.5" stroke-linecap="round"/>`
      : ''
  return olho(100) + olho(140) + sobrancelhas
}

function boca(humor: Humor): string {
  switch (humor) {
    case 'feliz':
      return `<path d="M106 130 Q120 152 134 130 Z" fill="#7a2e3a"/><ellipse cx="120" cy="140" rx="7" ry="4" fill="#e58a8a"/>`
    case 'chamando':
      return `<ellipse cx="120" cy="136" rx="5" ry="6.5" fill="#7a2e3a"/>`
    case 'trabalhando':
      return `<path d="M112 134 Q120 138 128 134" stroke="${NOSE}" stroke-width="3" fill="none" stroke-linecap="round"/>`
    default:
      return `<path d="M109 132 Q120 142 131 132" stroke="${NOSE}" stroke-width="3" fill="none" stroke-linecap="round"/>`
  }
}

function braco(x1: number, y1: number, x2: number, y2: number, manga: string, anim = ''): string {
  return `<g>${anim}
    <path d="M${x1} ${y1} L${x2} ${y2}" stroke="#000000" stroke-opacity=".18" stroke-width="23" stroke-linecap="round"/>
    <path d="M${x1} ${y1} L${x2} ${y2}" stroke="${manga}" stroke-width="20" stroke-linecap="round"/>
    <circle cx="${x2}" cy="${y2}" r="11.5" fill="${FUR_DARK}"/></g>`
}

function bracos(humor: Humor, manga: string): string {
  switch (humor) {
    case 'trabalhando':
      return (
        braco(86, 158, 100, 216, manga, movimento('translate', '0 0;0 4;0 0', 0.28)) +
        braco(154, 158, 140, 216, manga, movimento('translate', '0 0;0 4;0 0', 0.28, 0.14))
      )
    case 'feliz':
      return braco(86, 158, 56, 112, manga) + braco(154, 158, 184, 112, manga)
    case 'chamando':
      return (
        braco(86, 158, 72, 210, manga) +
        braco(154, 158, 184, 108, manga, movimento('rotate', '-14 154 158;10 154 158;-14 154 158', 0.6))
      )
    default:
      return braco(86, 158, 72, 210, manga) + braco(154, 158, 168, 210, manga)
  }
}

const NOTEBOOK = `<rect x="78" y="208" width="84" height="44" rx="5" fill="#cdd5dd" stroke="#8e99a5" stroke-width="2"/>
  <circle cx="120" cy="230" r="5" fill="#b7e31c"><animate attributeName="opacity" values=".35;1;.35" dur="1.2s" repeatCount="indefinite"/></circle>
  <rect x="70" y="251" width="100" height="5" rx="2.5" fill="#8e99a5"/>`

function lontra(roupaId: string, humor: Humor): string {
  const roupa = ROUPAS[roupaId] ?? ROUPAS.mago
  const manga = roupa.sleeve

  const corpoMov =
    humor === 'feliz'
      ? movimento('translate', '0 0;0 -16;0 0', 0.7, 0, 'calcMode="spline" keySplines=".3 0 .6 1;.4 0 .7 1"')
      : humor === 'chamando'
        ? movimento('rotate', '-1.5 120 262;1.5 120 262;-1.5 120 262', 0.5)
        : movimento('translate', '0 0;0 -2.5;0 0', 3)

  const cabecaMov =
    humor === 'calmo' ? movimento('rotate', '-2 120 150;2 120 150;-2 120 150', 5) : ''

  const sono =
    roupaId === 'pijama' && humor === 'calmo'
      ? `<g font-family="sans-serif" font-weight="700" fill="#8fb4e8">
          <text x="200" y="40" font-size="18"><animate attributeName="opacity" values="0;1;0" dur="2.4s" repeatCount="indefinite"/>z</text>
          <text x="214" y="22" font-size="24"><animate attributeName="opacity" values="0;1;0" dur="2.4s" begin=".8s" repeatCount="indefinite"/>Z</text>
        </g>`
      : ''

  const brilhos =
    humor === 'feliz'
      ? estrela(34, 70, 9, GOLD, true) +
        estrela(206, 60, 11, GOLD, true) +
        estrela(24, 150, 7, GOLD, true) +
        estrela(214, 150, 8, GOLD, true)
      : ''

  const balao =
    humor === 'chamando'
      ? `<g transform="translate(200 40)"><g>${movimento('scale', '1;1.18;1', 0.8)}
          <circle r="18" fill="#ffd23f" stroke="#c9971a" stroke-width="3"/>
          <text x="0" y="9" text-anchor="middle" font-family="sans-serif" font-size="28" font-weight="700" fill="#5a3b00">!</text>
        </g></g>`
      : ''

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -14 240 304">
    <ellipse cx="120" cy="268" rx="58" ry="8" fill="#000000" opacity=".15"/>
    <g>${corpoMov}
      ${atrasDoCorpo(roupaId)}
      <g>${movimento('rotate', '-7 148 232;7 148 232;-7 148 232', 3)}
        <path d="M148 232 Q208 238 208 188" stroke="${FUR}" stroke-width="19" fill="none" stroke-linecap="round"/>
        <path d="M208 200 L208 188" stroke="${FUR_DARK}" stroke-width="19" stroke-linecap="round"/>
      </g>
      <ellipse cx="96" cy="254" rx="21" ry="9" fill="${FUR_DARK}"/>
      <ellipse cx="144" cy="254" rx="21" ry="9" fill="${FUR_DARK}"/>
      <ellipse cx="120" cy="192" rx="52" ry="62" fill="${FUR}"/>
      <ellipse cx="120" cy="202" rx="33" ry="46" fill="${CREAM}"/>
      ${roupaDoCorpo(roupaId)}
      ${humor === 'trabalhando' ? NOTEBOOK : ''}
      ${bracos(humor, manga)}
      <g>${cabecaMov}
        <circle cx="78" cy="68" r="11" fill="${FUR}"/><circle cx="78" cy="68" r="5.5" fill="${CREAM}"/>
        <circle cx="162" cy="68" r="11" fill="${FUR}"/><circle cx="162" cy="68" r="5.5" fill="${CREAM}"/>
        <circle cx="120" cy="110" r="52" fill="${FUR}"/>
        <ellipse cx="120" cy="128" rx="30" ry="22" fill="${CREAM}"/>
        <circle cx="86" cy="124" r="7" fill="#e58a8a" opacity=".35"/><circle cx="154" cy="124" r="7" fill="#e58a8a" opacity=".35"/>
        ${roupaId === 'heroi' ? roupaDaCabeca(roupaId, humor) : ''}
        ${olhos(humor)}
        <ellipse cx="120" cy="118" rx="8" ry="5.5" fill="${NOSE}"/>
        <line x1="120" y1="123" x2="120" y2="129" stroke="${NOSE}" stroke-width="2"/>
        ${boca(humor)}
        <g stroke="${FUR_DARK}" stroke-width="1.6" stroke-linecap="round" opacity=".7">
          <line x1="92" y1="128" x2="62" y2="121"/><line x1="92" y1="133" x2="60" y2="134"/><line x1="93" y1="138" x2="64" y2="147"/>
          <line x1="148" y1="128" x2="178" y2="121"/><line x1="148" y1="133" x2="180" y2="134"/><line x1="147" y1="138" x2="176" y2="147"/>
        </g>
        ${roupaId === 'heroi' ? '' : roupaDaCabeca(roupaId, humor)}
      </g>
    </g>
    ${brilhos}${balao}${sono}
  </svg>`
}

// ---------- mod ----------

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'lico', description: 'Mostrar o painel do Lico' })
    // Roupa aleatória a cada sessão, sempre diferente da última usada.
    const ultima = await $.store.get('roupa')
    const opcoes = IDS.filter(id => id !== ultima)
    const sorteada = opcoes[Math.floor(Math.random() * opcoes.length)]
    await update($, roupaAtom, () => sorteada)
    await $.store.set('roupa', sorteada)
    void $.ui.open({ id: PANE, title: 'Lico' })

    return next(e)
  })

  on('command.run', { command: 'lico' }, async $ => {
    await $.ui.open({ id: PANE, title: 'Lico' })

    return { text: 'Lico no painel.' }
  })

  on('turn.start', async ($, e, next) => {
    await update($, humorAtom, () => 'trabalhando')

    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const ran = await next(e)
    await update($, humorAtom, () => (e.reason === 'answer' ? 'feliz' : 'chamando'))

    return ran
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const ui = $.ui.resolve(e)
    const { Box, Text, Button } = ui
    // Só o desktop (e o mobile) desenham SVG; o terminal cai no texto.
    const Svg = 'Svg' in ui ? ui.Svg : undefined
    const roupaId = await read($, roupaAtom)
    const humor = (await read($, humorAtom)) as Humor
    const roupa = ROUPAS[roupaId] ?? ROUPAS.mago

    const trocar = async (id: string) => {
      await update($, roupaAtom, () => id)
      await $.store.set('roupa', id)
    }

    return (
      <Box flexDirection="column">
        {Svg ? (
          <Svg
            source={lontra(roupaId, humor)}
            alt={`Lico, a lontra mascote, de ${roupa.nome}, ${HUMOR_TXT[humor]}`}
            width={230}
            isInteractive
          />
        ) : (
          <Text>🦦</Text>
        )}
        <Text>
          Lico · {roupa.nome}
        </Text>
        <Text dimColor>{HUMOR_TXT[humor]}</Text>
        {/* Escondidinho: só um brilho discreto, que sorteia outra roupa. */}
        <Button
          key="surpresa"
          label="✨"
          plain
          dimColor
          onPress={() => {
            const outras = IDS.filter(id => id !== roupaId)
            return trocar(outras[Math.floor(Math.random() * outras.length)])
          }}
        />
      </Box>
    )
  })
}
