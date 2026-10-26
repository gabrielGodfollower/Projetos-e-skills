// Limpa os links de uma oferta copiada de outro grupo, para a comissão não ir para eles:
// segue os redirecionamentos (amzn.to, meli.la, tidd.ly, encurtadores dos outros) até a
// loja e tira os parâmetros de afiliado. Na Amazon entra a tag do Jogo Barato, se
// AMAZON_TAG estiver na Vercel; nas outras lojas o link fica limpo, sem afiliado, e o
// bot avisa para gerar o link de afiliado de vocês.
import { nomeDaLoja } from './lista.js';

const NOSSOS = /^(?:[\w-]+\.)*(?:jogobara\.to|jogobarato\.com\.br|t\.me|telegram\.me|wa\.me|whatsapp\.com|chat\.whatsapp\.com)$/i;

const url = t => new URL(/^https?:\/\//i.test(t) ? t : 'https://' + t);
const ehNosso = t => { try { return NOSSOS.test(url(t).hostname); } catch { return true; } };
// Encurtadores das próprias lojas (meli.la, mercadolivre.com/sec/...) ainda não são a loja
const ehLoja = t => {
  try {
    const u = url(t);
    if (/^(meli\.la|amzn\.to|a\.co)$/i.test(u.hostname) || /^\/sec\//.test(u.pathname)) return false;
    return Boolean(nomeDaLoja(u.hostname + '/'));
  } catch {
    return false;
  }
};

// Redirecionadores de afiliado que levam o destino num parâmetro (Awin, Lomadee...)
function destinoNoParametro(u) {
  for (const p of ['ued', 'url', 'u', 'murl', 'destination', 'dest', 'redirect', 'to']) {
    const v = u.searchParams.get(p);
    if (v && /^https?:\/\//i.test(v)) return v;
  }
  return null;
}

// Segue até chegar numa loja (no máximo 6 saltos)
async function ateALoja(link) {
  let atual = link;
  for (let i = 0; i < 6 && !ehLoja(atual); i++) {
    const noParam = destinoNoParametro(url(atual));
    if (noParam) { atual = noParam; continue; }
    let r;
    try {
      r = await fetch(url(atual), { redirect: 'manual', signal: AbortSignal.timeout(5000), headers: { 'user-agent': 'Mozilla/5.0' } });
    } catch {
      return atual;
    }
    const prox = r.headers.get('location');
    if (!prox || r.status < 300 || r.status >= 400) return atual;
    atual = new URL(prox, url(atual)).toString();
  }
  return atual;
}

// O link da loja sem afiliado. Amazon: só /dp/ASIN (+ a nossa tag)
export function semAfiliado(link, { amazonTag = process.env.AMAZON_TAG || '' } = {}) {
  const u = url(link);
  if (/amazon\./i.test(u.hostname)) {
    const asin = u.pathname.match(/\/(?:dp|gp\/product|gp\/aw\/d|d)\/([A-Z0-9]{10})(?:[/?]|$)/i);
    if (asin) return `https://${u.hostname}/dp/${asin[1].toUpperCase()}` + (amazonTag ? `?tag=${encodeURIComponent(amazonTag)}` : '');
    for (const p of [...u.searchParams.keys()]) if (/^(tag|ascsubtag|linkcode|linkid|ref_?|camp|creative|creativeasin|smid|psc|th)$/i.test(p)) u.searchParams.delete(p);
    if (amazonTag) u.searchParams.set('tag', amazonTag);
    u.hash = '';
    return u.toString();
  }
  // Nas outras lojas o produto não precisa de parâmetro nenhum
  return `${u.protocol}//${u.hostname}${u.pathname}`;
}

// { link, loja, comissao } — comissao: true quando o link já leva a tag do Jogo Barato.
// Link nosso fica como está; sem chegar numa loja, devolve null (não dá para limpar)
export async function limparLink(link) {
  if (ehNosso(link)) return { link, loja: '', comissao: true };
  const final = await ateALoja(link);
  // Página "social" do Mercado Livre é a vitrine do afiliado, não o produto
  if (!ehLoja(final) || /^\/social\//.test(url(final).pathname)) return null;
  const loja = nomeDaLoja(url(final).hostname + '/');
  const tag = process.env.AMAZON_TAG || '';
  return { link: semAfiliado(final, { amazonTag: tag }), loja, comissao: loja === 'Amazon' && Boolean(tag) };
}

// Limpa todos os links do texto. Devolve { texto, semComissao: [lojas], naoLimpos: [links] }
export async function limparLinks(texto) {
  const achados = [...new Set(texto.match(/https?:\/\/[^\s<>()]+/g) || [])];
  const res = await Promise.all(achados.map(l => limparLink(l).catch(() => null)));
  const semComissao = new Set(), naoLimpos = [];
  achados.forEach((l, i) => {
    const r = res[i];
    if (!r) { naoLimpos.push(l); return; }
    if (r.link !== l) texto = texto.split(l).join(r.link);
    if (!r.comissao) semComissao.add(r.loja);
  });
  return { texto, semComissao: [...semComissao], naoLimpos };
}
