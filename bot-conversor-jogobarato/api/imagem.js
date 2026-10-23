// Entrega a arte que o bot mandou no Telegram, para o SendFlow baixar e enviar no WhatsApp.
// Endereço: /arte/<assinatura>/<file_id>.jpg (veja linkPublicoDaFoto em lib/telegram.js)
import { timingSafeEqual } from 'node:crypto';
import { assinarArquivo, baixarArquivo } from '../lib/telegram.js';

export default async function handler(req, res) {
  const f = String(req.query.f || '').replace(/\.jpg$/, '');
  const s = String(req.query.s || '');
  const certo = assinarArquivo(f);
  if (!f || s.length !== certo.length || !timingSafeEqual(Buffer.from(s), Buffer.from(certo))) {
    return res.status(404).send('não encontrado');
  }
  try {
    const buf = await baixarArquivo(f);
    res.setHeader('content-type', buf[0] === 0x89 ? 'image/png' : 'image/jpeg');
    res.setHeader('cache-control', 'public, max-age=86400, immutable');
    res.status(200).send(buf);
  } catch (e) {
    console.error(e);
    res.status(404).send('não encontrado');
  }
}
