// Publicação pelo script do Google (Apps Script) que o conversor em HTML do Jogo Barato
// (27.html) usa: WhatsApp pelas campanhas do SendFlow, Bluesky, Threads, Facebook, X
// e o histórico compartilhado da equipe.
// Configuração na Vercel:
//   SF_SCRIPT_URL: o endereço do script (o mesmo das Configurações do conversor em HTML)
//   SF_SCRIPT_SENHA: a senha de quem publica (a mesma do conversor em HTML); o que o bot
//     publicar entra no histórico dessa pessoa
// Sem as duas, o botão "🚀 Publicar" não aparece.
import { Resvg } from '@resvg/resvg-js';

export function scriptLigado() {
  return Boolean(process.env.SF_SCRIPT_URL && process.env.SF_SCRIPT_SENHA);
}

// O script responde { ok, erro, ... }. text/plain é o que o Google aceita sem checagem prévia.
export async function chamarScript(dados, { tempo = 50000 } = {}) {
  if (!scriptLigado()) throw new Error('falta configurar SF_SCRIPT_URL e SF_SCRIPT_SENHA na Vercel');
  let r;
  try {
    r = await fetch(process.env.SF_SCRIPT_URL.trim(), {
      method: 'POST',
      headers: { 'content-type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ senha: process.env.SF_SCRIPT_SENHA, ...dados }),
      redirect: 'follow',
      signal: AbortSignal.timeout(tempo)
    });
  } catch (e) {
    throw new Error(e.name === 'TimeoutError' ? 'o script demorou demais para responder' : 'não deu para falar com o script (' + e.message + ')');
  }
  let j;
  try { j = JSON.parse(await r.text()); } catch {
    throw new Error('o script respondeu algo inesperado (ele está implantado como "App da Web" com acesso para "Qualquer pessoa"?)');
  }
  if (!j.ok && j.erro) throw new Error(j.erro);
  return j;
}

// Redes que o script publica, na ordem dos botões. "max" é o limite de caracteres do texto.
export const REDES = {
  bluesky: { nome: 'Bluesky', max: 300 },
  threads: { nome: 'Threads', max: 500 },
  facebook: { nome: 'Facebook', max: 63206 },
  x: { nome: 'X', max: 25000 }
};

// Quem é a pessoa da senha e quais redes estão conectadas, guardado por alguns minutos
// (as campanhas também), para os botões não chamarem o script a cada toque
const CACHE_MS = 5 * 60 * 1000;
let conta = null, campanhasCache = null;

export async function entrar({ atualizar = false } = {}) {
  if (!atualizar && conta && Date.now() - conta.t < CACHE_MS) return conta.j;
  const j = await chamarScript({ acao: 'entrar' }, { tempo: 20000 });
  conta = { t: Date.now(), j };
  return j;
}

export function redesConectadas(j) {
  return Object.keys(REDES).filter(r => j && j.redes && j.redes[r]);
}

export async function campanhas({ atualizar = false } = {}) {
  if (!atualizar && campanhasCache && Date.now() - campanhasCache.t < CACHE_MS) return campanhasCache.lista;
  const j = await chamarScript({ acao: 'campanhas', atualizar }, { tempo: 20000 });
  campanhasCache = { t: Date.now(), lista: j.campanhas || [] };
  return campanhasCache.lista;
}

export function esquecerCache() { conta = null; campanhasCache = null; }

// ---------- texto curto das redes (igual ao gerarTextoCurto do 27.html) ----------
const segmentador = new Intl.Segmenter('pt', { granularity: 'grapheme' });
export const contarCaracteres = t => [...segmentador.segment(t)].length;
const cortarCaracteres = (t, n) => [...segmentador.segment(t)].map(x => x.segment).slice(0, n).join('');

// Texto do WhatsApp sem *negrito*, _itálico_ e ~riscado~ (os links ficam como estão)
const RE_LINK = /(https?:\/\/\S+|\b(?:[a-z0-9-]+\.)+[a-z]{2,}\/\S+)/gi;
export function textoPlano(wa) {
  return wa.split(RE_LINK).map((pedaco, i) => (i % 2 ? pedaco : pedaco.replace(/([*_~])(\S(?:[^\n]*?\S)?)\1/g, '$2')))
    .join('').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

// O mesmo cupom repetido em vários blocos vira uma linha só, logo depois do título
function juntarCupons(t) {
  const linhas = t.split('\n');
  const vezes = {};
  linhas.forEach(l => { const k = l.trim(); if (/cupom\s*:/i.test(k)) vezes[k] = (vezes[k] || 0) + 1; });
  const repetidos = Object.keys(vezes).filter(k => vezes[k] > 1);
  if (!repetidos.length) return t;
  const resto = linhas.filter(l => !repetidos.includes(l.trim())).join('\n').replace(/\n{3,}/g, '\n\n').trim();
  const i = resto.indexOf('\n\n');
  const bloco = repetidos.join('\n');
  return i < 0 ? resto + '\n\n' + bloco : resto.slice(0, i) + '\n\n' + bloco + resto.slice(i);
}

// Para caber: 1º tira o "https://" dos links; 2º o "até" do parcelado; 3º junta cupons repetidos
const ENCURTAR = [
  t => t.replace(/https?:\/\//gi, ''),
  t => t.replace(/\bem até (\d+ ?x)/gi, 'em $1'),
  juntarCupons
];

// Usa o texto inteiro quando cabe; senão, título + preços + cupom + link.
// "produtos": [{ nome, precoTxt, bloco }] quando a oferta tem vários produtos
export function textoCurto(plano, limite, produtos = []) {
  for (const encurtar of ENCURTAR) {
    if (contarCaracteres(plano) <= limite) return plano;
    plano = encurtar(plano);
  }
  if (contarCaracteres(plano) <= limite) return plano;
  const linhas = plano.split('\n').map(l => l.trim()).filter(Boolean);
  const ehLink = l => /(https?:\/\/|\b[a-z0-9-]+\.[a-z]{2,}\/)\S+/i.test(l);
  // Vários produtos: título e um item por produto (nome, preço e link) enquanto couber
  if (produtos.length > 1) {
    const linkDe = t => ((t || '').match(/(https?:\/\/\S+|\b(?:[a-z0-9-]+\.)+[a-z]{2,}\/\S+)/i) || [''])[0];
    const cupom = linhas.find(l => /cupom\s*:/i.test(l));
    const titulo = (linhas[0] || '') + (cupom && cupom !== linhas[0] ? '\n' + cupom : '');
    const itens = produtos.map(pr => ENCURTAR.reduce((t, f) => f(t), ['•', pr.nome, pr.precoTxt ? '– ' + pr.precoTxt : '', linkDe(pr.bloco)].filter(Boolean).join(' ')));
    let txt = titulo;
    for (let i = 0; i < itens.length; i++) {
      const falta = itens.length - i - 1;
      const extra = falta ? `\n+ ${falta} oferta${falta > 1 ? 's' : ''} no grupo` : '';
      if (contarCaracteres(txt + '\n' + itens[i] + extra) > limite) {
        txt += `\n+ ${itens.length - i} oferta${itens.length - i > 1 ? 's' : ''} no grupo`;
        break;
      }
      txt += '\n' + itens[i];
    }
    if (contarCaracteres(txt) <= limite) return txt;
  }
  const link = linhas.find(ehLink) || '';
  const precos = linhas.filter(l => /R\$\s?\d/.test(l) && l !== link).slice(0, 2);
  let titulo = linhas.find(l => l !== link && !precos.includes(l) && !ehLink(l) && !/cupom\s*:/i.test(l)) || '';
  const cupom = linhas.find(l => /cupom\s*:/i.test(l) && l !== link && !precos.includes(l));
  const resto = precos.concat(cupom ? [cupom] : [], link ? [link] : []).join('\n');
  const max = limite - contarCaracteres(resto) - (resto ? 1 : 0);
  if (contarCaracteres(titulo) > max) titulo = cortarCaracteres(titulo, Math.max(0, max - 1)).trim() + '…';
  return [titulo, resto].filter(Boolean).join('\n');
}

// ---------- publicação ----------
// Publica a arte (JPEG) em cada destino. "destinos": { campanhas: [ids], velocidade, redes: [nomes] }.
// Devolve { resultados: [{ ok, texto, link }], posts } com os posts que podem ser apagados depois.
export async function publicar({ jpeg, legenda, textos, alt, destinos }) {
  const imagem = jpeg.toString('base64');
  const resultados = [];
  const posts = {};
  if (destinos.campanhas.length) {
    try {
      const j = await chamarScript({ acao: 'enviar', imagem, legenda, campanhas: destinos.campanhas, velocidade: destinos.velocidade || 'none' });
      for (const x of j.resultados || []) resultados.push({ ok: !!x.ok, texto: 'WhatsApp · ' + x.nome + (x.ok ? '' : ': ' + x.erro) });
      if (!(j.resultados || []).length) resultados.push({ ok: false, texto: 'WhatsApp: o script não confirmou nenhuma campanha' });
    } catch (e) {
      resultados.push({ ok: false, texto: 'WhatsApp: ' + e.message });
    }
  }
  // As redes vão ao mesmo tempo, para caber no tempo do webhook
  const redes = await Promise.all(destinos.redes.map(async rede => {
    const dados = { acao: rede, imagem, texto: textos[rede] };
    if (rede === 'bluesky') dados.alt = alt;
    try {
      const j = await chamarScript(dados);
      if (j.ref && rede !== 'x') posts[rede] = [{ ref: j.ref, link: j.link || '' }];
      return { ok: true, texto: rede === 'x' ? 'X (pelo Buffer)' : REDES[rede].nome, link: j.link };
    } catch (e) {
      return { ok: false, texto: REDES[rede].nome + ': ' + e.message };
    }
  }));
  return { resultados: resultados.concat(redes), posts };
}

// Miniatura de 120x100 para o histórico (como a do conversor em HTML)
export function miniatura(jpeg) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="100"><rect width="120" height="100" fill="#fff"/>` +
    `<image x="4" y="4" width="112" height="92" preserveAspectRatio="xMidYMid meet" href="data:image/jpeg;base64,${jpeg.toString('base64')}"/></svg>`;
  return Buffer.from(new Resvg(svg).render().asPng()).toString('base64');
}

// Registra a oferta publicada no histórico compartilhado (com a miniatura da arte)
export async function registrarNoHistorico({ entrada, saida, rodape, posts, jpeg }) {
  const item = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), t: Date.now(), sentido: 'tg-wa', rodape, entrada, saida, arte: { tam: 100, x: 0, y: 0 }, posts };
  const j = await chamarScript({ acao: 'hist-salvar', item }, { tempo: 20000 });
  const id = (j.item && j.item.id) || item.id;
  if (jpeg) await chamarScript({ acao: 'hist-imagens', id, mini: miniatura(jpeg), fotos: [], arte: item.arte }, { tempo: 20000 });
  return id;
}
