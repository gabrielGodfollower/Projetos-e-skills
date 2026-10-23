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

// Preço da arte: o primeiro valor em R$ que é mesmo o preço do produto. Pula
// cupom, cashback e frete (filtros do conversor em HTML do Jogo Barato), o valor
// da parcela ("10x de R$ 29,99") e o preço antigo ("De R$ 299 por R$ 149").
// "à vista" ou "parcelado" sai do trecho em volta desse valor.
const VALOR = /R\$\s?(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{1,2}))?/g;
export function precoPrincipal(texto) {
  const valores = [...texto.matchAll(VALOR)].map(m => {
    const iniLinha = texto.lastIndexOf('\n', m.index - 1) + 1;
    return {
      m, iniLinha,
      fimLinha: (texto.indexOf('\n', m.index) + 1 || texto.length + 1) - 1,
      antes: texto.slice(Math.max(iniLinha, m.index - 28), m.index).toLowerCase(),
      depois: texto.slice(m.index + m[0].length, m.index + m[0].length + 16).toLowerCase()
    };
  });
  const temPor = i => valores.slice(i + 1).some(v => /\bpor:?\s*[~*_]*$/.test(v.antes));
  const naoEPreco = (v, i) =>
    /(cupom de|cashback|frete|acima de|compras|desconto de|economi|cr[eé]dito)/.test(v.antes)
    || /^\s*(off|de desconto|de volta|cashback)/.test(v.depois)
    || /\d+\s*x\s*(de\s*)?$/.test(v.antes)
    || /~+\s*$/.test(v.antes)
    || (/(?:^|[^\p{L}])de:?\s*[*_]*$/u.test(v.antes) && !/partir de:?\s*[*_]*$/.test(v.antes) && temPor(i));
  const i = Math.max(0, valores.findIndex((v, j) => !naoEPreco(v, j)));
  const v = valores[i];
  if (!v) return { preco: '', condicao: 'à vista' };
  // Trecho do valor: da linha dele, entre o valor anterior e o próximo
  const ant = valores[i - 1], prox = valores[i + 1];
  const ini = ant && ant.fimLinha === v.fimLinha ? ant.m.index + ant.m[0].length : v.iniLinha;
  const fim = prox && prox.iniLinha === v.iniLinha ? prox.m.index : v.fimLinha;
  const trecho = texto.slice(ini, fim);
  const parcelado = /\d+\s*x\b|parcelad|em até/i.test(trecho) && !/à vista|a vista|pix|boleto/i.test(trecho);
  // Sempre com centavos e ponto no milhar: "R$ 1299" vira "1.299,00"
  const reais = v.m[1].replace(/\./g, '').replace(/\B(?=(\d{3})+$)/g, '.');
  return { preco: reais + ',' + (v.m[2] || '').padEnd(2, '0'), condicao: parcelado ? 'parcelado' : 'à vista' };
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
// Título numa linha no alto, capa no meio, preço na caixa azul do canto
function tamanhoTitulo(t) {
  if (t.length <= 50) return 24;
  if (t.length <= 62) return 21;
  return 19;
}

// Fundo original do modelo (o mesmo do conversor em HTML do Jogo Barato), com a
// caixa do preço limpa. Título, capa e preço estão nas medidas da arte do Photoshop.
const LARGURA_JB = 1200;
export const PRECO_JB = {
  apartir: { top: 878, size: 26, espaco: -1, direita: 1131 },
  preco: { top: 903, size: 60, direita: 1133 },
  condicao: { top: 959, size: 26, espaco: -1, direita: 1132 }
};

const JOGO_BARATO = {
  largura: LARGURA_JB, altura: 1000, fundo: png64('fundo-arte.png'),
  camadas({ titulo, preco, condicao, capa, tipo }) {
    const c = [h('div', {
      position: 'absolute', left: 33, top: 212, width: 1040,
      color: AZUL_TEXTO, fontFamily: 'Saira', fontSize: tamanhoTitulo(titulo), lineHeight: 1.25
    }, titulo)];
    // Capa em pé ocupa a altura toda; produto deitado (console, bundle) usa a largura
    // toda e fica um pouco abaixo do meio, como no Photoshop
    if (tipo) c.push(capaImg(capa, tipo, { left: 130, top: 343, width: 940, height: 527, vertical: 0.66 }));
    if (preco) {
      // Medidas copiadas da arte do Photoshop (texto alinhado à direita)
      const p = PRECO_JB;
      const linha = (txt, { top, size, espaco = 0, direita }) => h('div', {
        position: 'absolute', right: LARGURA_JB - direita, top, color: '#fff',
        fontFamily: 'Teko', fontSize: size, lineHeight: 1, letterSpacing: espaco, whiteSpace: 'nowrap'
      }, txt);
      // Preço muito comprido diminui pra caber na caixa
      const tamPreco = Math.round(p.preco.size * Math.min(1, 13 / (preco.length + 3)));
      c.push(linha('a partir de', p.apartir));
      c.push(linha('R$ ' + preco, { ...p.preco, top: p.preco.top + (p.preco.size - tamPreco) / 2, size: tamPreco }));
      c.push(linha(condicao, p.condicao));
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
