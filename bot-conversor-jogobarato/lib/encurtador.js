// Encurta os links da oferta no YOURLS do Jogo Barato (jogobara.to).
// Configuração na Vercel:
//   YOURLS_SIGNATURE: o "signature token" (YOURLS > Tools > Secure passwordless API call)
//   YOURLS_API (opcional): endereço da API, padrão https://jogobara.to/yourls-api.php
// Sem YOURLS_SIGNATURE, os links ficam como estão.
import { createHash } from 'node:crypto';

// Links que já são do Jogo Barato ou de grupos não são encurtados
const NAO_ENCURTAR = /^(?:[\w-]+\.)*(?:jogobara\.to|jogobarato\.com\.br|t\.me|telegram\.me|wa\.me|whatsapp\.com)$/i;

export function encurtadorLigado() {
  return Boolean(process.env.YOURLS_SIGNATURE);
}

export function deveEncurtar(url) {
  try {
    const u = new URL(/^https?:\/\//i.test(url) ? url : 'https://' + url);
    return !NAO_ENCURTAR.test(u.hostname);
  } catch {
    return false;
  }
}

export async function encurtar(url, titulo = '') {
  const api = process.env.YOURLS_API || 'https://jogobara.to/yourls-api.php';
  // Assinatura com horário, assim o token em si nunca vai na URL
  const timestamp = Math.floor(Date.now() / 1000);
  const token = process.env.YOURLS_SIGNATURE.trim();
  const signature = createHash('md5').update(timestamp + token).digest('hex');
  const params = new URLSearchParams({
    action: 'shorturl', format: 'json', timestamp: String(timestamp), signature,
    url: /^https?:\/\//i.test(url) ? url : 'https://' + url,
    // Com título, o YOURLS não precisa abrir a página (Amazon demora ou bloqueia)
    title: titulo || 'Oferta Jogo Barato'
  });
  const r = await fetch(api, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: params,
    signal: AbortSignal.timeout(8000)
  });
  const corpo = await r.text();
  let j = {};
  try { j = JSON.parse(corpo); } catch { /* não veio JSON: provavelmente um bloqueio antes do YOURLS */ }
  // Se o link já tinha sido encurtado, o YOURLS responde "already exists" junto com o link curto
  if (j.shorturl) return j.shorturl;
  const motivo = j.message || `HTTP ${r.status}${/cloudflare|challenge|captcha/i.test(corpo) ? ' (bloqueio de proteção do site)' : ''}`;
  throw new Error('YOURLS respondeu: ' + motivo);
}

// Lista os links da mensagem na ordem em que aparecem
export function linksEmOrdem(texto, entities = []) {
  const links = [];
  for (const e of entities) {
    if (e.type === 'url') links.push({ ini: e.offset, fim: e.offset + e.length, url: texto.slice(e.offset, e.offset + e.length), tipo: 'url' });
    if (e.type === 'text_link') links.push({ ini: e.offset, fim: e.offset + e.length, url: e.url, tipo: 'text_link', entidade: e });
  }
  if (!entities.some(e => e.type === 'url')) {
    // Texto sem entities (raro): procura os links no próprio texto
    for (const m of texto.matchAll(/https?:\/\/[^\s<>()]+/g)) {
      if (!links.some(l => m.index >= l.ini && m.index < l.fim)) links.push({ ini: m.index, fim: m.index + m[0].length, url: m[0], tipo: 'texto' });
    }
  }
  return links.sort((a, b) => a.ini - b.ini);
}

// Troca os links da mensagem pelos encurtados, ajustando as posições das entities.
// "trocar" recebe o link original e devolve o novo (ou o mesmo, se não mudar).
export async function trocarLinks(texto, entities, trocar) {
  const links = linksEmOrdem(texto, entities);
  const novos = await Promise.all(links.map(l => (deveEncurtar(l.url) ? trocar(l.url) : l.url)));
  let ents = entities.map(e => ({ ...e }));
  // Do fim para o começo, para as posições anteriores não mudarem
  for (let i = links.length - 1; i >= 0; i--) {
    const l = links[i], novo = novos[i];
    if (!novo || novo === l.url) continue;
    if (l.tipo === 'text_link') {
      ents = ents.map(e => (e.type === 'text_link' && e.offset === l.ini && e.url === l.url ? { ...e, url: novo } : e));
      continue;
    }
    const delta = novo.length - (l.fim - l.ini);
    texto = texto.slice(0, l.ini) + novo + texto.slice(l.fim);
    ents = ents.map(e => {
      const fimE = e.offset + e.length;
      if (e.offset >= l.fim) return { ...e, offset: e.offset + delta };
      if (e.offset <= l.ini && fimE >= l.fim) return { ...e, length: e.length + delta };
      return e;
    });
  }
  return { texto, entities: ents };
}
