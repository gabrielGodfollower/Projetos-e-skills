// Arte da oferta: fundo do Jogo Barato + capa do jogo + nome + preço.
// Monta o layout com satori (vira SVG) e transforma em PNG com resvg.
import { readFileSync } from 'node:fs';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';

const ler = nome => readFileSync(new URL('../assets/' + nome, import.meta.url));
const FUNDO = 'data:image/png;base64,' + ler('fundo-arte.png').toString('base64');
const FONTES = [
  { name: 'Teko', data: ler('teko-600.ttf'), weight: 600, style: 'normal' },
  { name: 'Inter', data: ler('inter-700.ttf'), weight: 700, style: 'normal' }
];
const LARGURA = 1197, ALTURA = 999;
const AZUL = '#0a2a6b';

// ---------- leitura do texto da oferta ----------
export function dadosDaOferta(texto) {
  const linhas = texto.split('\n').map(l => l.trim()).filter(Boolean);
  let titulo = linhas[0] || '';
  let loja = '';
  const m = titulo.match(/^\[([^\]]+)\]\s*/);
  if (m) { loja = m[1]; titulo = titulo.slice(m[0].length); }
  // Tira emojis e marcadores do começo do título
  titulo = titulo.replace(/^[^\p{L}\p{N}]+/u, '').trim();
  const p = texto.match(/R\$\s?(\d{1,3}(?:\.\d{3})*(?:,\d{2})?)/);
  return { titulo, loja, preco: p ? p[1] : '' };
}

// ---------- capa do jogo ----------
export function tipoImagem(buf) {
  if (buf[0] === 0xff && buf[1] === 0xd8) return 'image/jpeg';
  if (buf[0] === 0x89 && buf[1] === 0x50) return 'image/png';
  return null;
}

// Procura a imagem da página do link (og:image), como a prévia do Telegram faz
export async function capaDoLink(url) {
  try {
    const r = await fetch(url, {
      redirect: 'follow',
      headers: { 'user-agent': 'Mozilla/5.0 (compatible; TelegramBot (like TwitterBot))', 'accept-language': 'pt-BR' },
      signal: AbortSignal.timeout(6000)
    });
    const html = await r.text();
    const m = html.match(/<meta[^>]+(?:property|name)=["']og:image(?::secure_url)?["'][^>]*>/i);
    const c = m && m[0].match(/content=["']([^"']+)["']/i);
    if (!c) return null;
    const img = await fetch(new URL(c[1].replace(/&amp;/g, '&'), r.url), { signal: AbortSignal.timeout(6000) });
    const buf = Buffer.from(await img.arrayBuffer());
    return tipoImagem(buf) ? buf : null;
  } catch {
    return null;
  }
}

// ---------- montagem ----------
const h = (type, style, children) => ({ type, props: { style: { display: 'flex', ...style }, children } });

function tamanhoTitulo(t) {
  if (t.length <= 28) return 56;
  if (t.length <= 50) return 48;
  if (t.length <= 80) return 40;
  return 34;
}

export async function gerarArte({ titulo, loja, preco, capa }) {
  const filhos = [
    { type: 'img', props: { src: FUNDO, width: LARGURA, height: ALTURA, style: { position: 'absolute', left: 0, top: 0 } } }
  ];

  const tipo = capa && tipoImagem(capa);
  if (tipo) {
    filhos.push({
      type: 'img',
      props: {
        src: `data:${tipo};base64,${capa.toString('base64')}`,
        style: { position: 'absolute', left: 60, top: 225, width: 500, height: 620, objectFit: 'contain' }
      }
    });
  }

  // Nome do jogo e loja: ao lado da capa, ou centralizado se não tiver capa
  const esquerda = tipo ? 600 : 80;
  const largura = tipo ? 460 : 980;
  const tam = tamanhoTitulo(titulo);
  filhos.push(h('div', {
    position: 'absolute', left: esquerda, top: 240, width: largura, height: 600,
    display: 'flex', flexDirection: 'column', justifyContent: 'center',
    alignItems: tipo ? 'flex-start' : 'center'
  }, [
    ...(loja ? [h('div', {
      display: 'flex', background: AZUL, color: '#fff', fontFamily: 'Inter', fontSize: 26,
      padding: '6px 18px', borderRadius: 999, marginBottom: 22
    }, loja)] : []),
    h('div', {
      display: 'flex', color: AZUL, fontFamily: 'Inter', fontSize: tam, lineHeight: 1.15,
      textAlign: tipo ? 'left' : 'center', lineClamp: 6
    }, titulo)
  ]));

  // Caixa do preço: redesenhada por cima da do fundo, que já tem "R$" escrito
  if (preco) {
    const tamPreco = preco.length <= 6 ? 96 : preco.length <= 8 ? 84 : 72;
    filhos.push(h('div', {
      position: 'absolute', left: 806, top: 866, width: 356, height: 150,
      background: 'linear-gradient(90deg, #00296c, #003486)', borderRadius: 22,
      transform: 'skewX(-9deg)'
    }, []));
    filhos.push(h('div', {
      position: 'absolute', left: 806, top: 868, width: 330, height: 118,
      display: 'flex', flexDirection: 'column', alignItems: 'flex-end', justifyContent: 'center', color: '#fff'
    }, [
      h('div', { display: 'flex', fontFamily: 'Teko', fontSize: 34, lineHeight: 0.9 }, 'a partir de'),
      h('div', { display: 'flex', alignItems: 'baseline', fontFamily: 'Teko', lineHeight: 0.9 }, [
        h('div', { display: 'flex', fontSize: tamPreco * 0.55, marginRight: 8 }, 'R$'),
        h('div', { display: 'flex', fontSize: tamPreco }, preco)
      ])
    ]));
  }

  const svg = await satori(
    h('div', { position: 'relative', display: 'flex', width: LARGURA, height: ALTURA, background: '#fff' }, filhos),
    { width: LARGURA, height: ALTURA, fonts: FONTES }
  );
  return new Resvg(svg, { fitTo: { mode: 'width', value: LARGURA } }).render().asPng();
}
