// Envio da oferta para os grupos do WhatsApp pelo SendFlow (sendapi.sendflow.pro).
// Configuração na Vercel:
//   SENDFLOW_API_KEY: a chave da API do SendFlow
//   SENDFLOW_LANCAMENTO_JB / SENDFLOW_LANCAMENTO_INDICA: o ID do lançamento com os
//     grupos de cada um (o comando /sendflow do bot lista os lançamentos e os IDs)
//   SENDFLOW_CONTA (opcional): ID da conta (número) que envia; sem isso usa a do lançamento
// Sem SENDFLOW_API_KEY, o botão "Enviar no WhatsApp" não aparece.
const API = () => (process.env.SENDFLOW_API || 'https://sendapi.sendflow.pro').replace(/\/$/, '');

export function sendflowLigado() {
  return Boolean(process.env.SENDFLOW_API_KEY);
}

export function lancamentoDoGrupo(grupo) {
  const id = { jb: process.env.SENDFLOW_LANCAMENTO_JB, ind: process.env.SENDFLOW_LANCAMENTO_INDICA }[grupo];
  return (id || '').trim();
}

// Erros do SendFlow em português, para o bot mostrar o motivo
function motivo(status, msg) {
  if (status === 401) return 'a chave da API foi recusada (confira SENDFLOW_API_KEY)';
  if (status === 403 && /limite/i.test(msg)) return 'limite de envios do SendFlow, tente de novo em alguns segundos';
  if (status === 403) return 'acesso negado pelo SendFlow (a chave ou o plano não libera a API?)' + (msg ? ': ' + msg : '');
  if (status === 404) return 'lançamento não encontrado (confira o ID)';
  if (status === 409) return 'o número do WhatsApp está desconectado no SendFlow';
  return msg || 'HTTP ' + status;
}

async function sf(metodo, caminho, dados) {
  const r = await fetch(API() + caminho, {
    method: metodo,
    headers: { authorization: 'Bearer ' + process.env.SENDFLOW_API_KEY.trim(), 'content-type': 'application/json' },
    body: dados ? JSON.stringify(dados) : undefined,
    signal: AbortSignal.timeout(10000)
  });
  const corpo = await r.text();
  let j = null;
  try { j = JSON.parse(corpo); } catch { /* resposta sem JSON */ }
  const msg = (j && (j.message || j.error || j.msg)) || '';
  if (!r.ok) throw new Error('SendFlow: ' + motivo(r.status, String(msg)));
  if (j && j.success === false) throw new Error('SendFlow: ' + (msg || 'o envio não entrou na fila'));
  return j;
}

// A API às vezes devolve a lista solta e às vezes dentro de "data"; grupos vêm em listas aninhadas
export function lista(j) {
  const l = Array.isArray(j) ? j : (j && (j.data || j.items || j.releases || j.groups)) || [];
  return (Array.isArray(l) ? l : [l]).flat(Infinity).filter(x => x && typeof x === 'object');
}

// O "id" do grupo no SendFlow às vezes é interno; o envio precisa do ID do WhatsApp (120363...)
export function idDoGrupo(g) {
  for (const v of [g.gid, g.jid, g.id]) {
    const s = String(v || '').replace(/@g\.us$/, '');
    if (/^120363\d+$/.test(s)) return s;
  }
  return null;
}

export async function lancamentos() {
  return lista(await sf('GET', '/releases')).filter(r => !r.archived);
}

export async function gruposDoLancamento(releaseId) {
  const grupos = lista(await sf('GET', `/releases/${encodeURIComponent(releaseId)}/groups`));
  return [...new Set(grupos.map(idDoGrupo).filter(Boolean))];
}

// Confere a configuração e devolve tudo o que o envio precisa
export async function prepararEnvio(grupo) {
  const releaseId = lancamentoDoGrupo(grupo);
  if (!releaseId) throw new Error(`falta o lançamento do ${grupo === 'ind' ? 'JB Indica (SENDFLOW_LANCAMENTO_INDICA)' : 'Jogo Barato (SENDFLOW_LANCAMENTO_JB)'} na Vercel`);
  let accountId = (process.env.SENDFLOW_CONTA || '').trim();
  if (!accountId) {
    const rel = (await lancamentos()).find(r => String(r.id) === releaseId);
    if (!rel) throw new Error('SendFlow: lançamento não encontrado (confira o ID com /sendflow)');
    accountId = String([].concat(rel.accountIds || rel.accountId || [])[0] || '');
    if (!accountId) throw new Error('SendFlow: o lançamento não tem número conectado');
  }
  const groupIds = await gruposDoLancamento(releaseId);
  if (!groupIds.length) throw new Error('SendFlow: o lançamento não tem grupos');
  return { accountId, releaseId, groupIds };
}

// Com imagem, a oferta vai como foto com legenda; o SendFlow baixa a imagem pelo link
export async function enviarProsGrupos({ accountId, releaseId, groupIds }, { texto, imagem }) {
  const base = { accountId, releaseId, chooseSpecificGroups: true, groupIds };
  if (imagem) await sf('POST', '/actions/send-image-message', { ...base, url: imagem, caption: texto });
  else await sf('POST', '/actions/send-text-message', { ...base, messageText: texto });
  return groupIds.length;
}
