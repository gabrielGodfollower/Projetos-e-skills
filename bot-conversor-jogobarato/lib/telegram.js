// Chamadas à API de bots do Telegram. O token vem só das variáveis de ambiente.
export async function tg(metodo, dados) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error('Falta a variável TELEGRAM_BOT_TOKEN');
  const r = await fetch(`https://api.telegram.org/bot${token}/${metodo}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(dados)
  });
  const j = await r.json().catch(() => ({ ok: false, description: 'resposta inválida' }));
  if (!j.ok) {
    const erro = new Error(`${metodo}: ${j.description}`);
    erro.descricao = j.description || '';
    throw erro;
  }
  return j.result;
}
