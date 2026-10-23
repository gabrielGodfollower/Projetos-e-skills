// Arte da oferta: fundo do Jogo Barato + capa do jogo + nome + preço.
// Monta o layout com satori (vira SVG) e transforma em PNG com resvg.
import { readFileSync } from 'node:fs';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import opentype from '@shuding/opentype.js';

const ler = nome => readFileSync(new URL('../assets/' + nome, import.meta.url));
const png64 = nome => 'data:image/png;base64,' + ler(nome).toString('base64');
// Teko e Baloo 2 são as mesmas fontes embutidas no conversor em HTML do Jogo Barato
const FONTES = [
  { name: 'Teko', data: ler('teko-400.ttf'), weight: 400, style: 'normal' },
  { name: 'Teko', data: ler('teko-500.ttf'), weight: 500, style: 'normal' },
  { name: 'Baloo', data: ler('baloo2-500.ttf'), weight: 500, style: 'normal' },
  { name: 'Outfit', data: ler('outfit-500.ttf'), weight: 500, style: 'normal' },
  { name: 'Outfit', data: ler('outfit-700.ttf'), weight: 700, style: 'normal' }
];

// Medidas de texto como as do canvas do HTML: largura com kerning e altura real
// das letras (do alto do "$" até o pé do "p", por exemplo)
const fontesLidas = {};
function medir(arquivo, txt, tam) {
  const b = ler(arquivo);
  const f = fontesLidas[arquivo] ||= opentype.parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
  const glifos = f.stringToGlyphs(txt).filter(g => g.yMax !== undefined);
  const escala = tam / f.unitsPerEm;
  return {
    largura: f.getAdvanceWidth(txt, tam),
    sobe: Math.max(0, ...glifos.map(g => g.yMax)) * escala,
    desce: -Math.min(0, ...glifos.map(g => g.yMin)) * escala,
    // Onde a linha de base cai numa linha de altura igual ao tamanho da fonte
    base: tam * ((1 - (f.ascender - f.descender) / f.unitsPerEm) / 2 + f.ascender / f.unitsPerEm)
  };
}
// Diminui a fonte até o texto caber na largura, como o HTML faz
function tamanhoQueCabe(arquivo, txt, tam, larguraMax) {
  const { largura } = medir(arquivo, txt, tam);
  return largura > larguraMax ? Math.floor(tam * larguraMax / largura) : tam;
}

// ---------- leitura do texto da oferta ----------
export function dadosDaOferta(texto) {
  const linhas = texto.split('\n').map(l => l.trim()).filter(Boolean);
  // Tira as marcas de formatação (*negrito*, _itálico_...) e os emojis do começo
  let titulo = (linhas[0] || '').replace(/[*_~`|]/g, '');
  // A loja entre colchetes ("[KaBuM!]") sai do título, esteja onde estiver
  let loja = '';
  titulo = titulo.replace(/\[([^\]]+)\]/g, (_, l) => { loja = loja || l.trim(); return ' '; });
  // Chamadas em maiúsculas no começo ("AINDA DISPONÍVEL!", "🚨 BAIXOU!") também saem
  let chamada;
  while ((chamada = titulo.match(/^[^\p{Ll}!]{1,40}!+\s*/u)) && /\p{Lu}/u.test(chamada[0]) && /\p{L}/u.test(titulo.slice(chamada[0].length))) {
    titulo = titulo.slice(chamada[0].length);
  }
  titulo = titulo.replace(/^[^\p{L}\p{N}]+/u, '').replace(/\s{2,}/g, ' ').trim();
  if (/^(?:https?:\/\/|www\.)\S+$/i.test(titulo)) titulo = '';
  const { preco, condicao } = precoPrincipal(texto);
  return { titulo, loja, preco, condicao };
}

// Preço da arte, com a regra do conversor em HTML do Jogo Barato: o menor valor
// em R$ do texto, sem cupom, cashback e frete. A mais, aqui, fica de fora o valor
// da parcela ("10x de R$ 29,99"), que no HTML virava o preço. Se o texto fala em
// Pix ou à vista em qualquer lugar, é "à vista"; senão, "parcelado".
const VALOR = /R\$\s*(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{1,2}))?/g;
const A_VISTA = /(?:^|[^\wÀ-ú])(?:[àa]\s?vista|pix)(?![\wÀ-ú])/i;
export function precoPrincipal(texto) {
  const valores = [];
  for (const m of texto.matchAll(VALOR)) {
    const iniLinha = texto.lastIndexOf('\n', m.index - 1) + 1;
    const antes = texto.slice(Math.max(iniLinha, m.index - 28), m.index).toLowerCase();
    const depois = texto.slice(m.index + m[0].length, m.index + m[0].length + 16).toLowerCase();
    if (/(cupom de|cashback|frete|acima de|compras|desconto de|economi|cr[eé]dito)/.test(antes)
      || /^\s*(off|de desconto|de volta|cashback)/.test(depois)
      || /\d+\s*x\s*(de\s*)?$/.test(antes)) continue;
    const v = parseFloat(m[1].replace(/\./g, '') + '.' + (m[2] || '0').padEnd(2, '0'));
    if (v > 0) valores.push(v);
  }
  const condicao = A_VISTA.test(texto) ? 'à vista' : 'parcelado';
  if (!valores.length) return { preco: '', condicao };
  // Sempre com centavos e ponto no milhar: "R$ 1299" vira "1.299,00"
  const [reais, centavos] = Math.min(...valores).toFixed(2).split('.');
  return { preco: reais.replace(/\B(?=(\d{3})+$)/g, '.') + ',' + centavos, condicao };
}

// ---------- capa do jogo ----------
export function tipoImagem(buf) {
  if (buf[0] === 0xff && buf[1] === 0xd8) return 'image/jpeg';
  if (buf[0] === 0x89 && buf[1] === 0x50) return 'image/png';
  return null;
}

// Largura e altura da imagem, lidas do cabeçalho do PNG ou do JPEG
export function tamanhoImagem(buf) {
  if (tipoImagem(buf) === 'image/png') return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
  if (tipoImagem(buf) === 'image/jpeg') {
    let i = 2;
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) { i++; continue; }
      const marca = buf[i + 1];
      // Marcadores SOF (início do quadro) trazem as medidas
      if (marca >= 0xc0 && marca <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marca)) {
        return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
      }
      i += 2 + buf.readUInt16BE(i + 2);
    }
  }
  return null;
}

// Amazon bloqueia leitura da página por servidores; a imagem do produto ainda
// sai pelo widget de imagem dos Associados, que só precisa do código ASIN
export function asinDaAmazon(url) {
  const m = url.match(/amazon\.[a-z.]+\/(?:[^\s?]*\/)?(?:dp|gp\/product|gp\/aw\/d)\/([A-Z0-9]{10})/i);
  return m ? m[1].toUpperCase() : null;
}

async function baixarImagem(url) {
  try {
    const r = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(4000) });
    const buf = Buffer.from(await r.arrayBuffer());
    // A Amazon devolve um GIF de 1 pixel quando não acha a imagem
    return tipoImagem(buf) && buf.length > 2000 ? buf : null;
  } catch {
    return null;
  }
}

async function capaDaAmazon(asin) {
  const capa = await baixarImagem(`https://ws-na.amazon-adsystem.com/widgets/q?_encoding=UTF8&MarketPlace=BR&ASIN=${asin}&ServiceVersion=20070822&ID=AsinImage&WS=1&Format=_SL1000_`);
  return capa || baixarImagem(`https://images-na.ssl-images-amazon.com/images/P/${asin}.01._SCLZZZZZZZ_.jpg`);
}

// Procura a imagem da página do link (og:image), como a prévia do Telegram faz
export async function capaDoLink(url) {
  // Página da Amazon não adianta abrir: ela bloqueia servidores
  const asin = asinDaAmazon(url);
  if (asin) return capaDaAmazon(asin);
  try {
    const r = await fetch(url, {
      redirect: 'follow',
      headers: { 'user-agent': 'Mozilla/5.0 (compatible; TelegramBot (like TwitterBot))', 'accept-language': 'pt-BR' },
      signal: AbortSignal.timeout(4000)
    });
    const html = await r.text();
    const m = html.match(/<meta[^>]+(?:property|name)=["']og:image(?::secure_url)?["'][^>]*>/i);
    const c = m && m[0].match(/content=["']([^"']+)["']/i);
    if (!c) return null;
    const img = await fetch(new URL(c[1].replace(/&amp;/g, '&'), r.url), { signal: AbortSignal.timeout(4000) });
    const buf = Buffer.from(await img.arrayBuffer());
    return tipoImagem(buf) ? buf : null;
  } catch {
    return null;
  }
}

// ---------- montagem ----------
const h = (type, style, children) => ({ type, props: { style: { display: 'flex', ...style }, children } });

// Cada grupo tem o seu modelo de arte: "jb" (Jogo Barato) e "ind" (JB Indica)
export function modeloDoGrupo(grupo) {
  return grupo === 'ind' ? 'ind' : 'jb';
}

// Encaixa a imagem inteira na área (como "contain"); "vertical" diz onde ela fica
// quando sobra espaço em cima e embaixo (0 = no topo, 0.5 = no meio, 1 = embaixo)
function capaImg(capa, tipo, { left, top, width, height, vertical = 0.5 }) {
  const src = `data:${tipo};base64,${capa.toString('base64')}`;
  const t = tamanhoImagem(capa);
  if (!t || !t.w || !t.h) {
    return { type: 'img', props: { src, style: { position: 'absolute', objectFit: 'contain', left, top, width, height } } };
  }
  const escala = Math.min(width / t.w, height / t.h);
  const w = Math.round(t.w * escala), h2 = Math.round(t.h * escala);
  return {
    type: 'img',
    props: {
      src, width: w, height: h2,
      style: { position: 'absolute', left: Math.round(left + (width - w) / 2), top: Math.round(top + (height - h2) * vertical), width: w, height: h2 }
    }
  };
}

// ---------- modelo Jogo Barato ----------
// Mesmo desenho do conversor em HTML do Jogo Barato (layout "jb" dele), com o
// fundo original de 1200x1000. Posições em pixels da arte final.
const LARGURA_JB = 1200;
export const LAYOUT_JB = {
  // A imagem do produto encaixa inteira em 90% desta área, no centro
  produto: { left: 280, top: 281, width: 640, height: 580, escala: 0.9 },
  // Nome do produto: Baloo 2 Medium, linha de base em 248; diminui se passar de 1134 px
  titulo: { fonte: 'baloo2-500.ttf', tam: 25, x: 32, base: 248, cor: '#082147', larguraMax: 1134 },
  // Preço no quadro azul: linhas empilhadas com 3 px entre elas, o bloco centralizado
  // na altura 931 e alinhado à direita em 1120; cada linha cabe em 268 px
  preco: {
    direita: 1120, centro: 931, espaco: 3, larguraMax: 268,
    cima: { fonte: 'teko-400.ttf', peso: 400, tam: 26 },
    valor: { fonte: 'teko-500.ttf', peso: 500, tam: 60 },
    baixo: { fonte: 'teko-400.ttf', peso: 400, tam: 26 }
  }
};

// Linhas do quadro do preço: "a partir de", o valor e "parcelado" (no Pix ou à
// vista essa última linha não aparece, como no HTML)
export function linhasDoPrecoJB(preco, condicao) {
  const P = LAYOUT_JB.preco;
  const linhas = [
    { txt: 'a partir de', ...P.cima },
    { txt: 'R$ ' + preco, ...P.valor },
    condicao === 'parcelado' && { txt: 'parcelado', ...P.baixo }
  ].filter(Boolean).map(l => {
    const tam = tamanhoQueCabe(l.fonte, l.txt, l.tam, P.larguraMax);
    return { ...l, tam, ...medir(l.fonte, l.txt, tam) };
  });
  const total = linhas.reduce((t, l) => t + l.sobe + l.desce, 0) + P.espaco * (linhas.length - 1);
  let topo = P.centro - total / 2;
  for (const l of linhas) {
    l.linhaDeBase = topo + l.sobe;
    topo += l.sobe + l.desce + P.espaco;
  }
  return linhas;
}

// Texto com a linha de base numa altura exata (o satori posiciona pelo topo da linha)
const naBase = (txt, { linhaDeBase, base, tam, ...estilo }) => h('div', {
  position: 'absolute', top: linhaDeBase - base, fontSize: tam, lineHeight: 1, whiteSpace: 'nowrap', ...estilo
}, txt);

const JOGO_BARATO = {
  largura: LARGURA_JB, altura: 1000, fundo: png64('fundo-arte.png'),
  camadas({ titulo, preco, condicao, capa, tipo }) {
    const c = [];
    if (tipo) {
      const A = LAYOUT_JB.produto, e = A.escala, w = A.width * e, hh = A.height * e;
      c.push(capaImg(capa, tipo, { left: A.left + (A.width - w) / 2, top: A.top + (A.height - hh) / 2, width: w, height: hh }));
    }
    if (titulo) {
      const T = LAYOUT_JB.titulo, tam = tamanhoQueCabe(T.fonte, titulo, T.tam, T.larguraMax);
      c.push(naBase(titulo, { left: T.x, color: T.cor, fontFamily: 'Baloo', fontWeight: 500, tam, linhaDeBase: T.base, base: medir(T.fonte, titulo, tam).base }));
    }
    if (preco) {
      for (const l of linhasDoPrecoJB(preco, condicao)) {
        c.push(naBase(l.txt, { right: LARGURA_JB - LAYOUT_JB.preco.direita, color: '#fff', fontFamily: 'Teko', fontWeight: l.peso, tam: l.tam, linhaDeBase: l.linhaDeBase, base: l.base }));
      }
    }
    return c;
  }
};

// ---------- modelo JB Indica ----------
// Título centralizado, preço em preto à direita acima do produto, produto embaixo
const JB_INDICA = {
  largura: 1200, altura: 1000, fundo: png64('fundo-jbindica.png'),
  camadas({ titulo, preco, condicao, capa, tipo }) {
    const tam = titulo.length <= 45 ? 39 : titulo.length <= 60 ? 32 : 27;
    const c = [h('div', {
      position: 'absolute', left: 60, top: 256, width: 1080, justifyContent: 'center', textAlign: 'center',
      color: '#2b2b2b', fontFamily: 'Outfit', fontWeight: 500, fontSize: tam, lineHeight: 1.2
    }, titulo)];
    if (tipo) c.push(capaImg(capa, tipo, { left: 200, top: 470, width: 800, height: 510 }));
    if (preco) {
      c.push(h('div', {
        position: 'absolute', right: 30, top: 396, flexDirection: 'column', alignItems: 'flex-end',
        color: '#111', fontFamily: 'Outfit'
      }, [
        h('div', { fontWeight: 700, fontSize: 48, lineHeight: 1 }, 'R$ ' + preco),
        h('div', { fontWeight: 500, fontSize: 25, lineHeight: 1, marginTop: 2 }, condicao)
      ]));
    }
    return c;
  }
};

const MODELOS = { jb: JOGO_BARATO, ind: JB_INDICA };

export async function gerarArte({ titulo, preco, condicao = 'à vista', capa, modelo = 'jb' }) {
  const m = MODELOS[modelo] || JOGO_BARATO;
  const tipo = capa && tipoImagem(capa);
  const filhos = [
    { type: 'img', props: { src: m.fundo, width: m.largura, height: m.altura, style: { position: 'absolute', left: 0, top: 0 } } },
    ...m.camadas({ titulo, preco, condicao, capa, tipo })
  ];
  const svg = await satori(
    h('div', { position: 'relative', width: m.largura, height: m.altura, background: '#fff' }, filhos),
    { width: m.largura, height: m.altura, fonts: FONTES }
  );
  return new Resvg(svg, { fitTo: { mode: 'width', value: m.largura } }).render().asPng();
}
