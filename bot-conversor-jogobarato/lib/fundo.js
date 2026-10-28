// Tira o fundo da foto pelo remove.bg (botão "✂️ Tirar fundo" da arte).
// Configuração na Vercel: REMOVEBG_API_KEY, a chave criada em remove.bg > API Keys.
// Cada recorte em tamanho cheio gasta 1 crédito da conta, então só roda quando alguém
// aperta o botão. Sem a chave, o botão não aparece.
const API = 'https://api.remove.bg/v1.0/removebg';

export function removeBgLigado() {
  return Boolean(process.env.REMOVEBG_API_KEY);
}

// Erros do remove.bg em português, para o bot mostrar o motivo
function motivo(status, msg) {
  if (status === 402) return 'acabaram os créditos da conta do remove.bg';
  if (status === 403) return 'a chave foi recusada (confira REMOVEBG_API_KEY na Vercel)';
  if (status === 429) return 'muitos recortes seguidos, tente de novo em um minuto';
  return msg || 'HTTP ' + status;
}

// Devolve a foto em PNG com o fundo transparente (no tamanho cheio)
export async function tirarFundo(foto, { fetch: f = fetch } = {}) {
  const corpo = new FormData();
  corpo.append('image_file', new Blob([foto]), 'foto');
  corpo.append('size', 'auto');
  corpo.append('format', 'png');
  let r;
  try {
    r = await f(API, {
      method: 'POST',
      headers: { 'X-Api-Key': process.env.REMOVEBG_API_KEY || '' },
      body: corpo,
      signal: AbortSignal.timeout(25000) // a função da Vercel tem 60 s no total
    });
  } catch (e) {
    throw new Error(e.name === 'TimeoutError' ? 'o remove.bg demorou demais para responder' : 'não deu para falar com o remove.bg (' + e.message + ')');
  }
  if (!r.ok) {
    let msg = '';
    try { msg = ((await r.json()).errors || []).map(e => e.title).join('; '); } catch {}
    throw new Error(motivo(r.status, msg));
  }
  return Buffer.from(await r.arrayBuffer());
}
