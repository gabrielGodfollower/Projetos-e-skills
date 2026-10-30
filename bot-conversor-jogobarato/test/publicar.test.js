import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Botão 🚀 Publicar de ponta a ponta: Telegram e script do Google falsos
test('🚀 Publicar: escolhe campanha e rede, confirma, publica e salva no histórico', async () => {
  process.env.TELEGRAM_BOT_TOKEN = 'tok';
  process.env.ALLOWED_USERS = '7';
  process.env.SF_SCRIPT_URL = 'https://script.google.com/macros/s/teste/exec';
  process.env.SF_SCRIPT_SENHA = 'senha';
  const jpeg = readFileSync(new URL('./arte-pequena.jpg', import.meta.url));
  const tgPedidos = [], script = [];
  globalThis.fetch = async (url, op = {}) => {
    url = String(url);
    if (url.startsWith('https://script.google.com')) {
      const d = JSON.parse(op.body);
      script.push(d);
      const r = {
        entrar: { ok: true, membro: { id: 'm1', nome: 'Pit' }, historico: true, redes: { bluesky: 'jogobarato', threads: 'jb', facebook: 'conectado' } },
        campanhas: { ok: true, campanhas: [{ id: 'cA', nome: 'Grupos JB' }, { id: 'cB', nome: 'Grupos VIP' }] },
        enviar: { ok: true, resultados: [{ ok: true, nome: 'Grupos VIP' }] },
        bluesky: { ok: true, ref: 'r1', link: 'https://bsky.app/p/1' },
        'hist-salvar': { ok: true, item: { id: d.item && d.item.id } },
        'hist-imagens': { ok: true }
      }[d.acao];
      return new Response(JSON.stringify(r));
    }
    if (url.includes('/file/bottok/')) return new Response(jpeg);
    const metodo = url.split('/').pop();
    tgPedidos.push({ metodo, dados: JSON.parse(op.body) });
    if (metodo === 'getFile') return new Response(JSON.stringify({ ok: true, result: { file_path: 'photos/a.jpg' } }));
    return new Response(JSON.stringify({ ok: true, result: { message_id: 99 } }));
  };
  const { default: handler } = await import('../api/telegram.js');
  const original = { message_id: 1, chat: { id: 5, type: 'private' }, text: 'Elden Ring\nR$ 99,90 no Pix\nhttps://jogobara.to/abc' };
  let markup = {
    inline_keyboard: [
      [{ text: '✅ Jogo Barato', callback_data: 'wa|jb' }, { text: 'JB Indica', callback_data: 'wa|ind' }, { text: 'Sem rodapé', callback_data: 'wa|sem' }],
      [{ text: '✅ Para WhatsApp', callback_data: 'wa|jb' }, { text: 'Para Telegram', callback_data: 'tg|jb' }],
      [{ text: '🚀 Publicar', callback_data: 'pb|a' }]
    ]
  };
  const tocar = async data => {
    tgPedidos.length = 0;
    const res = { status: () => res, send: () => res };
    await handler({ method: 'POST', headers: {}, body: { callback_query: { id: 'q', from: { id: 7 }, data, message: { message_id: 2, chat: { id: 5 }, photo: [{ file_id: 'F' }], caption: 'x', reply_markup: markup, reply_to_message: original } } } }, res);
    const ed = tgPedidos.find(p => p.metodo === 'editMessageReplyMarkup');
    if (ed) markup = ed.dados.reply_markup;
    return tgPedidos;
  };
  const botao = txt => markup.inline_keyboard.flat().find(b => b.text.includes(txt));

  await tocar('pb|a');
  assert.ok(botao('Grupos VIP') && botao('Bluesky') && botao('Facebook'));
  assert.equal(botao('X'), undefined, 'X não está conectado');
  assert.ok(markup.inline_keyboard.flat().every(b => Buffer.byteLength(b.callback_data) <= 64));
  await tocar(botao('Grupos VIP').callback_data);
  await tocar(botao('Bluesky').callback_data);
  assert.ok(botao('☑️ 📲 Grupos VIP') && botao('☑️ Bluesky') && botao('⬜ 📲 Grupos JB'));
  await tocar(botao('Intervalo').callback_data);
  assert.ok(botao('Intervalo entre grupos: rápido'));
  const confirmar = await tocar(botao('Publicar em 2').callback_data);
  assert.match(confirmar.find(p => p.metodo === 'answerCallbackQuery').dados.text, /WhatsApp \(Grupos VIP\) · Bluesky/);
  script.length = 0;
  const fim = await tocar(botao('Confirmar').callback_data);
  assert.ok(botao('🚀 Publicar'), 'volta pro teclado normal');
  const env = script.find(d => d.acao === 'enviar');
  assert.deepEqual([env.campanhas, env.velocidade], [['cB'], 'fast']);
  assert.match(env.legenda, /Elden Ring[\s\S]*Grupo de Promoções do Jogo Barato/);
  assert.equal(script.find(d => d.acao === 'bluesky').texto, 'Elden Ring\nR$ 99,90 no Pix\nhttps://jogobara.to/abc');
  const salvo = script.find(d => d.acao === 'hist-salvar').item;
  assert.deepEqual(salvo.posts, { bluesky: [{ ref: 'r1', link: 'https://bsky.app/p/1' }] });
  const msg = fim.find(p => p.metodo === 'sendMessage').dados.text;
  assert.match(msg, /🚀 Publicado!\n✓ WhatsApp · Grupos VIP\n✓ Bluesky · https:\/\/bsky\.app\/p\/1\n\nSalvo no histórico/);
});
