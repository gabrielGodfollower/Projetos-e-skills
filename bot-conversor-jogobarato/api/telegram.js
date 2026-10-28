// Webhook do bot. Fluxo:
// 1. Você encaminha (ou cola) uma oferta para o bot, de preferência com a foto da capa.
// 2. O bot já responde com a arte da oferta (fundo do Jogo Barato) e o texto
//    convertido na legenda, com botões para trocar o rodapé (Jogo Barato,
//    JB Indica, sem rodapé) e o destino (WhatsApp ou Telegram).
// 3. Ao tocar num botão, o bot relê a mensagem original (a que ele respondeu)
//    e edita a resposta. Assim nada precisa ser guardado em banco de dados.
// 4. Respondendo à arte com outra foto, o bot troca a capa. Oferta mandada com
//    várias fotos (álbum), ou resposta com várias fotos, vira colagem.
//    Com o banco de capas ligado, a capa vem do Google Drive pelo nome do jogo, e
//    oferta com vários jogos vira colagem (lib/capas.js).
// 5. Links de lojas viram links jogobara.to (YOURLS), se YOURLS_SIGNATURE estiver configurado.
// 6. Com o SendFlow configurado, o botão "Enviar nos grupos" manda a oferta pro WhatsApp.
import { converter, sentidoPadrao, semRodape, GRUPOS } from '../lib/conversor.js';
import { tg, baixarArquivo, enviarFoto, trocarFoto, linkPublicoDaFoto } from '../lib/telegram.js';
import { removeBgLigado, tirarFundo } from '../lib/fundo.js';
import { dadosDaOferta, capaDoLink, modeloDoGrupo } from '../lib/arte.js';
import { arteDaOferta } from '../lib/capas.js';
import { montarLista, lojaDoLink, comLinks, estiloDeFora } from '../lib/lista.js';
import { limparLinks } from '../lib/limpeza.js';
import { bancoLigado, listarBanco, paises, consultaDe, buscarNoBanco, escolherDoBanco } from '../lib/banco.js';
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
• Pra trocar a capa, responda à arte com outra foto. Mandando várias fotos de uma vez (álbum), com a oferta ou respondendo à arte, a arte vira uma colagem com todas.
• Com o banco de capas ligado, eu acho a capa do jogo no Google Drive pelo nome, e oferta com vários jogos vira colagem. /banco mostra a configuração e "/banco nome do jogo" mostra o que eu acho.
• /lista monta uma lista de várias ofertas: mande /lista na primeira linha e, embaixo, cada oferta separada por uma linha em branco (nome, cupom, link, preços e "Frete Grátis", em qualquer ordem). Eu coloco os emojis, ordeno do menor para o maior preço e faço a arte. Serve também para colar uma oferta copiada de outro grupo, que sai no padrão do Jogo Barato. Mande /lista sozinho para ver um exemplo.
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
// "fundo": 'tirar' mostra "✂️ Tirar fundo", 'voltar' mostra "↩️ Voltar o fundo" (arte de uma imagem só).
function teclado(destino, grupo, { comArte = false, enviados = '', zap, fundo = '' } = {}) {
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
  if (fundo === 'tirar' && removeBgLigado()) linhas.push([{ text: '✂️ Tirar fundo', callback_data: `fundo|${destino}|${grupo}` }]);
  if (fundo === 'voltar') linhas.push([{ text: '↩️ Voltar o fundo', callback_data: `comfundo|${destino}|${grupo}` }]);
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
// Botão do fundo que a arte tem agora ('tirar', 'voltar' ou '')
function fundoDe(markup) {
  const b = botoes(markup).find(x => /^(com)?fundo\|/.test(x.callback_data || ''));
  return !b ? '' : b.callback_data.startsWith('com') ? 'voltar' : 'tirar';
}
// Arte com uma imagem só (foto, banco ou link) pode ter o fundo tirado
const umaImagem = arte => ['foto', 'banco', 'link'].includes(arte && arte.imagem);
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

// A foto que veio com a oferta
async function fotoDaOferta(msg) {
  if (!msg.photo || !msg.photo.length) return null;
  try {
    return await baixarArquivo(msg.photo[msg.photo.length - 1].file_id);
  } catch (e) {
    console.error(e);
    return null;
  }
}

// A imagem da página do link, procurada só se a arte precisar
function capaPeloLink(msg, texto, entities) {
  return async () => {
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
  };
}

// Arte da oferta: fotos do álbum, colagem do banco, foto da oferta, capa do banco ou
// imagem do link (veja lib/capas.js). O modelo acompanha o rodapé: JB Indica tem arte própria
async function tentarArte(msg, texto, entities, grupo, opcoes = {}) {
  try {
    const foto = opcoes.fotos ? null : await fotoDaOferta(msg);
    return await arteDaOferta(texto, { grupo, foto, capaDoLink: capaPeloLink(msg, texto, entities), ...opcoes });
  } catch (e) {
    console.error(e);
    return null;
  }
}

// ---------- álbuns ----------
// O Telegram manda cada foto de um álbum como uma mensagem separada, quase ao mesmo
// tempo, e só uma delas traz o texto. Sem banco de dados, o bot junta as fotos na
// memória da função pelo media_group_id: a primeira mensagem que chega espera as
// outras e faz uma arte só, com todas as fotos. Foto que chega depois da arte pronta
// refaz a arte. Se as mensagens caírem em instâncias diferentes da Vercel, a arte sai
// com a foto que veio com o texto, como antes.
const ALBUNS = new Map();
const VIDA_ALBUM = 30 * 60 * 1000;
const dormir = ms => new Promise(r => setTimeout(r, ms));

function albumDe(msg) {
  const agora = Date.now();
  for (const [k, a] of ALBUNS) if (agora - a.criado > VIDA_ALBUM) ALBUNS.delete(k);
  const chave = `${msg.chat.id}:${msg.media_group_id}`;
  if (!ALBUNS.has(chave)) ALBUNS.set(chave, { criado: agora, ultima: agora, fotos: new Map(), usadas: 0, fila: Promise.resolve() });
  return ALBUNS.get(chave);
}

// Fotos do álbum na ordem em que foram mandadas
const idsDoAlbum = a => [...a.fotos.entries()].sort((x, y) => x[0] - y[0]).map(([, id]) => id);

// Fotos de um álbum que ainda está na memória (para os botões refazerem a arte igual)
function fotosGuardadas(msg) {
  const a = msg.media_group_id && ALBUNS.get(`${msg.chat.id}:${msg.media_group_id}`);
  return a && a.fotos.size >= 2 ? idsDoAlbum(a) : null;
}

async function baixarFotos(ids) {
  const fotos = await Promise.all(ids.map(id => baixarArquivo(id).catch(e => { console.error(e); return null; })));
  return fotos.filter(Boolean);
}

// Opções da arte com as fotos do álbum guardadas, se tiver
async function comFotosGuardadas(msg, opcoes) {
  const ids = fotosGuardadas(msg);
  return ids ? { ...opcoes, fotos: await baixarFotos(ids) } : opcoes;
}

// Refaz a arte do álbum com todas as fotos que chegaram até agora e troca a imagem
// da mensagem "arte" (com a mesma legenda e os mesmos botões)
function refazerAlbum(a, msg, texto, entities, grupo, opcoes, arte) {
  return () => (a.fila = a.fila.then(async () => {
    const ids = idsDoAlbum(a);
    if (ids.length <= a.usadas) return;
    a.usadas = ids.length;
    const nova = await tentarArte(msg, texto, entities, grupo, { ...opcoes, fotos: await baixarFotos(ids) });
    if (nova && nova.png) await trocarFoto({ chat_id: msg.chat.id, ...arte }, nova.png);
  }).catch(e => console.error(e)));
}

async function fotoDeAlbum(msg) {
  const a = albumDe(msg);
  a.fotos.set(msg.message_id, msg.photo[msg.photo.length - 1].file_id);
  a.ultima = Date.now();
  if (typeof msg.caption === 'string') a.oferta = msg;
  else if (msg.reply_to_message && msg.reply_to_message.from && msg.reply_to_message.from.is_bot) a.resposta = a.resposta || msg;
  // A arte já saiu: refaz com esta foto também
  if (a.refazer) return a.refazer();
  // Outra mensagem do álbum já está montando a arte
  if (a.lider) return;
  a.lider = msg.message_id;
  // Espera as outras fotos: até passar 1,2 s sem chegar nenhuma (no máximo 4 s)
  while (Date.now() - a.ultima < 1200 && Date.now() - a.criado < 4000) await dormir(200);
  if (a.oferta) await novaOferta(a.oferta, a);
  else if (a.resposta) await trocarCapa(a.resposta, a);
  else await tg('sendMessage', { chat_id: msg.chat.id, text: 'Mande uma oferta com texto (ou a foto da capa com a oferta na legenda) que eu converto.' });
  // Chegou foto enquanto a arte era feita
  if (a.refazer && a.fotos.size > a.usadas) await a.refazer();
}

// Colagem: avisa quais jogos ficaram sem capa e que a foto da oferta ficou de fora
async function avisarColagem(msg, arte) {
  const partes = [];
  if (arte.faltam.length) partes.push(`Não achei no banco a capa de: ${arte.faltam.join('; ')}. A colagem saiu só com as ${arte.capas} que achei.`);
  if (msg.photo) partes.push('A arte usa as capas do banco. Pra usar a sua foto no lugar da colagem, responda à arte com ela.');
  if (partes.length) await tg('sendMessage', { chat_id: msg.chat.id, text: partes.join('\n\n') });
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
async function responderComArte(original, png, destino, grupo, resposta, fundo = '') {
  const { saida, parse_mode, falhas } = await montar(original, destino, grupo, resposta);
  const chat_id = original.chat.id;
  const reply_parameters = { message_id: original.message_id, allow_sending_without_reply: true };
  // Devolve a mensagem da arte com a legenda e os botões, para um álbum poder refazê-la
  let arte;
  if (saida.length <= LIMITE_LEGENDA) {
    const reply_markup = teclado(destino, grupo, { fundo });
    const m = await enviarFoto({ chat_id, caption: saida, parse_mode, reply_markup, reply_parameters }, png);
    arte = { message_id: m.message_id, caption: saida, parse_mode, reply_markup };
  } else {
    const m = await enviarFoto({ chat_id, reply_parameters }, png);
    arte = { message_id: m.message_id };
    await tg('sendMessage', { chat_id, text: saida.slice(0, LIMITE_TEXTO), parse_mode, reply_markup: teclado(destino, grupo), reply_parameters, link_preview_options: previa(original, destino) });
  }
  await avisarFalhaEncurtador(falhas, chat_id);
  return arte;
}

const EXEMPLO_LISTA = `Mande assim, tudo numa mensagem só (o título é opcional):

/lista
Jogos em promoção na Amazon

Until Dawn 1 + 2
PRIMEGAME5
https://jogobara.to/4alYX
408,40 no Pix
429,90 em até 8x
Frete Grátis

Death Stranding 1 + 2
https://jogobara.to/WZm23
297,50 no Pix
319,90 em até 6x

Eu devolvo a lista formatada, do menor para o maior preço, e a arte. Sem título, eu uso "[Loja] Jogos em promoção" pela loja do primeiro link.`;

// /lista: formata o rascunho, manda a lista como mensagem minha e responde a ela com a
// arte, como uma oferta normal (os botões e a troca de capa usam essa mensagem)
// "comando": false quando a oferta veio sem /lista (estilo de outro grupo)
async function lista(msg, { comando = true } = {}) {
  let rascunho = comLinks(msg.text || '', msg.entities);
  if (comando) rascunho = rascunho.replace(/^\S+[ \t]*\n?/, '');
  if (!rascunho.trim()) {
    await tg('sendMessage', { chat_id: msg.chat.id, text: EXEMPLO_LISTA });
    return;
  }
  // Oferta de outro grupo: os links deles perdem o afiliado antes de qualquer coisa
  const avisos = [];
  if (estiloDeFora(rascunho)) {
    const limpo = await limparLinks(rascunho);
    rascunho = limpo.texto;
    if (limpo.semComissao.length) {
      const lojas = limpo.semComissao.filter(Boolean);
      const nomes = lojas.length > 1 ? lojas.slice(0, -1).join(', ') + ' e ' + lojas[lojas.length - 1] : lojas[0];
      avisos.push(`Limpei os links de outro grupo. ${lojas.length > 1 ? 'Os links de ' + nomes + ' ficaram' : 'O link de ' + nomes + ' ficou'} sem afiliado nenhum: gere o link de afiliado de vocês e troque antes de postar.`);
    }
    if (limpo.naoLimpos.length) avisos.push(`Não consegui chegar na loja por estes links, que ainda podem ser de outro grupo. Troque antes de postar:\n${limpo.naoLimpos.join('\n')}`);
  }
  const link = (rascunho.match(/https?:\/\/\S+|\bjogobara\.to\/\S+/i) || [])[0];
  const l = montarLista(rascunho, { loja: await lojaDoLink(link) });
  if (!l) {
    await tg('sendMessage', { chat_id: msg.chat.id, text: 'Não achei nenhuma oferta. Cada oferta precisa do nome e de um link ou preço.\n\n' + EXEMPLO_LISTA });
    return;
  }
  const m = await tg('sendMessage', {
    chat_id: msg.chat.id,
    text: l.texto.slice(0, LIMITE_TEXTO),
    entities: l.entities.filter(e => e.offset + e.length <= LIMITE_TEXTO),
    link_preview_options: { is_disabled: true }
  });
  await novaOferta({ ...m, from: msg.from });
  // Oferta copiada de outro grupo costuma perder os links (e os que vêm são dos outros)
  if (l.semLink.length) avisos.push(`Ficou sem link: ${l.semLink.join(', ')}. Coloque os links de vocês depois do 👉 e mande de novo, ou edite antes de postar.`);
  if (avisos.length) await tg('sendMessage', { chat_id: msg.chat.id, text: avisos.join('\n\n'), link_preview_options: { is_disabled: true } });
}

// "album": as fotos mandadas junto com a oferta (veja fotoDeAlbum)
async function novaOferta(msg, album) {
  const c = conteudo(msg);
  if (!c || !c.texto.trim()) {
    await tg('sendMessage', { chat_id: msg.chat.id, text: 'Mande uma oferta com texto (ou a foto da capa com a oferta na legenda) que eu converto.' });
    return;
  }
  const destino = sentidoPadrao(c.texto, c.entities);
  const grupo = 'jb';

  // Já responde com a arte quando acha imagem (colagem, foto da oferta, banco ou link)
  if (!msg.video && !msg.animation && !msg.document) {
    const ids = album ? idsDoAlbum(album) : [];
    const opcoes = ids.length ? { fotos: await baixarFotos(ids) } : {};
    const arte = await tentarArte(msg, c.texto, c.entities, grupo, opcoes);
    if (arte && arte.png) {
      const enviada = await responderComArte(msg, arte.png, destino, grupo, undefined, umaImagem(arte) ? 'tirar' : '');
      if (album) {
        album.usadas = ids.length;
        album.refazer = refazerAlbum(album, msg, c.texto, c.entities, grupo, {}, enviada);
      }
      if (arte.imagem === 'colagem') await avisarColagem(msg, arte);
      if (arte.imagem === 'foto') await avisarFotoPequena(msg, msg.chat.id);
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
  const arte = await tentarArte(original, c.texto, c.entities, grupo, await comFotosGuardadas(original, { semImagem: true }));
  if (!arte || !arte.png) {
    await tg('sendMessage', { chat_id: cb.message.chat.id, text: 'Não consegui gerar a arte dessa oferta.' });
    return;
  }
  await responderComArte(original, arte.png, destino, grupo, cb.message, umaImagem(arte) ? 'tirar' : '');
  if (arte.imagem === 'colagem') await avisarColagem(original, arte);
}

// "✂️ Tirar fundo" refaz a arte com a imagem recortada pelo remove.bg; "↩️ Voltar o fundo"
// refaz com a imagem como veio. Troca a imagem da própria arte (legenda e botões seguem)
async function fundo(cb, original, acao, destino, grupo) {
  const tirar = acao === 'fundo';
  const resposta = cb.message;
  await tg('answerCallbackQuery', { callback_query_id: cb.id, text: tirar ? 'Tirando o fundo...' : 'Voltando o fundo...' });
  const c = conteudo(original);
  let erro = null;
  const recortar = async capa => {
    try { return await tirarFundo(capa); } catch (e) { erro = e; throw e; }
  };
  const avisar = text => tg('sendMessage', { chat_id: resposta.chat.id, reply_to_message_id: resposta.message_id, text });
  // Qualquer falha vira mensagem: sem isso o botão só mostrava "Tirando o fundo..." e nada
  try {
    const arte = await tentarArte(original, c.texto, c.entities, grupo, tirar ? { recortar } : {});
    if (!arte || !arte.png) {
      await avisar(erro ? 'Não consegui tirar o fundo: ' + erro.message + '.' : 'Não consegui refazer a arte.');
      return;
    }
    const opcoes = { enviados: enviadosDe(resposta.reply_markup), fundo: tirar ? 'voltar' : 'tirar' };
    await trocarFoto({
      chat_id: resposta.chat.id, message_id: resposta.message_id,
      caption: resposta.caption, caption_entities: resposta.caption_entities,
      reply_markup: teclado(destino, grupo, opcoes)
    }, arte.png);
  } catch (e) {
    console.error(e);
    await avisar('Não consegui trocar a arte: ' + e.message + '.');
  }
}

// Você respondeu a uma mensagem do bot com uma foto: refaz a arte com essa foto como capa
// "album": várias fotos mandadas de uma vez respondendo à arte viram colagem
async function trocarCapa(msg, album) {
  const base = msg.reply_to_message;
  const legenda = typeof base.caption === 'string' ? base.caption : base.text;
  if (!legenda || !legenda.trim()) {
    await tg('sendMessage', { chat_id: msg.chat.id, text: 'Responda a uma oferta ou arte minha com a foto, que eu uso ela como capa.' });
    return;
  }
  const entities = (typeof base.caption === 'string' ? base.caption_entities : base.entities) || [];
  // A legenda do bot pode ter *negrito* de WhatsApp; tira as marcas pra ler nome e preço.
  // A foto que a pessoa mandou é a imagem da arte (sem banco nem colagem)
  const texto = semRodape(legenda).texto.replace(/[*_~]/g, '');
  const grupo = grupoMarcado(base.reply_markup);
  const opcoes = { soFoto: true, semImagem: true };
  const ids = album ? idsDoAlbum(album) : [];
  const arte = await tentarArte(msg, texto, [], grupo, ids.length ? { ...opcoes, fotos: await baixarFotos(ids) } : opcoes);
  const png = arte && arte.png;
  if (!png) {
    await tg('sendMessage', { chat_id: msg.chat.id, text: 'Não consegui gerar a arte com essa foto.' });
    return;
  }
  let enviada;
  if (base.photo) {
    // Troca a imagem da própria arte: a legenda e os botões continuam funcionando
    // Sem o botão do fundo: ele recortaria a imagem da oferta, não a foto que você mandou
    const reply_markup = base.reply_markup && { inline_keyboard: base.reply_markup.inline_keyboard.filter(l => !l.some(b => /^(com)?fundo\|/.test(b.callback_data || ''))) };
    enviada = { message_id: base.message_id, caption: legenda, caption_entities: entities.length ? entities : undefined, reply_markup };
    await trocarFoto({ chat_id: msg.chat.id, ...enviada }, png);
  } else {
    const cabe = legenda.length <= LIMITE_LEGENDA;
    enviada = { caption: cabe ? legenda : undefined, caption_entities: cabe && entities.length ? entities : undefined };
    const m = await enviarFoto({
      chat_id: msg.chat.id, ...enviada,
      reply_parameters: { message_id: base.message_id, allow_sending_without_reply: true }
    }, png);
    enviada.message_id = m.message_id;
  }
  if (album) {
    album.usadas = ids.length;
    album.refazer = refazerAlbum(album, msg, texto, [], grupo, opcoes, enviada);
  }
  if (arte.imagem === 'foto') await avisarFotoPequena(msg, msg.chat.id);
}

// Botões do envio pro WhatsApp: "zap" pede confirmação, "zapok" envia, "zapnao" cancela
async function zap(cb, partes, original, host) {
  const [acao, destino, grupo, enviados = ''] = partes;
  const resposta = cb.message;
  const chat_id = resposta.chat.id;
  const avisar = (text, show_alert = false) => tg('answerCallbackQuery', { callback_query_id: cb.id, text, show_alert });
  const opcoes = { comArte: temBotaoArte(resposta.reply_markup), enviados, fundo: fundoDe(resposta.reply_markup) };
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

// /banco: confere a configuração do banco de capas e atualiza a lista da pasta.
// "/banco nome do jogo" mostra as capas que combinam, com ✅ na que a arte usaria
async function statusBanco(chatId, busca) {
  const ok = v => (v ? '✅' : '❌');
  const linhas = [
    'Banco de capas (Google Drive)',
    `${ok(process.env.BANCO_DRIVE_PASTA)} Pasta (BANCO_DRIVE_PASTA)`,
    `${ok(process.env.BANCO_DRIVE_CHAVE)} Chave da API do Google (BANCO_DRIVE_CHAVE)`
  ];
  if (bancoLigado()) {
    try {
      const arquivos = await listarBanco({ atualizar: !busca });
      linhas.push('', `${arquivos.length} imagens no banco. Ordem dos países: ${paises().join(', ')}.`);
      if (busca) {
        const q = consultaDe(busca, busca);
        const cands = buscarNoBanco(arquivos, q);
        const f = escolherDoBanco(q, cands);
        linhas.push('', cands.length ? `Para "${busca}":` : `Nada no banco para "${busca}".`);
        for (const x of cands.slice(0, 8)) linhas.push(`${x.f === f ? '✅' : '•'} ${x.f.arquivo}`);
      }
    } catch (e) {
      linhas.push('', 'Não consegui ler o banco.', 'Motivo: ' + e.message);
    }
  }
  await tg('sendMessage', { chat_id: chatId, text: linhas.join('\n') });
}

async function botao(cb, host) {
  const partes = (cb.data || '').split('|');
  // Botão "Copiar texto" que foi tirado: as mensagens antigas ainda podem ter ele
  if (partes[0] === 'copiar') return tg('answerCallbackQuery', { callback_query_id: cb.id, text: 'Esse botão saiu. Segure o texto pra copiar.', show_alert: true });
  const ehArte = partes[0] === 'arte';
  const ehFundo = partes[0] === 'fundo' || partes[0] === 'comfundo';
  const [destino, grupo] = ehArte || ehFundo ? partes.slice(1) : partes;
  const resposta = cb.message;
  const original = resposta && resposta.reply_to_message;
  if (!original || !conteudo(original)) {
    await tg('answerCallbackQuery', { callback_query_id: cb.id, text: 'Não achei a oferta original. Mande ela de novo.', show_alert: true });
    return;
  }
  if (partes[0].startsWith('zap')) return zap(cb, partes, original, host);
  if (ehArte) return arte(cb, original, destino, grupo);
  if (ehFundo) return fundo(cb, original, partes[0], destino, grupo);
  const { saida, parse_mode } = await montar(original, destino, grupo, resposta);
  // Mantém o botão "Gerar arte" só onde ele já estava, e lembra pra quais grupos já foi
  const opcoes = { comArte: temBotaoArte(resposta.reply_markup), enviados: enviadosDe(resposta.reply_markup), fundo: fundoDe(resposta.reply_markup) };
  const comum = { chat_id: resposta.chat.id, message_id: resposta.message_id, parse_mode, reply_markup: teclado(destino, grupo, opcoes) };
  // Arte trocando entre Jogo Barato e JB Indica: refaz a imagem no outro modelo
  if (resposta.photo && modeloDoGrupo(grupoMarcado(resposta.reply_markup)) !== modeloDoGrupo(grupo) && saida.length <= LIMITE_LEGENDA) {
    await tg('answerCallbackQuery', { callback_query_id: cb.id, text: 'Trocando a arte...' });
    const c = conteudo(original);
    const arte = await tentarArte(original, c.texto, c.entities, grupo, await comFotosGuardadas(original, { semImagem: true }));
    if (arte && arte.png) {
      // A arte nova sai com o fundo da foto: o botão volta a ser "Tirar fundo" (sem gastar crédito sozinho)
      const reply_markup = teclado(destino, grupo, { ...opcoes, fundo: opcoes.fundo && 'tirar' });
      await trocarFoto({ chat_id: comum.chat_id, message_id: comum.message_id, caption: saida, parse_mode, reply_markup }, arte.png);
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
      } else if (cmd === '/lista') {
        await lista(msg);
      } else if (cmd === '/banco') {
        await statusBanco(msg.chat.id, (msg.text || '').trim().replace(/^\S+\s*/, ''));
      } else {
        const respostaComFoto = msg.photo && !msg.caption && msg.reply_to_message && msg.reply_to_message.from && msg.reply_to_message.from.is_bot;
        if (msg.photo && msg.media_group_id) await fotoDeAlbum(msg);
        else if (respostaComFoto) await trocarCapa(msg);
        else if (typeof msg.text === 'string' && estiloDeFora(msg.text)) await lista(msg, { comando: false });
        else await novaOferta(msg);
      }
    }
  } catch (e) {
    console.error(e);
  }
  // Sempre 200, senão o Telegram fica reenviando a mesma atualização
  res.status(200).send('ok');
}
