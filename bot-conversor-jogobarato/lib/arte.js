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
    base: tam * ((1 - (f.ascender - f.descender) / f.unitsPerEm) / 2 + f.ascender / f.unitsPerEm),
    // Da linha de base até o meio do quadrado da fonte (o "middle" do canvas)
    meio: tam * (f.ascender + f.descender) / (f.ascender - f.descender) / 2
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
  // A imagem do produto encaixa inteira em 90% desta área, no centro. Imagem bem
  // larga (duas ou mais capas lado a lado) pode passar dessa largura, até 940 px,
  // para ficar com a mesma altura de uma capa sozinha
  produto: { left: 280, top: 281, width: 640, height: 580, escala: 0.9, larga: 1.6, larguraMax: 940 },
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

// Área onde a imagem do produto encaixa, centralizada no mesmo ponto do HTML
export function areaDoProduto(tamanho) {
  const A = LAYOUT_JB.produto;
  let w = A.width * A.escala;
  const h2 = A.height * A.escala;
  if (tamanho && tamanho.w / tamanho.h >= A.larga) w = Math.min(A.larguraMax, h2 * tamanho.w / tamanho.h);
  return { left: A.left + (A.width - w) / 2, top: A.top + (A.height - h2) / 2, width: w, height: h2 };
}

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

// ---------- colagem (vários produtos) ----------
// Como no 25.html: as capas ficam entre o texto e o quadro do preço, todas com a mesma
// altura e cada uma com a largura da sua proporção, em 1 ou 2 fileiras (a que deixar as
// capas maiores). O HTML mostra até 4; o bot vai até 12 (listas grandes, como as de
// outros grupos), com até 3 fileiras a partir de 5 capas. Com mais, a última ganha um selo "+N".
export const COLAGEM_JB = { x: 50, y: 275, w: 1020, h: 580, maxCapas: 12, corSelo: '#0d3378' };
const PROPORCAO_PS5 = 0.8; // largura ÷ altura de uma caixa de jogo de PS5

// Posição de cada capa, a partir das proporções (largura ÷ altura) delas
export function slotsColagem(proporcoes, A = COLAGEM_JB) {
  const n = proporcoes.length;
  if (!n) return [];
  // Espaço entre as capas (um pouco maior quando são só duas)
  const gap = n === 2 ? 48 : 28;
  const indices = proporcoes.map((_, i) => i);
  const arranjo = prop => {
    let melhor = null;
    for (let linhas = 1; linhas <= Math.min(n > 4 ? 3 : 2, n); linhas++) {
      const cols = Math.ceil(n / linhas);
      const grupos = [];
      for (let l = 0; l < linhas; l++) grupos.push(indices.slice(l * cols, (l + 1) * cols));
      let h = (A.h - gap * (linhas - 1)) / linhas;
      for (const g of grupos) h = Math.min(h, (A.w - gap * (g.length - 1)) / g.reduce((t, i) => t + prop(i), 0));
      if (!melhor || h > melhor.h * 1.02) melhor = { linhas, grupos, h };
    }
    return melhor;
  };
  const melhor = arranjo(i => proporcoes[i]);
  const { linhas, grupos } = melhor;
  let h = melhor.h;
  // Três capas: no máximo a altura de três caixas de PS5 lado a lado, para caixas
  // estreitas (Switch) não ficarem maiores que o normal. Duas: 80% do máximo
  if (n === 3) h = Math.min(h, arranjo(() => PROPORCAO_PS5).h);
  if (n === 2) h = Math.min(h, arranjo(() => PROPORCAO_PS5).h) * 0.8;
  const topo = A.y + A.h / 2 - (linhas * h + (linhas - 1) * gap) / 2;
  const slots = [];
  grupos.forEach((g, l) => {
    let x = A.x + A.w / 2 - (g.reduce((t, i) => t + h * proporcoes[i], 0) + gap * (g.length - 1)) / 2;
    for (const i of g) {
      const w = h * proporcoes[i];
      slots.push({ x, y: topo + l * (h + gap), w, h });
      x += w + gap;
    }
  });
  return slots;
}

// Corta a margem branca (ou transparente) em volta da capa, como o 25.html, para as
// capas ficarem comparáveis. Devolve a capa (o tipo dela muda para PNG quando é cortada)
// com as medidas, ou null se não abrir
export function semBordaBranca(buf) {
  const tipo = tipoImagem(buf), t = tamanhoImagem(buf);
  if (!tipo || !t || !t.w || !t.h) return null;
  const href = `data:${tipo};base64,${buf.toString('base64')}`;
  const svg = (w, h2, caixa) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h2}" viewBox="${caixa}">`
    + `<image href="${href}" width="${t.w}" height="${t.h}" preserveAspectRatio="none"/></svg>`;
  // Procura a margem numa cópia pequena (até 320 px), como o HTML
  const k = Math.min(1, 320 / Math.max(t.w, t.h));
  const mini = new Resvg(svg(Math.max(1, Math.round(t.w * k)), Math.max(1, Math.round(t.h * k)), `0 0 ${t.w} ${t.h}`)).render();
  const d = mini.pixels;
  let x0 = mini.width, y0 = mini.height, x1 = -1, y1 = -1;
  for (let y = 0; y < mini.height; y++) {
    for (let x = 0; x < mini.width; x++) {
      const o = (y * mini.width + x) * 4;
      if (d[o + 3] < 16 || (d[o] > 240 && d[o + 1] > 240 && d[o + 2] > 240)) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  const inteira = { capa: buf, tipo, w: t.w, h: t.h };
  if (x1 < x0 || y1 < y0) return inteira;
  const kx = mini.width / t.w, ky = mini.height / t.h;
  const sx = Math.max(0, Math.floor(x0 / kx) - 1), sy = Math.max(0, Math.floor(y0 / ky) - 1);
  const sw = Math.min(t.w, Math.ceil((x1 + 1) / kx) + 1) - sx, sh = Math.min(t.h, Math.ceil((y1 + 1) / ky) + 1) - sy;
  if (sw >= t.w * 0.98 && sh >= t.h * 0.98) return inteira;
  return { capa: new Resvg(svg(sw, sh, `${sx} ${sy} ${sw} ${sh}`)).render().asPng(), tipo: 'image/png', w: sw, h: sh };
}

function camadasDaColagem(capas, A = COLAGEM_JB) {
  const visiveis = capas.slice(0, A.maxCapas);
  const extra = capas.length - visiveis.length;
  const slots = slotsColagem(visiveis.map(c => c.w / c.h), A);
  const c = slots.map((s, i) => ({
    type: 'img',
    props: { src: `data:${visiveis[i].tipo};base64,${visiveis[i].capa.toString('base64')}`, width: s.w, height: s.h, style: { position: 'absolute', left: s.x, top: s.y, width: s.w, height: s.h } }
  }));
  if (extra > 0) {
    // Selo "+N" no canto da última capa. O HTML pede Teko 600, que não existe: o navegador
    // engrossa a 500, e o contorno branco de 1 px faz o mesmo aqui
    const u = slots[slots.length - 1], r = 44, x = u.x + u.w - r + 10, y = u.y + r - 10;
    const txt = '+' + extra, m = medir('teko-500.ttf', txt, 34);
    c.push(h('div', { position: 'absolute', left: x - r, top: y - r, width: 2 * r, height: 2 * r, borderRadius: r, background: A.corSelo }));
    c.push(naBase(txt, {
      left: x - m.largura / 2, color: '#fff', fontFamily: 'Teko', fontWeight: 500, tam: 34, WebkitTextStroke: '1.1px #fff',
      linhaDeBase: y + 2 + m.meio, base: m.base
    }));
  }
  return c;
}

// ---------- foto cheia ----------
// Foto larga que já tem fundo próprio (sem margem branca, como a foto oficial de uma
// edição de colecionador) ocupa o quadro branco inteiro, entre o cabeçalho e o rodapé,
// e o quadro do preço fica por cima. A foto aparece inteira, sem corte nem distorção;
// a sobra em cima e embaixo (ou dos lados) é a borda da própria foto esticada.
// Nesse modo saem os ícones das redes e o "JOGOBARA.TO/GRUPOS" (fundo-arte-cheia.png).
export const CHEIA = { top: 160, bottom: 985, areaTop: 175, areaTopTitulo: 268, areaBottom: 972, proporcaoMin: 1.25 };

// Foto com fundo próprio: larga e com a borda quase sem branco nem transparência.
// Um fiozinho de moldura de print (até ~1,5% da largura) não conta
export function ehFotoCheia(buf) {
  const tipo = tipoImagem(buf), t = tamanhoImagem(buf);
  if (!tipo || !t || !t.w || !t.h || t.w / t.h < CHEIA.proporcaoMin) return false;
  const k = Math.min(1, 200 / Math.max(t.w, t.h));
  const w = Math.max(16, Math.round(t.w * k)), h2 = Math.max(16, Math.round(t.h * k));
  const mini = new Resvg(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h2}" viewBox="0 0 ${t.w} ${t.h}">`
    + `<image href="data:${tipo};base64,${buf.toString('base64')}" width="${t.w}" height="${t.h}" preserveAspectRatio="none"/></svg>`).render();
  const d = mini.pixels;
  let borda = 0, claros = 0;
  for (let y = 0; y < mini.height; y++) {
    for (let x = 0; x < mini.width; x++) {
      // Um anel um pouco para dentro: o corte da margem deixa 1 ou 2 px de sobra na borda
      const dist = Math.min(x, y, mini.width - 1 - x, mini.height - 1 - y);
      if (dist < 3 || dist > 5) continue;
      const o = (y * mini.width + x) * 4;
      borda++;
      if (d[o + 3] < 200 || (d[o] > 225 && d[o + 1] > 225 && d[o + 2] > 225)) claros++;
    }
  }
  return claros / borda < 0.15;
}

// Retângulo da foto sem a moldura da beirada (em pixels da foto)
function semMoldura(capa, tipo, t) {
  const k = Math.min(1, 1200 / Math.max(t.w, t.h));
  const w = Math.max(1, Math.round(t.w * k)), h2 = Math.max(1, Math.round(t.h * k));
  const r = new Resvg(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h2}" viewBox="0 0 ${t.w} ${t.h}">`
    + `<image href="data:${tipo};base64,${capa.toString('base64')}" width="${t.w}" height="${t.h}" preserveAspectRatio="none"/></svg>`).render();
  const d = r.pixels;
  const moldura = (o) => { const mn = Math.min(d[o], d[o + 1], d[o + 2]), mx = Math.max(d[o], d[o + 1], d[o + 2]); return mn > 200 || mx < 25; };
  const linha = y => { let n = 0; for (let x = 0; x < w; x++) n += moldura((y * w + x) * 4); return n / w > 0.5; };
  const coluna = x => { let n = 0; for (let y = 0; y < h2; y++) n += moldura((y * w + x) * 4); return n / h2 > 0.5; };
  const lim = n => Math.floor(n * 0.08);
  let y0 = 0, y1 = h2 - 1, x0 = 0, x1 = w - 1;
  while (y0 < lim(h2) && linha(y0)) y0++;
  while (h2 - 1 - y1 < lim(h2) && linha(y1)) y1--;
  while (x0 < lim(w) && coluna(x0)) x0++;
  while (w - 1 - x1 < lim(w) && coluna(x1)) x1--;
  const m = 2; // e mais 2 px, que a borda do print costuma vir borrada
  const x = Math.round((x0 + m) / k), y = Math.round((y0 + m) / k);
  return { x, y, w: Math.max(1, Math.round((x1 - m + 1) / k) - x), h: Math.max(1, Math.round((y1 - m + 1) / k) - y) };
}

// O painel da foto (1200 x 825, de y 160 a 985), desenhado à parte em PNG.
// "comTitulo": a foto começa abaixo do título, que fica legível sobre a borda esticada
function painelCheio(capa, tipo, comTitulo) {
  const t = tamanhoImagem(capa);
  const W = LARGURA_JB, H = CHEIA.bottom - CHEIA.top;
  // Tira a moldura que sobra (resto da margem branca ou a borda escura de um print):
  // linhas e colunas da beirada que são quase todas claras ou escuras, mais 2 px
  const { x: i, y: j, w: cw, h: ch } = semMoldura(capa, tipo, t);
  const topo = (comTitulo ? CHEIA.areaTopTitulo : CHEIA.areaTop) - CHEIA.top, aH = CHEIA.areaBottom - CHEIA.top - topo;
  const k = Math.min(W / cw, aH / ch);
  const fw = Math.round(cw * k), fh = Math.round(ch * k);
  const x0 = Math.round((W - fw) / 2), y0 = Math.round(topo + (aH - fh) / 2);
  const img = `<image href="data:${tipo};base64,${capa.toString('base64')}" width="${t.w}" height="${t.h}" preserveAspectRatio="none"/>`;
  const f = Math.max(2, Math.round(12 / k)); // ~12 px da borda, só fundo
  // Um pedaço da borda da foto, espelhado e esticado para cobrir a sobra
  const tira = (x, y, w, h2, caixa, espelho) => (w > 0 && h2 > 0)
    ? `<svg x="${x}" y="${y}" width="${w}" height="${h2}" viewBox="${caixa}" preserveAspectRatio="none"><g transform="${espelho}">${img}</g></svg>` : '';
  const partes = [
    tira(x0, 0, fw, y0, `${i} ${j} ${cw} ${f}`, `translate(0,${2 * j + f}) scale(1,-1)`),
    tira(x0, y0 + fh, fw, H - y0 - fh, `${i} ${j + ch - f} ${cw} ${f}`, `translate(0,${2 * (j + ch) - f}) scale(1,-1)`),
    tira(0, 0, x0, H, `${i} ${j} ${f} ${ch}`, `translate(${2 * i + f},0) scale(-1,1)`),
    tira(x0 + fw, 0, W - x0 - fw, H, `${i + cw - f} ${j} ${f} ${ch}`, `translate(${2 * (i + cw) - f},0) scale(-1,1)`),
    `<svg x="${x0}" y="${y0}" width="${fw}" height="${fh}" viewBox="${i} ${j} ${cw} ${ch}" preserveAspectRatio="none">${img}</svg>`
  ];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${partes.join('')}</svg>`;
  return 'data:image/png;base64,' + Buffer.from(new Resvg(svg).render().asPng()).toString('base64');
}

const FUNDO_CHEIA = png64('fundo-arte-cheia.png');

const JOGO_BARATO = {
  largura: LARGURA_JB, altura: 1000, fundo: png64('fundo-arte.png'),
  camadas({ titulo, preco, condicao, capa, tipo, capas, cheia }) {
    const c = [];
    if (capas && capas.length) c.push(...camadasDaColagem(capas));
    else if (tipo && cheia) {
      c.push({ type: 'img', props: { src: painelCheio(capa, tipo, Boolean(titulo)), width: LARGURA_JB, height: CHEIA.bottom - CHEIA.top, style: { position: 'absolute', left: 0, top: CHEIA.top } } });
      c.push({ type: 'img', props: { src: FUNDO_CHEIA, width: LARGURA_JB, height: 1000, style: { position: 'absolute', left: 0, top: 0 } } });
    } else if (tipo) c.push(capaImg(capa, tipo, areaDoProduto(tamanhoImagem(capa))));
    if (titulo) {
      // Em cima da foto cheia o título sai em branco, com sombra para ler em qualquer fundo
      const T = LAYOUT_JB.titulo, tam = tamanhoQueCabe(T.fonte, titulo, T.tam, T.larguraMax);
      const cor = cheia && tipo ? { color: '#fff', textShadow: '0 1px 4px rgba(0,0,0,0.85)' } : { color: T.cor };
      c.push(naBase(titulo, { left: T.x, ...cor, fontFamily: 'Baloo', fontWeight: 500, tam, linhaDeBase: T.base, base: medir(T.fonte, titulo, tam).base }));
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
// Título centralizado, preço em preto à direita acima do produto, produto embaixo.
// Colagem (fotos de um álbum) na mesma área do produto
const COLAGEM_IND = { x: 200, y: 470, w: 800, h: 510, maxCapas: 12, corSelo: '#1f1d55' };
const JB_INDICA = {
  largura: 1200, altura: 1000, fundo: png64('fundo-jbindica.png'),
  camadas({ titulo, preco, condicao, capa, tipo, capas }) {
    const tam = titulo.length <= 45 ? 39 : titulo.length <= 60 ? 32 : 27;
    const c = [h('div', {
      position: 'absolute', left: 60, top: 256, width: 1080, justifyContent: 'center', textAlign: 'center',
      color: '#2b2b2b', fontFamily: 'Outfit', fontWeight: 500, fontSize: tam, lineHeight: 1.2
    }, titulo)];
    if (capas && capas.length) c.push(...camadasDaColagem(capas, COLAGEM_IND));
    else if (tipo) c.push(capaImg(capa, tipo, { left: 200, top: 470, width: 800, height: 510 }));
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

// "capas" (várias capas ou fotos) monta a colagem no lugar da capa única
export async function gerarArte({ titulo, preco, condicao = 'à vista', capa, capas, modelo = 'jb' }) {
  const m = MODELOS[modelo] || JOGO_BARATO;
  // A capa única também perde a margem branca: foto montada (vários produtos num fundo
  // branco) ficava pequena na arte, porque a margem entrava na conta do tamanho
  // Foto com fundo próprio ocupa o quadro inteiro (só no modelo Jogo Barato). Conta a
  // foto como veio: produto em fundo branco não vale, mesmo que o produto seja retangular
  const cheia = Boolean(capa) && (m === JOGO_BARATO) && ehFotoCheia(capa);
  const cortada = capa && semBordaBranca(capa);
  if (cortada) capa = cortada.capa;
  const tipo = capa && tipoImagem(capa);
  const recortadas = capas && capas.map(semBordaBranca).filter(Boolean);
  const filhos = [
    { type: 'img', props: { src: m.fundo, width: m.largura, height: m.altura, style: { position: 'absolute', left: 0, top: 0 } } },
    ...m.camadas({ titulo, preco, condicao, capa, tipo, capas: recortadas, cheia })
  ];
  const svg = await satori(
    h('div', { position: 'relative', width: m.largura, height: m.altura, background: '#fff' }, filhos),
    { width: m.largura, height: m.altura, fonts: FONTES }
  );
  return new Resvg(svg, { fitTo: { mode: 'width', value: m.largura } }).render().asPng();
}
