// Abra uma vez no navegador depois do deploy:
//   https://SEU-PROJETO.vercel.app/api/setup?segredo=VALOR_DE_TELEGRAM_WEBHOOK_SECRET
// Ele liga o webhook do bot neste endereço e cadastra os comandos.
import { tg } from '../lib/telegram.js';

export default async function handler(req, res) {
  const segredo = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!segredo) return res.status(500).send('Configure TELEGRAM_WEBHOOK_SECRET na Vercel antes.');
  if (req.query.segredo !== segredo) return res.status(401).send('Segredo errado.');
  try {
    const url = `https://${req.headers.host}/api/telegram`;
    await tg('setWebhook', { url, secret_token: segredo, allowed_updates: ['message', 'callback_query'], drop_pending_updates: true });
    await tg('setMyCommands', {
      commands: [
        { command: 'ajuda', description: 'Como usar o conversor' },
        { command: 'id', description: 'Mostra seu ID do Telegram' },
        { command: 'sendflow', description: 'Configuração do envio pro WhatsApp' },
        { command: 'banco', description: 'Confere o banco de capas do Google Drive' }
      ]
    });
    const me = await tg('getMe', {});
    res.status(200).send(`Pronto! O bot @${me.username} está ligado em ${url}`);
  } catch (e) {
    res.status(500).send('Erro: ' + e.message);
  }
}
