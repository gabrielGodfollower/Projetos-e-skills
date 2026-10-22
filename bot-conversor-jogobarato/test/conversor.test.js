import { test } from 'node:test';
import assert from 'node:assert/strict';
import { converter, entitiesPara, sentidoPadrao } from '../lib/conversor.js';

// Mede offsets em UTF-16, como o Telegram
const ent = (texto, trecho, type, extra = {}) => ({ type, offset: texto.indexOf(trecho), length: trecho.length, ...extra });

test('entities do Telegram viram marcas do WhatsApp', () => {
  const t = '🎮 God of War Ragnarok \nDe R$ 299 por R$ 149\nCupom: BARATO10\nComprar aqui\nSó hoje';
  const e = [
    ent(t, 'God of War Ragnarok ', 'bold'),
    ent(t, 'R$ 299', 'strikethrough'),
    ent(t, 'R$ 149', 'bold'),
    ent(t, 'BARATO10', 'code'),
    ent(t, 'Comprar aqui', 'text_link', { url: 'https://jogobara.to/x' }),
    ent(t, 'Só hoje', 'italic')
  ];
  assert.equal(entitiesPara('wa', t, e),
    '🎮 *God of War Ragnarok* \nDe ~R$ 299~ por *R$ 149*\nCupom: BARATO10\nComprar aqui (https://jogobara.to/x)\n_Só hoje_');
});

test('entities aninhadas e citação', () => {
  const t = 'Oferta top\nlinha 1\nlinha 2';
  const e = [ent(t, 'Oferta top', 'bold'), ent(t, 'top', 'italic'), ent(t, 'linha 1\nlinha 2', 'blockquote')];
  assert.equal(entitiesPara('wa', t, e), '*Oferta _top_*\n> linha 1\n> linha 2');
  assert.equal(entitiesPara('tg', t, e), '<b>Oferta <i>top</i></b>\n<blockquote>linha 1\nlinha 2</blockquote>');
});

test('HTML escapa caracteres especiais', () => {
  const t = 'A < B & C';
  assert.equal(entitiesPara('tg', t, [ent(t, 'B', 'bold')]), 'A &lt; <b>B</b> &amp; C');
});

test('rodapé do Jogo Barato e do JB Indica', () => {
  assert.equal(converter({ texto: 'Oi', entities: [], destino: 'wa', grupo: 'jb' }),
    'Oi\n\n*Grupo de Promoções do Jogo Barato:*\n👉 https://jogobara.to/M05ex');
  assert.equal(converter({ texto: 'Oi', entities: [], destino: 'tg', grupo: 'ind' }),
    'Oi\n\n<b>Grupo de Promoções do JB Indica:</b>\n👉 https://jogobara.to/S3cM9');
  assert.equal(converter({ texto: 'Oi  \n', entities: [], destino: 'wa', grupo: 'sem' }), 'Oi');
});

test('texto colado do WhatsApp vira HTML do Telegram', () => {
  const t = '*Promoção relâmpago* só hoje!\nDe ~R$ 299~ por *R$ 149*\n_Estoque limitado_\n> Cupom até 23h59\nhttps://exemplo.com/a_b_c';
  assert.equal(sentidoPadrao(t, []), 'tg');
  assert.equal(converter({ texto: t, entities: [], destino: 'tg', grupo: 'sem' }),
    '<b>Promoção relâmpago</b> só hoje!\nDe <s>R$ 299</s> por <b>R$ 149</b>\n<i>Estoque limitado</i>\n<blockquote>Cupom até 23h59</blockquote>\nhttps://exemplo.com/a_b_c');
});

test('markdown do Telegram digitado vira WhatsApp', () => {
  const t = '**Reunião** __sábado__ ~~sala 3~~ [agenda](https://ex.com) ||bolo||';
  assert.equal(sentidoPadrao(t, []), 'wa');
  assert.equal(converter({ texto: t, entities: [], destino: 'wa', grupo: 'sem' }),
    '*Reunião* _sábado_ ~sala 3~ agenda (https://ex.com) bolo');
});

test('mensagem com formatação do Telegram vai para WhatsApp por padrão', () => {
  assert.equal(sentidoPadrao('*x* oi', [{ type: 'bold', offset: 4, length: 2 }]), 'wa');
  assert.equal(sentidoPadrao('só texto', []), 'wa');
});
