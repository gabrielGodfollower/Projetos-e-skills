// Arte da oferta: fundo do Jogo Barato + capa do jogo + nome + preço.
// Monta o layout com satori (vira SVG) e transforma em PNG com resvg.
import { readFileSync } from 'node:fs';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';

const ler = nome => readFileSync(new URL('../assets/' + nome, import.meta.url));
const png64 = nome => 'data:image/png;base64,' + ler(nome).toString('base64');
const FONTES = [
  { name: 'Teko', data: ler('teko-500.ttf'), weight: 500, style: 'normal' },
  { name: 'Saira', data: ler('saira-700.ttf'), weight: 700, style: 'normal' },
  { name: 'Outfit', data: ler('outfit-500.ttf'), weight: 500, style: 'normal' },
  { name: 'Outfit', data: ler('outfit-700.ttf'), weight: 700, style: 'normal' }
];
const AZUL_TEXTO = '#0a1b37';

// ---------- leitura do texto da oferta ----------
export function dadosDaOferta(texto) {
  const linhas = texto.split('\n').map(l => l.trim()).filter(Boolean);
  let titulo = linhas[0] || '';
  let loja = '';
  const m = titulo.match(/^\[([^\]]+)\]\s*/);
  if (m) { loja = m[1]; titulo = titulo.slice(m[0].length); }
  // Tira emojis e marcadores do começo do título
  titulo = titulo.replace(/^[^\p{L}\p{N}]+/u, '').trim();
  if (/^(?:https?:\/\/|www\.)\S+$/i.test(titulo)) titulo = '';
  // Padrão do Jogo Barato: "à vista" ou "parcelado", conforme a linha do preço
  const linhaPreco = linhas.find(l => /R\$\s?\d/.test(l)) || '';
  const p = linhaPreco.match(/R\$\s?(\d{1,3}(?:\.\d{3})*(?:,\d{2})?)/);
  const parcelado = /\d+\s*x\b|parcelad|em até/i.test(linhaPreco) && !/à vista|a vista|pix|boleto/i.test(linhaPreco);
  return { titulo, loja, preco: p ? p[1] : '', condicao: parcelado ? 'parcelado' : 'à vista' };
}

// ---------- capa do jogo ----------
export function tipoImagem(buf) {
  if (buf[0] === 0xff && buf[1] === 0xd8) return 'image/jpeg';
  if (buf[0] === 0x89 && buf[1] === 0x50) return 'image/png';
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

const capaImg = (capa, tipo, style) => ({
  type: 'img',
  props: { src: `data:${tipo};base64,${capa.toString('base64')}`, style: { position: 'absolute', objectFit: 'contain', ...style } }
});

// ---------- modelo Jogo Barato ----------
// Título numa linha no alto, capa no meio, preço na caixa azul do canto
function tamanhoTitulo(t) {
  if (t.length <= 50) return 24;
  if (t.length <= 62) return 21;
  return 19;
}

const JOGO_BARATO = {
  largura: 1197, altura: 999, fundo: png64('fundo-arte.png'),
  camadas({ titulo, preco, condicao, capa, tipo }) {
    const c = [h('div', {
      position: 'absolute', left: 33, top: 212, width: 1040,
      color: AZUL_TEXTO, fontFamily: 'Saira', fontSize: tamanhoTitulo(titulo), lineHeight: 1.25
    }, titulo)];
    if (tipo) c.push(capaImg(capa, tipo, { left: 249, top: 343, width: 700, height: 527 }));
    // Caixa do preço: redesenhada por cima da do fundo, que já tem "R$" escrito
    if (preco) {
      const tamPreco = preco.length <= 6 ? 64 : preco.length <= 8 ? 58 : 50;
      c.push(h('div', {
        position: 'absolute', left: 806, top: 866, width: 356, height: 150,
        background: 'linear-gradient(90deg, #00296c, #003486)', borderRadius: 22,
        transform: 'skewX(-9deg)'
      }, []));
      c.push(h('div', {
        position: 'absolute', left: 806, top: 868, width: 327, height: 118,
        flexDirection: 'column', alignItems: 'flex-end', justifyContent: 'center',
        color: '#fff', fontFamily: 'Teko'
      }, [
        h('div', { fontSize: 29, lineHeight: 0.85 }, 'a partir de'),
        h('div', { fontSize: tamPreco, lineHeight: 0.85, marginTop: 4 }, 'R$ ' + preco),
        h('div', { fontSize: 29, lineHeight: 0.85 }, condicao)
      ]));
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
