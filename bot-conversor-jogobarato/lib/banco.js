// Banco de capas do Jogo Barato: uma pasta pública do Google Drive com as capas dos
// jogos, com nomes como "Persona 4 Revival (PS5) (BR).png". A busca é a mesma do
// conversor em HTML (25.html): compara as palavras do nome, filtra pela plataforma
// e prefere os países na ordem de BANCO_PAISES. A pasta e a chave da API do Google
// ficam só nas variáveis da Vercel (BANCO_DRIVE_PASTA e BANCO_DRIVE_CHAVE).
import { tipoImagem } from './arte.js';
import { palavras, semAcento, plataformasEm, acharPlataforma } from './produtos.js';

const DRIVE_API = 'https://www.googleapis.com/drive/v3/files';
const PAISES_PADRAO = 'BR, LATAM, NA, EU';
const REGIOES = ['BR', 'LATAM', 'NA', 'EU', 'US', 'JP', 'UK', 'ASIA', 'AS', 'KR', 'CN', 'AR', 'MX', 'CL', 'AU', 'PT', 'ES', 'FR', 'DE', 'IT', 'CA'];

export const bancoLigado = () => Boolean(process.env.BANCO_DRIVE_PASTA && process.env.BANCO_DRIVE_CHAVE);

export function paises() {
  return (process.env.BANCO_PAISES || PAISES_PADRAO).split(/[,;\s]+/).map(x => x.trim().toUpperCase()).filter(Boolean);
}

// "Captain Tsubasa 2 World Fighters (PS5) (BR).png" → nome, plataforma, país
export function analisarArquivo(f) {
  let base = f.name.replace(/\.[a-z0-9]{2,5}$/i, '').trim();
  let regiao = '', plat = '';
  for (;;) {
    const m = base.match(/\s*[(\[]([^()\[\]]+)[)\]]\s*$/);
    if (!m) break;
    const v = m[1].trim();
    if (!regiao && REGIOES.includes(v.toUpperCase())) regiao = v.toUpperCase();
    else if (!plat && acharPlataforma(v)) plat = acharPlataforma(v).id;
    else break;
    base = base.slice(0, m.index).trim();
  }
  if (!plat) { const p = acharPlataforma(base); if (p) { plat = p.id; base = base.replace(p.trecho, ' '); } }
  return { id: f.id, arquivo: f.name, nome: base, plat, regiao, tokens: palavras(base) };
}

// O que procurar: o nome do produto (sem loja, links e parênteses), a plataforma e o
// país pedido, entre parênteses no nome ou no texto ("versão americana")
export function consultaDe(linha, contexto = '') {
  linha = linha.replace(/[*_~`]/g, '').replace(/^\s*\[[^\]]*\]\s*/, '').replace(/https?:\/\/\S+/g, ' ');
  let regiao = '';
  const grupos = [...linha.matchAll(/[(\[]([^()\[\]]+)[)\]]/g)].map(m => m[1].trim());
  grupos.forEach(g => { if (REGIOES.includes(g.toUpperCase())) regiao = g.toUpperCase(); });
  if (!regiao) {
    const t = semAcento(contexto.toLowerCase());
    if (/vers[a]o\s+(americana|norte[- ]americana|dos eua|us)\b/.test(t)) regiao = 'NA';
    else if (/vers[a]o\s+europeia\b/.test(t)) regiao = 'EU';
    else if (/vers[a]o\s+japonesa\b/.test(t)) regiao = 'JP';
    else if (/vers[a]o\s+(brasileira|nacional)\b/.test(t)) regiao = 'BR';
    else if (/vers[a]o\s+latam\b|\blatino[- ]americana\b/.test(t)) regiao = 'LATAM';
  }
  let nome = linha.replace(/[(\[][^()\[\]]*[)\]]/g, ' ');
  let plat = '';
  // A versão de cada produto vem por último: "(PS4 / PS5) (PS4)" → PS4. Grupos com várias plataformas não decidem.
  for (const g of grupos.slice().reverse()) {
    const ps = plataformasEm(g);
    if (ps.length === 1) { plat = ps[0].id; break; }
  }
  if (!plat) {
    const fora = plataformasEm(nome);
    if (fora.length === 1) { plat = fora[0].id; nome = nome.replace(fora[0].trecho, ' '); }
  }
  return { nome: nome.trim(), tokens: palavras(nome), plat, regiao };
}

// Semelhança entre os nomes: palavras em comum (0 a 1)
function semelhanca(a, b) {
  const A = new Set(a), B = new Set(b);
  if (!A.size || !B.size) return 0;
  let i = 0;
  A.forEach(t => { if (B.has(t)) i++; });
  return 2 * i / (A.size + B.size);
}

export function buscarNoBanco(arquivos, q) {
  if (!q.tokens.length) return [];
  let c = arquivos.map(f => ({ f, s: semelhanca(q.tokens, f.tokens) })).filter(x => x.s >= 0.6);
  if (q.plat) {
    const mesma = c.filter(x => x.f.plat === q.plat);
    c = mesma.length ? mesma : c.filter(x => !x.f.plat);
  }
  const ordem = paises();
  const pos = r => { const i = ordem.indexOf(r); return i < 0 ? 99 : i; };
  c.sort((a, b) => b.s - a.s || pos(a.f.regiao) - pos(b.f.regiao) || a.f.arquivo.localeCompare(b.f.arquivo));
  return c;
}

// A melhor capa: o país pedido, senão o primeiro da ordem de preferência. Onde o HTML
// mostra as opções para a pessoa escolher (empate sem país), aqui vai a primeira
export function escolherDoBanco(q, cands) {
  if (!cands.length) return null;
  const top = cands.filter(x => x.s >= cands[0].s - 0.05);
  if (q.regiao) { const r = top.find(x => x.f.regiao === q.regiao); if (r) return r.f; }
  for (const pais of paises()) { const r = top.find(x => x.f.regiao === pais); if (r) return r.f; }
  return (top.find(x => x.f.regiao) || top[0]).f;
}

// Lista da pasta, guardada por 10 minutos (/banco atualiza na hora)
const VALIDADE = 10 * 60 * 1000;
let lista = null;
export async function listarBanco({ atualizar = false } = {}) {
  if (!bancoLigado()) return [];
  if (!atualizar && lista && Date.now() - lista.t < VALIDADE) return lista.arquivos;
  const { BANCO_DRIVE_PASTA: pasta, BANCO_DRIVE_CHAVE: chave } = process.env;
  const todos = [];
  let pagina = '';
  try {
    do {
      const q = `'${pasta}' in parents and trashed = false and mimeType contains 'image/'`;
      const url = `${DRIVE_API}?q=${encodeURIComponent(q)}&fields=${encodeURIComponent('nextPageToken,files(id,name)')}&pageSize=1000&key=${encodeURIComponent(chave)}`
        + (pagina ? '&pageToken=' + encodeURIComponent(pagina) : '');
      const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(`Google Drive respondeu ${r.status}${j.error && j.error.message ? ': ' + j.error.message : ''}`);
      }
      const j = await r.json();
      todos.push(...(j.files || []));
      pagina = j.nextPageToken || '';
    } while (pagina);
  } catch (e) {
    // Sem conexão com o Drive: segue com a lista da última vez, se tiver
    if (lista) { console.error(e); return lista.arquivos; }
    throw e;
  }
  lista = { t: Date.now(), arquivos: todos.map(analisarArquivo) };
  return lista.arquivos;
}

// Capas baixadas ficam na memória enquanto a função da Vercel estiver acordada
const capas = new Map();
export async function baixarDoBanco(id) {
  if (capas.has(id)) return capas.get(id);
  const urls = [
    `${DRIVE_API}/${encodeURIComponent(id)}?alt=media&key=${encodeURIComponent(process.env.BANCO_DRIVE_CHAVE || '')}`,
    `https://lh3.googleusercontent.com/d/${encodeURIComponent(id)}=w2000`
  ];
  for (const u of urls) {
    try {
      const r = await fetch(u, { signal: AbortSignal.timeout(10000) });
      if (!r.ok) continue;
      const buf = Buffer.from(await r.arrayBuffer());
      if (!tipoImagem(buf)) continue;
      if (capas.size >= 16) capas.delete(capas.keys().next().value);
      capas.set(id, buf);
      return buf;
    } catch (e) {
      console.error(e);
    }
  }
  return null;
}

// Capa de um produto: { arquivo, capa } ou null se não tiver no banco
export async function capaDoBanco(nome, contexto) {
  const q = consultaDe(nome, contexto);
  const f = escolherDoBanco(q, buscarNoBanco(await listarBanco(), q));
  if (!f) return null;
  const capa = await baixarDoBanco(f.id);
  return capa ? { arquivo: f.arquivo, capa } : null;
}

// Combo com "+" ("Until Dawn 1 + 2", "God of War Laufey + Ragnarök"): uma capa por jogo.
// A parte depois do "+" costuma vir sem o começo do nome, então também tenta com as
// primeiras palavras da primeira parte ("Until Dawn 2", "God of War Ragnarök") e fica
// com a melhor. Devolve [{ nome, arquivo, capa }] com as achadas, na ordem do texto,
// ou null se o nome não for um combo.
export function partesDoCombo(nome) {
  const limpo = nome.replace(/[*_~`]/g, '').replace(/^\s*\[[^\]]*\]\s*/, '');
  const partes = limpo.split(/\s+\+\s+/).map(p => p.trim()).filter(Boolean);
  return partes.length >= 2 ? partes : null;
}

export async function capasDoCombo(nome, contexto = '') {
  const partes = partesDoCombo(nome);
  if (!partes) return null;
  const arquivos = await listarBanco();
  // Começos possíveis: as palavras da primeira parte, sem o número final ("Until Dawn 1" → "Until", "Until Dawn")
  const base = partes[0].replace(/[(\[][^()\[\]]*[)\]]/g, ' ').trim().split(/\s+/);
  while (base.length && /^(\d+|[ivx]+)$/i.test(base[base.length - 1])) base.pop();
  const usados = new Set();
  const achadas = [];
  for (const [i, parte] of partes.entries()) {
    const tentativas = [parte];
    if (i > 0) for (let k = 1; k <= base.length; k++) tentativas.push(base.slice(0, k).join(' ') + ' ' + parte);
    let melhor = null;
    for (const t of tentativas) {
      const q = consultaDe(t, contexto);
      const cands = buscarNoBanco(arquivos, q).filter(x => !usados.has(x.f.id));
      const f = escolherDoBanco(q, cands);
      if (f && (!melhor || cands[0].s > melhor.s)) melhor = { f, s: cands[0].s };
    }
    if (!melhor) continue;
    usados.add(melhor.f.id);
    const capa = await baixarDoBanco(melhor.f.id);
    if (capa) achadas.push({ nome: parte, arquivo: melhor.f.arquivo, capa });
  }
  return achadas;
}
