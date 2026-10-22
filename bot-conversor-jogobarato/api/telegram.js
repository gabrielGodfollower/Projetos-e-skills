// Webhook do bot. Fluxo:
// 1. Você encaminha (ou cola) uma oferta para o bot.
// 2. O bot responde à sua mensagem com a versão convertida e botões para
//    trocar o rodapé (Jogo Barato, JB Indica, sem rodapé) e o destino
//    (WhatsApp ou Telegram).
// 3. Ao tocar num botão, o bot relê a mensagem original (a que ele respondeu)
//    e edita a resposta. Assim nada precisa ser guardado em banco de dados.
// 4. "Gerar arte" monta a imagem da oferta no fundo do Jogo Barato.
import { converter, sentidoPadrao, GRUPOS } from '../lib/conversor.js';
import { tg, baixarArquivo, enviarFoto } from '../lib/telegram.js';
import { gerarArte, dadosDaOferta, capaDoLink } from '../lib/arte.js';

const LIMITE_LEGENDA = 1024;
const LIMITE_TEXTO = 4096;
const MIDIA = ['photo', 'video', 'animation', 'document'];

const AJUDA = `Oi! Eu converto ofertas entre Telegram e WhatsApp e coloco o rodapé do grupo.

Como usar:
• Encaminhe uma oferta do Telegram para mim (pode ser com foto) ou cole o texto aqui.
• Eu respondo com o texto pronto para o WhatsApp. É só segurar a mensagem e tocar em Copiar.
• Os botões trocam o rodapé (${GRUPOS.jb.nome}, ${GRUPOS.ind.nome} ou sem rodapé) e o destino.
• Em "Para Telegram" eu mando a oferta já formatada, pronta para encaminhar no grupo.
• "Gerar arte" cria a imagem da oferta com a capa do jogo e o preço. Pra trocar a capa, responda à arte com outra foto.

Se você colar um texto do WhatsApp (com *negrito*), eu já mostro a versão para o Telegram.`;

function permitido(userId) {
  const lista = (process.env.ALLOWED_USERS || '').split(',').map(s => s.trim()).filter(Boolean);
  return !lista.length || lista.includes(String(userId));
}

function teclado(destino, grupo) {
  const marca = (ativo, txt) => (ativo ? '✅ ' : '') + txt;
  return {
    inline_keyboard: [
      [
        { text: marca(grupo === 'jb', GRUPOS.jb.nome), callback_data: `${destino}|jb` },
        { text: marca(grupo === 'ind', GRUPOS.ind.nome), callback_data: `${destino}|ind` },
        { text: marca(grupo === 'sem', 'Sem rodapé'), callback_data: `${destino}|sem` }
      ],
      [
        { text: marca(destino === 'wa', 'Para WhatsApp'), callback_data: `wa|${grupo}` },
        { text: marca(destino === 'tg', 'Para Telegram'), callback_data: `tg|${grupo}` }
      ],
      [{ text: '🖼 Gerar arte', callback_data: `arte|${destino}|${grupo}` }]
    ]
  };
}

function conteudo(msg) {
  if (typeof msg.text === 'string') return { texto: msg.text, entities: msg.entities || [], midia: false };
  if (typeof msg.caption === 'string') return { texto: msg.caption, entities: msg.caption_entities || [], midia: true };
  return null;
}

// No Telegram mantém a prévia do link como na oferta original; no WhatsApp tira, pra copiar mais fácil
function previa(original, destino) {
  if (destino !== 'tg') return { is_disabled: true };
  return original.link_preview_options || {};
}

// Monta a resposta; parse_mode só no Telegram, para o WhatsApp vai texto puro
function montar(original, destino, grupo) {
  const c = conteudo(original);
  const saida = converter({ texto: c.texto, entities: c.entities, destino, grupo });
  return { c, saida, parse_mode: destino === 'tg' ? 'HTML' : undefined };
}

async function novaOferta(msg) {
  const c = conteudo(msg);
  if (!c || !c.texto.trim()) {
    await tg('sendMessage', { chat_id: msg.chat.id, text: 'Mande uma oferta com texto (ou foto com legenda) que eu converto.' });
    return;
  }
  const destino = sentidoPadrao(c.texto, c.entities);
  const grupo = 'jb';
  const { saida, parse_mode } = montar(msg, destino, grupo);
  const base = {
    chat_id: msg.chat.id,
    parse_mode,
    reply_markup: teclado(destino, grupo),
    reply_parameters: { message_id: msg.message_id, allow_sending_without_reply: true }
  };
  const temMidia = MIDIA.some(k => msg[k]);
  if (temMidia && saida.length <= LIMITE_LEGENDA) {
    // Copia a foto/vídeo com a legenda convertida
    await tg('copyMessage', { ...base, from_chat_id: msg.chat.id, message_id: msg.message_id, caption: saida });
  } else {
    await tg('sendMessage', { ...base, text: saida.slice(0, LIMITE_TEXTO), link_preview_options: previa(msg, destino) });
  }
}

// Capa do jogo: a foto da própria oferta ou, se não tiver, a imagem da página do link
async function capaDaOferta(msg, texto, entities) {
  if (msg.photo && msg.photo.length) {
    try { return await baixarArquivo(msg.photo[msg.photo.length - 1].file_id); } catch (e) { console.error(e); }
  }
  const links = [];
  if (msg.link_preview_options && msg.link_preview_options.url) links.push(msg.link_preview_options.url);
  for (const e of entities) {
    if (e.type === 'text_link') links.push(e.url);
    if (e.type === 'url') links.push(texto.slice(e.offset, e.offset + e.length));
  }
  links.push(...(texto.match(/https?:\/\/\S+/g) || []));
  for (const url of [...new Set(links)].slice(0, 2)) {
    const capa = await capaDoLink(url);
    if (capa) return capa;
  }
  return null;
}

async function arte(cb, original, destino, grupo) {
  await tg('answerCallbackQuery', { callback_query_id: cb.id, text: 'Gerando a arte...' });
  const c = conteudo(original);
  const capa = await capaDaOferta(original, c.texto, c.entities);
  let png;
  try {
    png = await gerarArte({ ...dadosDaOferta(c.texto), capa });
  } catch (e) {
    console.error(e);
    await tg('sendMessage', { chat_id: cb.message.chat.id, text: 'Não consegui gerar a arte dessa oferta.' });
    return;
  }
  const { saida, parse_mode } = montar(original, destino, grupo);
  const legenda = saida.length <= LIMITE_LEGENDA;
  await enviarFoto({
    chat_id: cb.message.chat.id,
    caption: legenda ? saida : undefined,
    parse_mode: legenda ? parse_mode : undefined,
    reply_markup: teclado(destino, grupo),
    reply_parameters: { message_id: original.message_id, allow_sending_without_reply: true }
  }, png);
  if (!capa) {
    await tg('sendMessage', { chat_id: cb.message.chat.id, text: 'Não achei a capa do jogo pelo link. Responda a esta arte com a foto da capa que eu refaço.' });
  } else {
    await avisarFotoPequena(original, cb.message.chat.id);
  }
}

// A capa ocupa ~530 px de altura na arte; abaixo disso a foto fica borrada
async function avisarFotoPequena(msg, chatId) {
  const f = msg.photo && msg.photo[msg.photo.length - 1];
  if (f && (f.height < 450 || f.width < 280)) {
    await tg('sendMessage', { chat_id: chatId, text: `A foto da capa é pequena (${f.width}x${f.height}) e pode ficar borrada na arte. Se tiver uma maior, responda à arte com ela.` });
  }
}

// Você respondeu a uma mensagem do bot com uma foto: refaz a arte usando essa foto como capa
async function trocarCapa(msg) {
  const base = msg.reply_to_message;
  const c = conteudo(base);
  if (!c || !c.texto.trim()) {
    await tg('sendMessage', { chat_id: msg.chat.id, text: 'Responda a uma oferta ou arte minha com a foto, que eu uso ela como capa.' });
    return;
  }
  const capa = await baixarArquivo(msg.photo[msg.photo.length - 1].file_id);
  // O texto do bot pode ter *negrito* de WhatsApp; tira as marcas pra ler nome e preço
  const png = await gerarArte({ ...dadosDaOferta(c.texto.replace(/[*_~]/g, '')), capa });
  const legenda = c.texto.length <= LIMITE_LEGENDA;
  await enviarFoto({
    chat_id: msg.chat.id,
    caption: legenda ? c.texto : undefined,
    caption_entities: legenda && c.entities.length ? c.entities : undefined,
    reply_parameters: { message_id: msg.message_id, allow_sending_without_reply: true }
  }, png);
  await avisarFotoPequena(msg, msg.chat.id);
}

async function botao(cb) {
  const partes = (cb.data || '').split('|');
  const ehArte = partes[0] === 'arte';
  const [destino, grupo] = ehArte ? partes.slice(1) : partes;
  const resposta = cb.message;
  const original = resposta && resposta.reply_to_message;
  if (!original || !conteudo(original)) {
    await tg('answerCallbackQuery', { callback_query_id: cb.id, text: 'Não achei a oferta original. Mande ela de novo.', show_alert: true });
    return;
  }
  if (ehArte) return arte(cb, original, destino, grupo);
  const { saida, parse_mode } = montar(original, destino, grupo);
  const comum = { chat_id: resposta.chat.id, message_id: resposta.message_id, parse_mode, reply_markup: teclado(destino, grupo) };
  try {
    if (typeof resposta.caption === 'string' || MIDIA.some(k => resposta[k])) {
      if (saida.length > LIMITE_LEGENDA) {
        await tg('answerCallbackQuery', { callback_query_id: cb.id, text: 'Ficou maior que o limite de legenda do Telegram (1024 caracteres).', show_alert: true });
        return;
      }
      await tg('editMessageCaption', { ...comum, caption: saida });
    } else {
      await tg('editMessageText', { ...comum, text: saida.slice(0, LIMITE_TEXTO), link_preview_options: previa(original, destino) });
    }
  } catch (e) {
    if (!/not modified/i.test(e.descricao || '')) throw e;
  }
  await tg('answerCallbackQuery', { callback_query_id: cb.id });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(200).send('ok');
  const segredo = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (segredo && req.headers['x-telegram-bot-api-secret-token'] !== segredo) return res.status(401).send('não autorizado');

  const u = req.body || {};
  try {
    if (u.callback_query) {
      if (permitido(u.callback_query.from.id)) await botao(u.callback_query);
    } else if (u.message && u.message.chat.type === 'private') {
      const msg = u.message;
      const cmd = (msg.text || '').trim().split(/[\s@]/)[0];
      if (cmd === '/id') {
        await tg('sendMessage', { chat_id: msg.chat.id, text: `Seu ID do Telegram: ${msg.from.id}` });
      } else if (!permitido(msg.from.id)) {
        await tg('sendMessage', { chat_id: msg.chat.id, text: 'Este bot é privado.' });
      } else if (cmd === '/start' || cmd === '/ajuda') {
        await tg('sendMessage', { chat_id: msg.chat.id, text: AJUDA });
      } else {
        const respostaComFoto = msg.photo && !msg.caption && msg.reply_to_message && msg.reply_to_message.from && msg.reply_to_message.from.is_bot;
        if (respostaComFoto) await trocarCapa(msg);
        else await novaOferta(msg);
      }
    }
  } catch (e) {
    console.error(e);
  }
  // Sempre 200, senão o Telegram fica reenviando a mesma atualização
  res.status(200).send('ok');
}
