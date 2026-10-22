// Conversão de ofertas entre a formatação do Telegram e a do WhatsApp.
// Mesmas regras do conversor em HTML do Jogo Barato, adaptadas para o bot:
// - mensagens do Telegram chegam com "entities" (negrito, itálico, links...)
// - texto colado do WhatsApp chega cru, com *negrito*, _itálico_ e ~riscado~

// No WhatsApp o rodapé é "Grupo de Promoções do...: 👉 link"; no Telegram segue o
// padrão dos canais: "Canais de Promoções do <nome com link>", tudo em negrito
export const GRUPOS = {
  jb: {
    nome: 'Jogo Barato',
    titulo: 'Grupo de Promoções do Jogo Barato:',
    link: process.env.LINK_JB || 'https://jogobara.to/M05ex',
    linkTelegram: process.env.LINK_TG_JB || 'https://www.jogobarato.com.br/redes-sociais'
  },
  ind: {
    nome: 'JB Indica',
    titulo: 'Grupo de Promoções do JB Indica:',
    link: process.env.LINK_INDICA || 'https://jogobara.to/S3cM9',
    linkTelegram: process.env.LINK_TG_INDICA || 'https://www.jogobarato.com.br/redes-sociais'
  }
};

const FORMATOS = new Set([
  'bold', 'italic', 'underline', 'strikethrough', 'spoiler', 'code', 'pre',
  'text_link', 'blockquote', 'expandable_blockquote'
]);
const CITACAO = new Set(['blockquote', 'expandable_blockquote']);

// ---------- utilidades ----------
function protetor() {
  const slots = [];
  return {
    keep(s) { slots.push(s); return '\u0000' + (slots.length - 1) + '\u0000'; },
    restore(t) { let prev; do { prev = t; t = t.replace(/\u0000(\d+)\u0000/g, (_, i) => slots[+i]); } while (t !== prev); return t; }
  };
}
// Coloca os espaços das bordas para fora dos marcadores
function wrap(mark, inner) {
  const m = inner.match(/^(\s*)([\s\S]*?)(\s*)$/);
  if (!m[2]) return inner;
  return m[1] + mark + m[2] + mark + m[3];
}
// Regex no estilo do WhatsApp: marcador colado ao texto, com espaço/pontuação em volta
function waRegex(ch) {
  const c = '\\' + ch;
  return new RegExp('(^|[\\s(\\[{"\'«])' + c + '(\\S(?:[^' + c + '\\n]*\\S)?)' + c + '(?=$|[\\s.,!?:;)\\]}"\'»…-])', 'gm');
}
export function escHtml(s) {
  return s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

// ---------- texto com entities do Telegram ----------
function marcasWa(e, texto) {
  switch (e.type) {
    case 'bold': return ['*', '*'];
    case 'italic': return ['_', '_'];
    case 'strikethrough': return ['~', '~'];
    case 'pre': return ['```', '```'];
    case 'text_link': return texto === e.url ? ['', ''] : ['', ' (' + e.url + ')'];
    // Código em linha sai sem crases; sublinhado e spoiler não existem no WhatsApp
    default: return ['', ''];
  }
}
function marcasHtml(e) {
  switch (e.type) {
    case 'bold': return ['<b>', '</b>'];
    case 'italic': return ['<i>', '</i>'];
    case 'underline': return ['<u>', '</u>'];
    case 'strikethrough': return ['<s>', '</s>'];
    case 'spoiler': return ['<tg-spoiler>', '</tg-spoiler>'];
    case 'code': return ['<code>', '</code>'];
    case 'pre': return e.language
      ? ['<pre><code class="language-' + escHtml(e.language) + '">', '</code></pre>']
      : ['<pre>', '</pre>'];
    case 'text_link': return ['<a href="' + escHtml(e.url) + '">', '</a>'];
    case 'blockquote': return ['<blockquote>', '</blockquote>'];
    case 'expandable_blockquote': return ['<blockquote expandable>', '</blockquote>'];
    default: return ['', ''];
  }
}

// Aplica as entities ao texto. Os offsets do Telegram são em unidades UTF-16,
// que é exatamente como as strings do JavaScript são indexadas.
export function entitiesPara(destino, texto, entities = []) {
  const wa = destino === 'wa';
  const eventos = [];
  entities.forEach((e, i) => {
    if (!FORMATOS.has(e.type)) return;
    let ini = e.offset, fim = e.offset + e.length;
    if (wa && CITACAO.has(e.type)) {
      // No WhatsApp a citação é "> " no começo de cada linha
      let p = ini;
      while (p < fim) {
        eventos.push({ pos: p, abre: true, str: '> ', fimEnt: Infinity, i: -1 });
        const nl = texto.indexOf('\n', p);
        if (nl < 0 || nl + 1 >= fim) break;
        p = nl + 1;
      }
      return;
    }
    if (wa) {
      // O WhatsApp só reconhece o marcador colado no texto
      while (ini < fim && /\s/.test(texto[ini])) ini++;
      while (fim > ini && /\s/.test(texto[fim - 1])) fim--;
      if (ini >= fim) return;
    }
    const [a, f] = wa ? marcasWa(e, texto.slice(ini, fim)) : marcasHtml(e);
    if (!a && !f) return;
    eventos.push({ pos: ini, abre: true, str: a, fimEnt: fim, i });
    eventos.push({ pos: fim, abre: false, str: f, iniEnt: ini, i });
  });
  // Na mesma posição: primeiro fecha (o mais interno antes), depois abre (o mais externo antes)
  eventos.sort((x, y) => x.pos - y.pos
    || (x.abre === y.abre ? 0 : x.abre ? 1 : -1)
    || (x.abre ? (y.fimEnt - x.fimEnt) || (x.i - y.i) : (y.iniEnt - x.iniEnt) || (y.i - x.i)));
  let out = '', pos = 0;
  const trecho = s => wa ? s : escHtml(s);
  for (const ev of eventos) {
    out += trecho(texto.slice(pos, ev.pos)) + ev.str;
    pos = ev.pos;
  }
  return out + trecho(texto.slice(pos));
}

// ---------- texto cru (digitado ou colado) ----------
// Markdown do Telegram (**negrito**, __itálico__...) → WhatsApp
export function textoParaWa(src) {
  const p = protetor();
  let t = src.replace(/\r\n/g, '\n');
  t = t.replace(/```[\s\S]*?```/g, m => p.keep(m));
  t = t.replace(/`([^`\n]+)`/g, (_, x) => p.keep(x));
  t = t.replace(/\\([_*\[\]()~`>#+\-=|{}.!\\])/g, (_, c) => p.keep(c));
  t = t.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, txt, url) => txt === url ? p.keep(url) : `${txt} (${p.keep(url)})`);
  t = t.replace(/https?:\/\/\S+/g, m => p.keep(m));
  const B = '\u0001', I = '\u0002', S = '\u0003';
  t = t.replace(/\*\*([\s\S]+?)\*\*/g, (_, x) => wrap(B, x));
  t = t.replace(/__([\s\S]+?)__/g, (_, x) => wrap(I, x));
  t = t.replace(/~~([\s\S]+?)~~/g, (_, x) => wrap(S, x));
  t = t.replace(/\|\|([\s\S]+?)\|\|/g, '$1');
  t = t.split(B).join('*').split(I).join('_').split(S).join('~');
  return p.restore(t);
}

// Texto do WhatsApp (ou markdown do Telegram) → HTML do Telegram
export function textoParaHtml(src) {
  const p = protetor();
  let t = escHtml(src.replace(/\r\n/g, '\n'));
  t = t.replace(/```([\s\S]*?)```/g, (_, x) => p.keep('<pre>' + x.replace(/^\n/, '') + '</pre>'));
  t = t.replace(/`([^`\n]+)`/g, (_, x) => p.keep('<code>' + x + '</code>'));
  t = t.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, (_, txt, url) => p.keep('<a href="' + url + '">') + txt + '</a>');
  t = t.replace(/https?:\/\/[^\s<\u0000]+/g, m => p.keep(m));
  t = t.replace(/\*\*([\s\S]+?)\*\*/g, '<b>$1</b>');
  t = t.replace(/__([\s\S]+?)__/g, '<i>$1</i>');
  t = t.replace(/~~([\s\S]+?)~~/g, '<s>$1</s>');
  t = t.replace(/\|\|([\s\S]+?)\|\|/g, '<tg-spoiler>$1</tg-spoiler>');
  t = t.replace(waRegex('*'), '$1<b>$2</b>');
  t = t.replace(waRegex('_'), '$1<i>$2</i>');
  t = t.replace(waRegex('~'), '$1<s>$2</s>');
  // Linhas seguidas começando com "> " viram uma citação só
  t = t.replace(/(?:^&gt; ?.*(?:\n|$))+/gm, m => {
    const fimLinha = m.endsWith('\n') ? '\n' : '';
    return '<blockquote>' + m.replace(/\n$/, '').replace(/^&gt; ?/gm, '') + '</blockquote>' + fimLinha;
  });
  return p.restore(t);
}

// ---------- rodapé que já veio na oferta ----------
// Ofertas encaminhadas de novo (ou copiadas do próprio bot) já trazem um rodapé
// ("Grupo de Promoções do...", "Canais de Promoções do..."). Corta a partir dele
// para não sair dois rodapés.
const RODAPE_EXISTENTE = /^[\s*_~>]*(?:grupos?|canal|canais) de promo[çc][õo]es\b/im;
export function semRodape(texto, entities = []) {
  const m = RODAPE_EXISTENTE.exec(texto);
  if (!m) return { texto, entities };
  const resto = texto.slice(m.index);
  const temLink = /jogobara\.to|jogobarato|t\.me\/|whatsapp\.com/i.test(resto)
    || entities.some(e => e.type === 'text_link' && e.offset >= m.index);
  if (!temLink) return { texto, entities };
  let corte = m.index;
  while (corte > 0 && /\s/.test(texto[corte - 1])) corte--;
  return {
    texto: texto.slice(0, corte),
    entities: entities
      .filter(e => e.offset < corte)
      .map(e => (e.offset + e.length > corte ? { ...e, length: corte - e.offset } : e))
  };
}

// ---------- detecção e montagem ----------
export function temFormatacao(entities = []) {
  return entities.some(e => FORMATOS.has(e.type));
}
// Texto cru com *negrito* de WhatsApp (e sem **negrito**) provavelmente veio do WhatsApp
export function pareceWhatsApp(texto) {
  if (/\*\*|__|~~/.test(texto)) return false;
  return ['*', '_', '~'].some(c => { const r = waRegex(c); return r.test(texto); });
}
export function sentidoPadrao(texto, entities) {
  if (temFormatacao(entities)) return 'wa';
  return pareceWhatsApp(texto) ? 'tg' : 'wa';
}

export function rodape(id, destino) {
  const g = GRUPOS[id];
  if (!g) return '';
  return destino === 'wa'
    ? '*' + g.titulo + '*\n👉 ' + g.link
    : '<b>Canais de Promoções do <a href="' + escHtml(g.linkTelegram) + '">' + escHtml(g.nome) + '</a></b>';
}

// destino: 'wa' (texto pronto para colar no WhatsApp) ou 'tg' (HTML para o Telegram)
// grupo: 'jb', 'ind' ou 'sem'
export function converter({ texto, entities, destino, grupo }) {
  let corpo;
  if (temFormatacao(entities)) corpo = entitiesPara(destino, texto, entities);
  else corpo = destino === 'wa' ? textoParaWa(texto) : textoParaHtml(texto);
  corpo = corpo.replace(/\s+$/, '');
  const r = rodape(grupo, destino);
  return r ? corpo + '\n\n' + r : corpo;
}
