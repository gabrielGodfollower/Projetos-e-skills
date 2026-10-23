// Webhook do bot. Fluxo:
// 1. Você encaminha (ou cola) uma oferta para o bot, de preferência com a foto da capa.
// 2. O bot já responde com a arte da oferta (fundo do Jogo Barato) e o texto
//    convertido na legenda, com botões para trocar o rodapé (Jogo Barato,
//    JB Indica, sem rodapé) e o destino (WhatsApp ou Telegram).
// 3. Ao tocar num botão, o bot relê a mensagem original (a que ele respondeu)
//    e edita a resposta. Assim nada precisa ser guardado em banco de dados.
// 4. Respondendo à arte com outra foto, o bot troca a capa.
// 5. Links de lojas viram links jogobara.to (YOURLS), se YOURLS_SIGNATURE estiver configurado.
// 6. Com o SendFlow configurado, o botão "Enviar nos grupos" manda a oferta pro WhatsApp.
import { converter, sentidoPadrao, semRodape, GRUPOS } from '../lib/conversor.js';
import { tg, baixarArquivo, enviarFoto, trocarFoto, linkPublicoDaFoto } from '../lib/telegram.js';
import { gerarArte, dadosDaOferta, capaDoLink, modeloDoGrupo } from '../lib/arte.js';
import { encurtadorLigado, encurtar, deveEncurtar, linksEmOrdem, trocarLinks } from '../lib/encurtador.js';
import { sendflowLigado, lancamentoDoGrupo, lancamentos, prepararEnvio, enviarProsGrupos } from '../lib/sendflow.js';

const LIMITE_LEGENDA = 1024;
const LIMITE_TEXTO = 4096;
const MIDIA = ['photo', 'video', 'animation', 'document'];

const AJUDA = `Oi! Eu converto ofertas entre Telegram e WhatsApp, coloco o rodapé do grupo e faço a arte.

Como usar:
• Mande a foto da capa com o texto da oferta na legenda (ou encaminhe uma oferta do Telegram).
• Eu respondo com a arte pronta e o texto para o WhatsApp na legenda. Segure a mensagem e toque em Copiar.
• Os botões trocam o rodapé (${GRUPOS.jb.nome}, ${GRUPOS.ind.nome} ou sem rodapé) e o destino.
• Em "Para Telegram" a legenda vira a oferta formatada, pronta para encaminhar no grupo.
• Pra trocar a capa, responda à arte com outra foto.
• Com o SendFlow ligado, o botão 📲 manda a arte e o texto pros grupos do WhatsApp do rodapé escolhido (pede confirmação antes). /sendflow mostra a configuração.

No WhatsApp, os *asteriscos* viram negrito e os _sublinhados_ viram itálico quando você cola o texto.`;

const equipe = () => (process.env.ALLOWED_USERS || '').split(',').map(s => s.trim()).filter(Boolean);

function permitido(userId) {
  const lista = equipe();
  return !lista.length || lista.includes(String(userId));
}

// Mandar pros grupos do WhatsApp só com o bot fechado pra equipe, mesmo que o resto esteja aberto
function podeDisparar(userId) {
  return equipe().includes(String(userId));
}

// O botão "Gerar arte" só aparece quando a resposta ainda não é a arte.
// "enviados" guarda pra quais grupos a oferta já foi no WhatsApp (ex.: "jb.ind"),
// e "zap" troca a linha do envio (pela confirmação, por exemplo).
function teclado(destino, grupo, { comArte = false, enviados = '', zap } = {}) {
  const marca = (ativo, txt) => (ativo ? '✅ ' : '') + txt;
  const linhas = [
    [
      { text: marca(grupo === 'jb', GRUPOS.jb.nome), callback_data: `${destino}|jb` },
      { text: marca(grupo === 'ind', GRUPOS.ind.nome), callback_data: `${destino}|ind` },
      { text: marca(grupo === 'sem', 'Sem rodapé'), callback_data: `${destino}|sem` }
    ],
    [
      { text: marca(destino === 'wa', 'Para WhatsApp'), callback_data: `wa|${grupo}` },
      { text: marca(destino === 'tg', 'Para Telegram'), callback_data: `tg|${grupo}` }
    ]
  ];
  if (comArte) linhas.push([{ text: '🖼 Gerar arte', callback_data: `arte|${destino}|${grupo}` }]);
  if (zap) linhas.push(zap);
  else if (sendflowLigado() && GRUPOS[grupo]) {
    const fim = `|${destino}|${grupo}|${enviados}`;
    linhas.push(enviados.split('.').includes(grupo)
      ? [{ text: `✔️ Já foi pros grupos do ${GRUPOS[grupo].nome}`, callback_data: 'zapfeito' + fim }]
      : [{ text: `📲 Enviar nos grupos do ${GRUPOS[grupo].nome}`, callback_data: 'zap' + fim }]);
  }
  return { inline_keyboard: linhas };
}

const botoes = markup => ((markup && markup.inline_keyboard) || []).flat();
const temBotaoArte = markup => botoes(markup).some(b => (b.callback_data || '').startsWith('arte|'));
// Grupos do WhatsApp pra onde a oferta já foi, lidos do botão de envio
function enviadosDe(markup) {
  const b = botoes(markup).find(x => (x.callback_data || '').startsWith('zap'));
  return b ? b.callback_data.split('|')[3] || '' : '';
}

// Qual rodapé está marcado (✅) nos botões de uma resposta do bot
function grupoMarcado(markup) {
  const linha = (markup && markup.inline_keyboard && markup.inline_keyboard[0]) || [];
  const b = linha.find(x => (x.text || '').startsWith('✅') && x.callback_data);
  return b ? b.callback_data.split('|').pop() : 'jb';
}

// Texto da mensagem, já sem o rodapé que ela possa ter trazido
function conteudo(msg) {
  if (typeof msg.text === 'string') return semRodape(msg.text, msg.entities || []);
  if (typeof msg.caption === 'string') return semRodape(msg.caption, msg.caption_entities || []);
  return null;
}

// No Telegram mantém a prévia do link como na oferta original; no WhatsApp tira, pra copiar mais fácil
function previa(original, destino) {
  if (destino !== 'tg') return { is_disabled: true };
  return original.link_preview_options || {};
}

// Links já encurtados numa resposta anterior do bot: pareia, na ordem, os links da
// oferta com os da resposta, pra não pedir ao YOURLS de novo a cada botão
function linksJaEncurtados(original, resposta) {
  const mapa = new Map();
  const co = conteudo(original), cr = resposta && conteudo(resposta);
  if (!co || !cr) return mapa;
  const lo = linksEmOrdem(co.texto, co.entities), lr = linksEmOrdem(cr.texto, cr.entities);
  if (lo.length !== lr.length) return mapa;
  lo.forEach((l, i) => { if (deveEncurtar(l.url) && !deveEncurtar(lr[i].url)) mapa.set(l.url, lr[i].url); });
  return mapa;
}

// Texto da oferta com os links de loja trocados por jogobara.to
async function conteudoEncurtado(original, resposta) {
  const c = conteudo(original);
  if (!encurtadorLigado()) return { ...c, falhas: [] };
  const mapa = linksJaEncurtados(original, resposta);
  const titulo = dadosDaOferta(c.texto).titulo;
  const falhas = [];
  const r = await trocarLinks(c.texto, c.entities, async url => {
    if (mapa.has(url)) return mapa.get(url);
    try {
      return await encurtar(url, titulo);
    } catch (e) {
      console.error(e);
      falhas.push(e.message);
      return url;
    }
  });
  return { ...r, falhas };
}

// Monta a resposta; parse_mode só no Telegram, para o WhatsApp vai texto puro
async function montar(original, destino, grupo, resposta) {
  const c = await conteudoEncurtado(original, resposta);
  const saida = converter({ texto: c.texto, entities: c.entities, destino, grupo });
  return { c, saida, parse_mode: destino === 'tg' ? 'HTML' : undefined, falhas: c.falhas };
}

async function avisarFalhaEncurtador(falhas, chatId) {
  if (falhas.length) await tg('sendMessage', { chat_id: chatId, text: `Não consegui encurtar um dos links no jogobara.to, então ele ficou original.\nMotivo: ${falhas[0]}` });
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

// O modelo da arte acompanha o rodapé: JB Indica tem arte própria
async function tentarArte(texto, capa, grupo) {
  try {
    return await gerarArte({ ...dadosDaOferta(texto), capa, modelo: modeloDoGrupo(grupo) });
  } catch (e) {
    console.error(e);
    return null;
  }
}

// A capa ocupa ~530 px de altura na arte; abaixo disso a foto fica borrada
async function avisarFotoPequena(msg, chatId) {
  const f = msg.photo && msg.photo[msg.photo.length - 1];
  if (f && (f.height < 450 || f.width < 280)) {
    await tg('sendMessage', { chat_id: chatId, text: `A foto da capa é pequena (${f.width}x${f.height}) e pode ficar borrada na arte. Se tiver uma maior, responda à arte com ela.` });
  }
}

// Manda a arte respondendo à oferta original. Se o texto não couber na legenda,
// a arte vai sozinha e o texto (com os botões) numa mensagem logo depois.
async function responderComArte(original, png, destino, grupo, resposta) {
  const { saida, parse_mode, falhas } = await montar(original, destino, grupo, resposta);
  const chat_id = original.chat.id;
  const reply_parameters = { message_id: original.message_id, allow_sending_without_reply: true };
  if (saida.length <= LIMITE_LEGENDA) {
    await enviarFoto({ chat_id, caption: saida, parse_mode, reply_markup: teclado(destino, grupo), reply_parameters }, png);
  } else {
    await enviarFoto({ chat_id, reply_parameters }, png);
    await tg('sendMessage', { chat_id, text: saida.slice(0, LIMITE_TEXTO), parse_mode, reply_markup: teclado(destino, grupo), reply_parameters, link_preview_options: previa(original, destino) });
  }
  await avisarFalhaEncurtador(falhas, chat_id);
}

async function novaOferta(msg) {
  const c = conteudo(msg);
  if (!c || !c.texto.trim()) {
    await tg('sendMessage', { chat_id: msg.chat.id, text: 'Mande uma oferta com texto (ou a foto da capa com a oferta na legenda) que eu converto.' });
    return;
  }
  const destino = sentidoPadrao(c.texto, c.entities);
  const grupo = 'jb';

  // Já responde com a arte quando tem capa (foto da oferta ou imagem do link)
  if (!msg.video && !msg.animation && !msg.document) {
    const capa = await capaDaOferta(msg, c.texto, c.entities);
    const png = capa && await tentarArte(c.texto, capa, grupo);
    if (png) {
      await responderComArte(msg, png, destino, grupo);
      await avisarFotoPequena(msg, msg.chat.id);
      return;
    }
  }

  const { saida, parse_mode, falhas } = await montar(msg, destino, grupo);
  const base = {
    chat_id: msg.chat.id,
    parse_mode,
    reply_markup: teclado(destino, grupo, { comArte: true }),
    reply_parameters: { message_id: msg.message_id, allow_sending_without_reply: true }
  };
  if (MIDIA.some(k => msg[k]) && saida.length <= LIMITE_LEGENDA) {
    // Vídeo/GIF/arquivo: copia com a legenda convertida
    await tg('copyMessage', { ...base, from_chat_id: msg.chat.id, message_id: msg.message_id, caption: saida });
  } else {
    await tg('sendMessage', { ...base, text: saida.slice(0, LIMITE_TEXTO), link_preview_options: previa(msg, destino) });
    await tg('sendMessage', { chat_id: msg.chat.id, text: 'Não achei a capa do jogo. Pra sair a arte, responda à mensagem acima com a foto da capa.' });
  }
  await avisarFalhaEncurtador(falhas, msg.chat.id);
}

// Botão "Gerar arte" (respostas sem capa): gera mesmo sem capa
async function arte(cb, original, destino, grupo) {
  await tg('answerCallbackQuery', { callback_query_id: cb.id, text: 'Gerando a arte...' });
  const c = conteudo(original);
  const capa = await capaDaOferta(original, c.texto, c.entities);
  const png = await tentarArte(c.texto, capa, grupo);
  if (!png) {
    await tg('sendMessage', { chat_id: cb.message.chat.id, text: 'Não consegui gerar a arte dessa oferta.' });
    return;
  }
  await responderComArte(original, png, destino, grupo, cb.message);
}

// Você respondeu a uma mensagem do bot com uma foto: refaz a arte com essa foto como capa
async function trocarCapa(msg) {
  const base = msg.reply_to_message;
  const legenda = typeof base.caption === 'string' ? base.caption : base.text;
  if (!legenda || !legenda.trim()) {
    await tg('sendMessage', { chat_id: msg.chat.id, text: 'Responda a uma oferta ou arte minha com a foto, que eu uso ela como capa.' });
    return;
  }
  const entities = (typeof base.caption === 'string' ? base.caption_entities : base.entities) || [];
  const capa = await baixarArquivo(msg.photo[msg.photo.length - 1].file_id);
  // A legenda do bot pode ter *negrito* de WhatsApp; tira as marcas pra ler nome e preço
  const png = await tentarArte(semRodape(legenda).texto.replace(/[*_~]/g, ''), capa, grupoMarcado(base.reply_markup));
  if (!png) {
    await tg('sendMessage', { chat_id: msg.chat.id, text: 'Não consegui gerar a arte com essa foto.' });
    return;
  }
  if (base.photo) {
    // Troca a imagem da própria arte: a legenda e os botões continuam funcionando
    await trocarFoto({
      chat_id: msg.chat.id, message_id: base.message_id, caption: legenda,
      caption_entities: entities.length ? entities : undefined, reply_markup: base.reply_markup
    }, png);
  } else {
    const cabe = legenda.length <= LIMITE_LEGENDA;
    await enviarFoto({
      chat_id: msg.chat.id,
      caption: cabe ? legenda : undefined,
      caption_entities: cabe && entities.length ? entities : undefined,
      reply_parameters: { message_id: base.message_id, allow_sending_without_reply: true }
    }, png);
  }
  await avisarFotoPequena(msg, msg.chat.id);
}

// Botões do envio pro WhatsApp: "zap" pede confirmação, "zapok" envia, "zapnao" cancela
async function zap(cb, partes, original, host) {
  const [acao, destino, grupo, enviados = ''] = partes;
  const resposta = cb.message;
  const chat_id = resposta.chat.id;
  const avisar = (text, show_alert = false) => tg('answerCallbackQuery', { callback_query_id: cb.id, text, show_alert });
  const opcoes = { comArte: temBotaoArte(resposta.reply_markup), enviados };
  const trocarTeclado = reply_markup => tg('editMessageReplyMarkup', { chat_id, message_id: resposta.message_id, reply_markup });
  const nome = GRUPOS[grupo] ? GRUPOS[grupo].nome : grupo;

  if (acao === 'zapfeito') return avisar('Essa oferta já foi pros grupos. Pra mandar de novo, encaminhe a oferta pra mim outra vez.', true);
  if (!podeDisparar(cb.from.id)) {
    return avisar('Pra enviar nos grupos, o bot precisa estar fechado só pra equipe: coloque os IDs em ALLOWED_USERS na Vercel.', true);
  }
  if (acao === 'zapnao') {
    await trocarTeclado(teclado(destino, grupo, opcoes));
    return avisar('Envio cancelado.');
  }
  if (acao === 'zap') {
    // Já confere a configuração e conta os grupos antes de pedir a confirmação
    let envio;
    try {
      envio = await prepararEnvio(grupo);
    } catch (e) {
      console.error(e);
      return avisar('Não deu pra enviar: ' + e.message, true);
    }
    const fim = `|${destino}|${grupo}|${enviados}`;
    await trocarTeclado(teclado(destino, grupo, {
      ...opcoes,
      zap: [
        { text: `✅ Confirmar: ${envio.groupIds.length} grupos`, callback_data: 'zapok' + fim },
        { text: 'Cancelar', callback_data: 'zapnao' + fim }
      ]
    }));
    return avisar(`Vai pros ${envio.groupIds.length} grupos do ${nome}. Confira a oferta e toque em Confirmar.`);
  }

  // zapok: manda o texto do WhatsApp (com o rodapé do grupo) e a arte, se a resposta for a arte
  await avisar('Enviando...');
  try {
    const { saida } = await montar(original, 'wa', grupo, resposta);
    const foto = resposta.photo && resposta.photo[resposta.photo.length - 1];
    const envio = await prepararEnvio(grupo);
    const n = await enviarProsGrupos(envio, { texto: saida, imagem: foto ? linkPublicoDaFoto(host, foto.file_id) : null });
    await trocarTeclado(teclado(destino, grupo, { ...opcoes, enviados: [...enviados.split('.').filter(Boolean), grupo].join('.') }));
    await tg('sendMessage', {
      chat_id, text: `📲 Oferta na fila do SendFlow pros ${n} grupos do ${nome}.`,
      reply_parameters: { message_id: resposta.message_id, allow_sending_without_reply: true }
    });
  } catch (e) {
    console.error(e);
    await trocarTeclado(teclado(destino, grupo, opcoes));
    await tg('sendMessage', { chat_id, text: 'Não consegui mandar pro WhatsApp.\nMotivo: ' + e.message });
  }
}

// /sendflow: mostra o que falta configurar e os lançamentos da conta, com os IDs
async function statusSendflow(chatId) {
  const ok = v => (v ? '✅' : '❌');
  const linhas = [
    'Envio pro WhatsApp (SendFlow)',
    `${ok(sendflowLigado())} Chave da API (SENDFLOW_API_KEY)`,
    `${ok(equipe().length)} Equipe fechada (ALLOWED_USERS)`,
    `${ok(lancamentoDoGrupo('jb'))} Lançamento do ${GRUPOS.jb.nome} (SENDFLOW_LANCAMENTO_JB)`,
    `${ok(lancamentoDoGrupo('ind'))} Lançamento do ${GRUPOS.ind.nome} (SENDFLOW_LANCAMENTO_INDICA)`
  ];
  if (sendflowLigado()) {
    try {
      const lista = await lancamentos();
      linhas.push('', lista.length ? 'Lançamentos da conta (nome: ID):' : 'Nenhum lançamento ativo na conta.');
      for (const r of lista.slice(0, 30)) linhas.push(`• ${r.name || r.title || 'sem nome'}: ${r.id}`);
    } catch (e) {
      linhas.push('', 'Não consegui ler os lançamentos.', 'Motivo: ' + e.message);
    }
  }
  await tg('sendMessage', { chat_id: chatId, text: linhas.join('\n') });
}

async function botao(cb, host) {
  const partes = (cb.data || '').split('|');
  const ehArte = partes[0] === 'arte';
  const [destino, grupo] = ehArte ? partes.slice(1) : partes;
  const resposta = cb.message;
  const original = resposta && resposta.reply_to_message;
  if (!original || !conteudo(original)) {
    await tg('answerCallbackQuery', { callback_query_id: cb.id, text: 'Não achei a oferta original. Mande ela de novo.', show_alert: true });
    return;
  }
  if (partes[0].startsWith('zap')) return zap(cb, partes, original, host);
  if (ehArte) return arte(cb, original, destino, grupo);
  const { saida, parse_mode } = await montar(original, destino, grupo, resposta);
  // Mantém o botão "Gerar arte" só onde ele já estava, e lembra pra quais grupos já foi
  const opcoes = { comArte: temBotaoArte(resposta.reply_markup), enviados: enviadosDe(resposta.reply_markup) };
  const comum = { chat_id: resposta.chat.id, message_id: resposta.message_id, parse_mode, reply_markup: teclado(destino, grupo, opcoes) };
  // Arte trocando entre Jogo Barato e JB Indica: refaz a imagem no outro modelo
  if (resposta.photo && modeloDoGrupo(grupoMarcado(resposta.reply_markup)) !== modeloDoGrupo(grupo) && saida.length <= LIMITE_LEGENDA) {
    await tg('answerCallbackQuery', { callback_query_id: cb.id, text: 'Trocando a arte...' });
    const c = conteudo(original);
    const capa = await capaDaOferta(original, c.texto, c.entities);
    const png = await tentarArte(c.texto, capa, grupo);
    if (png) {
      await trocarFoto({ chat_id: comum.chat_id, message_id: comum.message_id, caption: saida, parse_mode, reply_markup: comum.reply_markup }, png);
      return;
    }
  }
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
      if (permitido(u.callback_query.from.id)) await botao(u.callback_query, req.headers['x-forwarded-host'] || req.headers.host);
    } else if (u.message && u.message.chat.type === 'private') {
      const msg = u.message;
      const cmd = (msg.text || '').trim().split(/[\s@]/)[0];
      if (cmd === '/id') {
        await tg('sendMessage', { chat_id: msg.chat.id, text: `Seu ID do Telegram: ${msg.from.id}` });
      } else if (!permitido(msg.from.id)) {
        // Quem ainda não foi liberado já recebe o próprio ID pra passar pro admin
        await tg('sendMessage', { chat_id: msg.chat.id, text: `Este bot é só da equipe do Jogo Barato. Pra liberar, mande este número pra quem cuida do bot: ${msg.from.id}` });
      } else if (cmd === '/start' || cmd === '/ajuda') {
        await tg('sendMessage', { chat_id: msg.chat.id, text: AJUDA });
      } else if (cmd === '/sendflow') {
        await statusSendflow(msg.chat.id);
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
