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

// Baixa um arquivo que alguém mandou para o bot (ex.: a foto da oferta)
export async function baixarArquivo(fileId) {
  const f = await tg('getFile', { file_id: fileId });
  const r = await fetch(`https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${f.file_path}`);
  if (!r.ok) throw new Error('getFile: download falhou');
  return Buffer.from(await r.arrayBuffer());
}

// Envia uma imagem gerada pelo bot (multipart, já que não é um file_id)
export async function enviarFoto(dados, png) {
  const form = new FormData();
  for (const [k, v] of Object.entries(dados)) {
    if (v !== undefined) form.append(k, typeof v === 'object' ? JSON.stringify(v) : String(v));
  }
  form.append('photo', new Blob([png], { type: 'image/png' }), 'arte.png');
  const r = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendPhoto`, { method: 'POST', body: form });
  const j = await r.json().catch(() => ({ ok: false, description: 'resposta inválida' }));
  if (!j.ok) throw new Error(`sendPhoto: ${j.description}`);
  return j.result;
}
