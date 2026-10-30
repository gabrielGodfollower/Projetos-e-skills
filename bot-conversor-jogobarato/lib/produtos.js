// Ofertas com vários produtos no mesmo texto, separados como o conversor em HTML
// do Jogo Barato (25.html) faz: cada bloco (separado por linha em branco) com uma
// linha de nome e um preço é um produto. Com dois ou mais, a arte vira colagem.
import { precoPrincipal } from './arte.js';

export const semAcento = t => t.normalize('NFD').replace(/[̀-ͯ]/g, '');
export const palavras = t => semAcento(t.toLowerCase()).replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(Boolean);

// Plataforma: um código e o trecho reconhecido
const PLATAFORMAS = [
  ['ps5', /\b(ps\s?5|playstation\s?5)\b/i],
  ['ps4', /\b(ps\s?4|playstation\s?4)\b/i],
  ['switch2', /\b(nintendo\s+)?switch\s?2\b/i],
  ['switch', /\b(nintendo\s+)?switch\b/i],
  ['xseries', /\bxbox\s+series(\s+[xs](\s*[|/]\s*[xs])?)?\b|\bxsx\b/i],
  ['xone', /\bxbox\s+one\b/i],
  ['pc', /\b(pc|steam)\b/i]
];
// Todas as plataformas citadas num trecho (ex.: "PS4 / PS5" → ps5, ps4)
export function plataformasEm(t) {
  const achadas = [];
  let resto = t;
  for (const [id, re] of PLATAFORMAS) {
    const m = resto.match(re);
    if (m) { achadas.push({ id, trecho: m[0] }); resto = resto.replace(m[0], ' '); }
  }
  return achadas;
}
export function acharPlataforma(t) {
  for (const [id, re] of PLATAFORMAS) { const m = t.match(re); if (m) return { id, trecho: m[0] }; }
  return null;
}

const RE_EMOJI_INICIO = /^[\p{Extended_Pictographic}•▪●➔➡]/u;
const limparLinha = l => l.replace(/[*_~`]/g, '').trim();
const semLoja = t => t.replace(/^\s*\[[^\]]*\]\s*/, '').trim();

// Linha que é só o nome de uma plataforma, como "[PS5]", "PS5:" ou "[Nintendo Switch 2 - Pré-Venda]"
function rotuloPlataforma(l) {
  const t = limparLinha(l).replace(RE_EMOJI_INICIO, '').trim();
  if (!t || t.length > 50 || /R\$|https?:|www\.|jogobara/i.test(t)) return null;
  const sem = t.replace(/^\[|\]$/g, '').replace(/:$/, '').trim();
  const pl = acharPlataforma(sem);
  if (!pl) return null;
  const resto = sem.replace(pl.trecho, ' ')
    .replace(/pr[eé][\s-]?venda|lan[cç]amento|vers[aã]o|edi[cç][aã]o|m[ií]dia\s+f[ií]sica|f[ií]sic[ao]|digital|[-–—:()\[\]/|]/gi, ' ').trim();
  return (resto.match(/[A-Za-zÀ-ú]/g) || []).length < 3 ? pl : null;
}

function linhaDeNome(l) {
  const t = limparLinha(l);
  if (rotuloPlataforma(l)) return false;
  if (!/[A-Za-zÀ-ú]{3}/.test(t) || /R\$\s*\d/.test(t)) return false;
  if (RE_EMOJI_INICIO.test(t) || /^[-•·>]/.test(t)) return false;
  if (/^(https?:\/\/|www\.|jogobara\.to)/i.test(t)) return false;
  if (/^(cupom|frete|aplique|use o cupom|link|pre[cç]o|parcelad|em at[eé]|no pix|[aà] vista)/i.test(semAcento(t))) return false;
  return true;
}

// Blocos que começam com o nome de uma loja são o mesmo produto em lojas diferentes
const LOJAS = ['amazon', 'amazon prime', 'mercado livre', 'meli', 'kabum', 'magalu', 'magazine luiza', 'americanas', 'casas bahia',
  'ponto', 'ponto frio', 'extra', 'submarino', 'shopee', 'aliexpress', 'shein', 'carrefour', 'fast shop', 'fastshop', 'girafa',
  'pichau', 'terabyte', 'terabyteshop', 'nuuvem', 'steam', 'epic games', 'epic games store', 'gog', 'playstation store', 'ps store',
  'psn', 'xbox store', 'microsoft store', 'nintendo eshop', 'eshop', 'walmart', 'best buy', 'bestbuy', 'saraiva', 'livraria cultura',
  'zoom', 'buscape', 'leroy merlin', 'samsung', 'apple', 'dell', 'lenovo', 'positivo', 'efacil', 'gazin', 'havan', 'netshoes',
  'centauro', 'dafiti', 'renner', 'riachuelo', 'c&a', 'cea', 'tiktok shop', 'temu', 'kalunga', 'loja oficial', 'site oficial'];
function ehLoja(nome) {
  const t = semAcento(nome.toLowerCase()).replace(/\(.*?\)|\[.*?\]/g, ' ').replace(/[^a-z0-9& ]+/g, ' ').replace(/\s+/g, ' ').trim();
  return LOJAS.includes(t);
}

// Preço de um bloco com a mesma regra da arte (menor valor, sem cupom, frete nem parcela)
function precoDoBloco(b) {
  const { preco, condicao } = precoPrincipal(b);
  if (!preco) return null;
  return { preco, valor: parseFloat(preco.replace(/\./g, '').replace(',', '.')), avista: condicao === 'à vista' };
}

const blocos = txt => txt.replace(/\r/g, '').split(/\n\s*\n/);

// Produtos da oferta: [{ nome, preco, valor, avista, bloco }]. Com menos de dois, devolve []
export function produtosDoTexto(txt) {
  const res = [];
  for (const b of blocos(txt)) {
    if (!/R\$\s*\d/.test(b)) continue;
    const nomeL = b.split('\n').map(l => l.trim()).filter(Boolean).find(linhaDeNome);
    const p = nomeL && precoDoBloco(b);
    if (!p) continue;
    const nome = semLoja(limparLinha(nomeL));
    if (nome) res.push({ nome, ...p, bloco: b });
  }
  // Lojas não contam como produtos; nomes repetidos também são o mesmo produto
  const produtos = res.filter(p => !ehLoja(p.nome));
  if (new Set(produtos.map(p => semAcento(p.nome.toLowerCase()))).size >= 2) return produtos;
  // Sem vários produtos por nome: procura versões por plataforma ("👉 PS5: link")
  return versoesPorPlataforma(txt);
}

// Um jogo com links por plataforma vira uma capa por versão. O preço de cada versão é o do
// bloco onde o link aparece (links seguidos sem preço dividem o preço que vem logo depois).
function versoesPorPlataforma(txt) {
  const primeira = semLoja(limparLinha(txt.split('\n').map(l => l.trim()).find(Boolean) || ''));
  const base = primeira
    .replace(/^(pr[eé][\s-]?venda(\s+global)?|lan[cç]amento|oferta|promo[cç][aã]o)(\s+(de|do|da|dos|das))?\s+/i, '')
    .replace(/[.!:]+$/, '').trim()
    // "(PS4 / PS5)" no título não faz parte do nome de cada versão
    .replace(/\s*[(\[]([^()\[\]]*)[)\]]/g, (m, g) => (plataformasEm(g).length ? '' : m)).trim();
  if (!base) return [];
  const versoes = new Map();
  let pendentes = [];
  for (const b of blocos(txt)) {
    for (const l of b.split('\n')) {
      const rot = rotuloPlataforma(l);
      if (rot) { pendentes.push(rot.trecho); continue; }
      const m = limparLinha(l).replace(RE_EMOJI_INICIO, '').trim().match(/^([^:]{2,30}):\s*(https?:\/\/|www\.|jogobara\.to|\S+\.\S+\/)/i);
      if (!m) continue;
      const plat = acharPlataforma(m[1]);
      if (plat && plat.trecho.length >= m[1].trim().length - 9) pendentes.push(m[1].trim());
    }
    if (!pendentes.length || !/R\$\s*\d/.test(b)) continue;
    const p = precoDoBloco(b);
    if (!p) continue;
    for (const rotulo of pendentes) {
      const id = acharPlataforma(rotulo).id;
      const atual = versoes.get(id);
      if (!atual || p.valor < atual.valor) versoes.set(id, { nome: `${base} (${rotulo})`, ...p, bloco: b });
    }
    pendentes = [];
  }
  return versoes.size >= 2 ? [...versoes.values()] : [];
}

// A primeira linha só serve de título da colagem quando não é o nome de um dos produtos
export function primeiraLinhaEhProduto(txt, produtos) {
  const t = semLoja(limparLinha(txt.split('\n').map(l => l.trim()).find(Boolean) || ''));
  return !t || produtos.some(p => p.nome === t);
}

// O produto mais barato decide o preço da arte e se sai "parcelado"
export function maisBarato(produtos) {
  return produtos.reduce((a, b) => (b.valor < a.valor ? b : a));
}
