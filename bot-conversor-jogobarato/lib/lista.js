// /lista: transforma um rascunho rápido de várias ofertas no texto da lista no padrão
// do Jogo Barato. Cada bloco (separado por linha em branco) é uma oferta:
//
//   Until Dawn 1 + 2
//   PRIMEGAME5
//   https://jogobara.to/4alYX
//   408,40 no Pix
//   429,90 em até 8x
//   Frete Grátis
//
// vira "*Until Dawn 1 + 2*", "🎟 Cupom: PRIMEGAME5", "👉 link", "• R$ 408,40 no Pix"...
// As ofertas saem do menor para o maior preço. Um bloco sem link e sem preço no começo
// é o título; sem título, o bot monta "[Loja] Jogos em promoção" pela loja do link.
// Também serve para uma oferta copiada de outro grupo (🔥 R$ 501,36 à vista, 💳 ...,
// "* KaBuM!" como nome de cada loja): os emojis dos outros saem e entra o padrão daqui.

const LINK = /(https?:\/\/\S+|\b(?:www\.|jogobara\.to\/)\S+)/i;
const VALOR = /^(?:R\$\s*)?(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{1,2}))?(?![\d.,])\s*(.*)$/i;

const limpar = l => l.replace(/^[\p{Extended_Pictographic}️•▪●➔➡👉🎟\-*\s]+/u, '').replace(/[*_~]/g, '').trim();

function reais(inteiro, centavos) {
  const v = parseFloat(inteiro.replace(/\./g, '') + '.' + (centavos || '0').padEnd(2, '0'));
  const [r, c] = v.toFixed(2).split('.');
  return { valor: v, txt: 'R$ ' + r.replace(/\B(?=(\d{3})+$)/g, '.') + ',' + c };
}

// "no pix", "pix", "à vista", "8x", "em até 8x", "10x sem juros"
// Um complemento entre parênteses fica: "(ou em 15x no cartão Mercado Pago)"
function condicao(resto) {
  const extra = (resto.match(/\([^)]*\)/) || [''])[0];
  const t = resto.replace(extra, ' ').trim();
  let c = t;
  if (!t) c = '';
  else if (/pix/i.test(t)) c = 'no Pix';
  else if (/[àa]\s*vista/i.test(t)) c = 'à vista';
  else {
    const x = t.match(/(\d+)\s*x/i);
    if (x) c = `em até ${x[1]}x` + (/sem juros/i.test(t) ? ' sem juros' : '');
  }
  return [c, extra].filter(Boolean).join(' ');
}

function lerBloco(bloco) {
  const o = { nome: '', cupom: '', link: '', precos: [], frete: false, outras: [], setaSemLink: false };
  for (const bruta of bloco.split('\n')) {
    let l = limpar(bruta);
    // "👉" sozinho: o link se perdeu ao copiar a oferta de outro grupo
    if (!l) { if (/👉/.test(bruta)) o.setaSemLink = true; continue; }
    const link = l.match(LINK);
    if (link) {
      o.link = o.link || link[0];
      l = l.replace(link[0], ' ').replace(/link:?/i, ' ').replace(/\s+/g, ' ').replace(/[\s:–—-]+$/, '').trim();
      if (l.length < 3) continue;
    }
    // Vários preços na mesma linha: "408,40 pix / 429,90 8x"
    const partes = l.split(/\s*[/|]\s*/);
    const valores = partes.map(p => p.match(VALOR)).filter(Boolean);
    if (valores.length === partes.length && !/^\d+\s*x/i.test(l)) {
      for (const m of valores) {
        const r = reais(m[1], m[2]);
        o.precos.push({ ...r, cond: condicao(m[3]) });
      }
      continue;
    }
    if (/^frete\s+gr[aá]tis$/i.test(l)) { o.frete = true; continue; }
    const cupom = l.match(/^cupom:?\s*(\S+)$/i);
    if (cupom) { o.cupom = cupom[1]; continue; }
    // Código solto em maiúsculas (com número), como PRIMEGAME5
    if (o.nome && /^[A-Z0-9]{4,20}$/.test(l) && /\d/.test(l) && /[A-Z]/.test(l)) { o.cupom = l; continue; }
    if (!o.nome) o.nome = l;
    else o.outras.push(l);
  }
  return o;
}

// Loja pelo endereço final do link (o jogobara.to redireciona para a loja)
const LOJAS = [
  [/amazon\./, 'Amazon'], [/kabum\./, 'KaBuM!'], [/mercadoli[vb]re\.|meli\./, 'Mercado Livre'], [/magazineluiza\.|magalu\./, 'Magalu'],
  [/nuuvem\./, 'Nuuvem'], [/casasbahia\./, 'Casas Bahia'], [/americanas\./, 'Americanas'], [/shopee\./, 'Shopee'],
  [/aliexpress\./, 'AliExpress'], [/playstation\.com/, 'PlayStation Store'], [/nintendo\./, 'Nintendo eShop'], [/steampowered\./, 'Steam']
];
export function nomeDaLoja(url) {
  const l = LOJAS.find(([re]) => re.test(url));
  return l ? l[1] : '';
}

export async function lojaDoLink(url) {
  if (!url) return '';
  const direta = nomeDaLoja(url);
  if (direta) return direta;
  try {
    const r = await fetch(url.startsWith('http') ? url : 'https://' + url, { redirect: 'manual', signal: AbortSignal.timeout(4000) });
    return nomeDaLoja(r.headers.get('location') || '');
  } catch {
    return '';
  }
}

// Links escondidos no texto (text_link do Telegram, como num "👉" com link) entram
// no texto, para o rascunho não perder o link ao ser lido linha por linha
export function comLinks(texto, entities = []) {
  const links = entities.filter(e => e.type === 'text_link' && e.url).sort((a, b) => b.offset - a.offset);
  for (const e of links) {
    const fim = e.offset + e.length;
    if (texto.slice(e.offset, fim).includes(e.url)) continue;
    texto = texto.slice(0, fim) + ' ' + e.url + texto.slice(fim);
  }
  return texto;
}

// Devolve { texto, entities, ofertas, semLink } com os nomes em negrito, ou null se não achar oferta
export function montarLista(rascunho, { loja = '' } = {}) {
  const blocos = rascunho.replace(/\r/g, '').split(/\n\s*\n/).map(b => b.trim()).filter(Boolean);
  let titulo = '';
  const ofertas = [];
  blocos.forEach((b, i) => {
    const o = lerBloco(b);
    if (i === 0 && !o.link && !o.precos.length && !o.cupom) { titulo = [o.nome, ...o.outras].join(' '); return; }
    // Rodapé de grupo (o nosso entra depois, pelo botão)
    if (/^(canais|grupos?) de promo[cç][oõ]es/i.test(o.nome)) return;
    if (o.nome && (o.link || o.precos.length)) ofertas.push(o);
  });
  if (!ofertas.length) return null;
  const menor = o => (o.precos.length ? Math.min(...o.precos.map(p => p.valor)) : Infinity);
  ofertas.sort((a, b) => menor(a) - menor(b));
  if (!titulo) titulo = (loja ? `[${loja}] ` : '') + 'Jogos em promoção';

  let texto = titulo;
  const entities = [];
  for (const o of ofertas) {
    texto += '\n\n';
    entities.push({ type: 'bold', offset: texto.length, length: o.nome.length });
    texto += o.nome;
    if (o.cupom) texto += `\n🎟 Cupom: ${o.cupom}`;
    if (o.link) texto += `\n👉 ${o.link}`;
    else if (o.setaSemLink) texto += '\n👉';
    for (const p of o.precos) texto += `\n• ${p.txt}${p.cond ? ' ' + p.cond : ''}`;
    if (o.frete) texto += '\n• Frete Grátis';
    for (const l of o.outras) texto += '\n• ' + l;
  }
  return { texto, entities, ofertas: ofertas.length, semLink: ofertas.filter(o => !o.link).map(o => o.nome) };
}
