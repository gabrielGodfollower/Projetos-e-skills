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
    'Oi\n\n<b>Canais de Promoções do <a href="https://www.jogobarato.com.br/redes-sociais">JB Indica</a></b>');
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

test('arte: preço principal define à vista ou parcelado', async () => {
  const { dadosDaOferta } = await import('../lib/arte.js');
  const pix = dadosDaOferta('[Amazon] Mario Kart World\n👉 Switch 2: jogobara.to/p3shP\n• R$ 233,92 no pix\n• R$ 269,91 em até 6x');
  assert.deepEqual([pix.titulo, pix.preco, pix.condicao], ['Mario Kart World', '233,92', 'à vista']);
  const parc = dadosDaOferta('DQ III\n• R$ 183,66 em até 6x');
  assert.deepEqual([parc.preco, parc.condicao], ['183,66', 'parcelado']);
});

test('rodapé que já veio na oferta é trocado, não duplicado', async () => {
  const { semRodape } = await import('../lib/conversor.js');
  const t = '*Oferta*\n• R$ 10\n\n*Grupo de Promoções do JB Indica:*\n👉 https://jogobara.to/S3cM9';
  assert.equal(converter({ ...semRodape(t, []), destino: 'wa', grupo: 'jb' }),
    '*Oferta*\n• R$ 10\n\n*Grupo de Promoções do Jogo Barato:*\n👉 https://jogobara.to/M05ex');
  const t2 = 'Mario Kart\n• R$ 233,92 no pix\n\nCanais de Promoções do Jogo Barato';
  const e2 = [{ type: 'bold', offset: 0, length: 10 }, { type: 'text_link', offset: t2.indexOf('Jogo Barato'), length: 11, url: 'https://jogobara.to/grupos' }];
  assert.deepEqual(semRodape(t2, e2), { texto: 'Mario Kart\n• R$ 233,92 no pix', entities: [e2[0]] });
  // Texto sem link no "rodapé" fica como está
  assert.equal(semRodape('Grupo de promoções de amigos', []).texto, 'Grupo de promoções de amigos');
});

test('encurtador troca links de loja e ajusta as entities', async () => {
  const { trocarLinks, deveEncurtar } = await import('../lib/encurtador.js');
  assert.equal(deveEncurtar('https://jogobara.to/abc'), false);
  assert.equal(deveEncurtar('amzn.to/xyz'), true);
  const t = '🎮 Jogo\n👉 https://www.amazon.com.br/dp/B0F9ZT5MH9?tag=x\n• R$ 10 Comprar\nhttps://jogobara.to/ok';
  const e = [
    { type: 'bold', offset: 0, length: 7 },
    ent(t, 'https://www.amazon.com.br/dp/B0F9ZT5MH9?tag=x', 'url'),
    ent(t, 'Comprar', 'text_link', { url: 'https://amzn.to/abc' }),
    ent(t, 'https://jogobara.to/ok', 'url')
  ];
  const curtos = { 'https://www.amazon.com.br/dp/B0F9ZT5MH9?tag=x': 'https://jogobara.to/AAA', 'https://amzn.to/abc': 'https://jogobara.to/BBB' };
  const r = await trocarLinks(t, e, async u => curtos[u]);
  assert.equal(r.texto, '🎮 Jogo\n👉 https://jogobara.to/AAA\n• R$ 10 Comprar\nhttps://jogobara.to/ok');
  assert.equal(entitiesPara('wa', r.texto, r.entities),
    '*🎮 Jogo*\n👉 https://jogobara.to/AAA\n• R$ 10 Comprar (https://jogobara.to/BBB)\nhttps://jogobara.to/ok');
});

test('ASIN da Amazon e link sozinho não vira título', async () => {
  const { asinDaAmazon, dadosDaOferta } = await import('../lib/arte.js');
  assert.equal(asinDaAmazon('https://www.amazon.com.br/dp/B0HKB8KB6P?smid=A1ZZ&tag=jogobaratojgbrl-20'), 'B0HKB8KB6P');
  assert.equal(asinDaAmazon('https://www.amazon.com.br/Dragons-Dogma/dp/B0HKB8KB6P/ref=x'), 'B0HKB8KB6P');
  assert.equal(asinDaAmazon('https://www.amazon.com.br/gp/product/B0F2NZ8LKV'), 'B0F2NZ8LKV');
  assert.equal(asinDaAmazon('https://jogobara.to/abc'), null);
  assert.equal(dadosDaOferta('https://www.amazon.com.br/dp/B0HKB8KB6P?x=1').titulo, '');
});

test('oferta do canal do Telegram ida e volta com o rodapé dos canais', () => {
  const t = '🔥 [Amazon] DRAGON QUEST III\n\n👉 https://jogobara.to/DtrM0\n• R$ 183,66 em até 6x\n\n✈️ Envio Internacional. Taxas Inclusas.\n\nCanais de Promoções do Jogo Barato';
  const e = [
    { type: 'url', offset: t.indexOf('https'), length: 'https://jogobara.to/DtrM0'.length },
    ent(t, 'Envio Internacional. Taxas Inclusas.', 'italic'),
    ent(t, 'Canais de Promoções do Jogo Barato', 'bold'),
    ent(t, 'Jogo Barato', 'text_link', { url: 'https://jogobara.to/grupos' })
  ];
  return import('../lib/conversor.js').then(({ semRodape }) => {
    assert.equal(converter({ ...semRodape(t, e), destino: 'tg', grupo: 'jb' }),
      '🔥 [Amazon] DRAGON QUEST III\n\n👉 https://jogobara.to/DtrM0\n• R$ 183,66 em até 6x\n\n✈️ <i>Envio Internacional. Taxas Inclusas.</i>\n\n<b>Canais de Promoções do <a href="https://www.jogobarato.com.br/redes-sociais">Jogo Barato</a></b>');
  });
});

test('título sem marcas de formatação nem colchete sobrando', async () => {
  const { dadosDaOferta } = await import('../lib/arte.js');
  for (const linha of ['*[Amazon] Pré-venda de Dragon’s Dogma 2: Dark Arisen (PS5)*', '🔥 *[Amazon] Pré-venda de Dragon’s Dogma 2: Dark Arisen (PS5)*', '🔥 [Amazon] Pré-venda de Dragon’s Dogma 2: Dark Arisen (PS5)']) {
    const d = dadosDaOferta(linha + '\n• R$ 194,92 no pix');
    assert.deepEqual([d.titulo, d.loja, d.preco, d.condicao], ['Pré-venda de Dragon’s Dogma 2: Dark Arisen (PS5)', 'Amazon', '194,92', 'à vista']);
  }
});

test('título sem chamada em maiúsculas e sem loja no meio', async () => {
  const { dadosDaOferta } = await import('../lib/arte.js');
  const d = dadosDaOferta('AINDA DISPONÍVEL! [KaBuM!] Bundle Console PlayStation 5 Slim + 2 Jogos\n• R$ 3.999,00 em até 10x');
  assert.deepEqual([d.titulo, d.loja, d.preco, d.condicao], ['Bundle Console PlayStation 5 Slim + 2 Jogos', 'KaBuM!', '3.999,00', 'parcelado']);
  assert.equal(dadosDaOferta('🚨 BAIXOU! Mario Kart World!').titulo, 'Mario Kart World!');
  assert.equal(dadosDaOferta('Pré-venda de Dragon’s Dogma 2 (PS5)').titulo, 'Pré-venda de Dragon’s Dogma 2 (PS5)');
  assert.equal(dadosDaOferta('GTA VI (PS5)').titulo, 'GTA VI (PS5)');
  assert.equal(dadosDaOferta('GTA VI!').titulo, 'GTA VI!');
});

test('lê o tamanho de PNG e JPEG', async () => {
  const { tamanhoImagem } = await import('../lib/arte.js');
  const { readFileSync } = await import('node:fs');
  assert.deepEqual(tamanhoImagem(readFileSync(new URL('../assets/fundo-jbindica.png', import.meta.url))), { w: 1200, h: 1000 });
});

test('preço da arte pula preço antigo, cupom, frete e parcela', async () => {
  const { precoPrincipal } = await import('../lib/arte.js');
  const casos = [
    ['• R$ 233,92 no pix\n• R$ 269,91 em até 6x', '233,92', 'à vista'],
    ['De R$ 299 por R$ 149', '149,00', 'à vista'],
    ['De: ~R$ 299,90~\nPor: R$ 149,90 no pix', '149,90', 'à vista'],
    ['Cupom de R$ 20 OFF: JOGO20\nR$ 179,90', '179,90', 'à vista'],
    ['Cupom: JOGO20 (R$ 20 OFF)\nR$ 179,90 em até 3x', '179,90', 'parcelado'],
    ['R$ 299,90 ou 10x de R$ 29,99', '299,90', 'parcelado'],
    ['R$ 249,00\nFrete grátis acima de R$ 79', '249,00', 'à vista'],
    ['R$ 99,90 em 3x ou R$ 89,90 no pix', '99,90', 'parcelado'],
    ['A partir de R$ 1299', '1.299,00', 'à vista'],
    ['sem preço', '', 'à vista']
  ];
  for (const [texto, preco, condicao] of casos) {
    assert.deepEqual(precoPrincipal('Jogo\n' + texto), { preco, condicao }, texto);
  }
});

test('fundo do Jogo Barato é o original de 1200x1000', async () => {
  const { tamanhoImagem } = await import('../lib/arte.js');
  const { readFileSync } = await import('node:fs');
  assert.deepEqual(tamanhoImagem(readFileSync(new URL('../assets/fundo-arte.png', import.meta.url))), { w: 1200, h: 1000 });
});
