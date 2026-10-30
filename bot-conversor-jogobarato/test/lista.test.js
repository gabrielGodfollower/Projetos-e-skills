import test from 'node:test';
import assert from 'node:assert/strict';
import { montarLista, nomeDaLoja } from '../lib/lista.js';
import { partesDoCombo } from '../lib/banco.js';
import { produtosDoTexto } from '../lib/produtos.js';

const RASCUNHO = `Until Dawn 1 + 2
PRIMEGAME5
 https://jogobara.to/4alYX
408,40 no Pix
429,90 em até 8x
Frete Grátis

Death Stranding 1 + 2
 https://jogobara.to/WZm23
297,50 no Pix
319,90 em até 6x
Frete Grátis`;

test('/lista: formata, põe os emojis e ordena do menor para o maior preço', () => {
  const l = montarLista(RASCUNHO, { loja: 'Amazon' });
  assert.equal(l.ofertas, 2);
  assert.equal(l.texto, `[Amazon] Jogos em promoção

Death Stranding 1 + 2
👉 https://jogobara.to/WZm23
• R$ 297,50 no Pix
• R$ 319,90 em até 6x
• Frete Grátis

Until Dawn 1 + 2
🎟 Cupom: PRIMEGAME5
👉 https://jogobara.to/4alYX
• R$ 408,40 no Pix
• R$ 429,90 em até 8x
• Frete Grátis`);
  // Nomes em negrito
  assert.deepEqual(l.entities.map(e => l.texto.substr(e.offset, e.length)), ['Death Stranding 1 + 2', 'Until Dawn 1 + 2']);
  // A arte acha os dois produtos na lista pronta
  assert.deepEqual(produtosDoTexto(l.texto).map(p => p.nome), ['Death Stranding 1 + 2', 'Until Dawn 1 + 2']);
});

test('/lista: título próprio, cupom escrito e preços na mesma linha', () => {
  const l = montarLista('Pré-venda na Amazon!\n\nZelda\ncupom: JOGO10\nR$ 1.299,9 pix / 1.399,90 10x sem juros\nhttps://a.co/x');
  assert.equal(l.texto, 'Pré-venda na Amazon!\n\nZelda\n🎟 Cupom: JOGO10\n👉 https://a.co/x\n• R$ 1.299,90 no Pix\n• R$ 1.399,90 em até 10x sem juros');
  assert.equal(montarLista('só um texto qualquer'), null);
  assert.equal(nomeDaLoja('https://www.amazon.com.br/dp/X'), 'Amazon');
});

test('combo com "+" vira uma capa por jogo', async () => {
  assert.deepEqual(partesDoCombo('Until Dawn 1 + 2'), ['Until Dawn 1', '2']);
  assert.equal(partesDoCombo('Until Dawn'), null);
  const { capasDoCombo, listarBanco } = await import('../lib/banco.js');
  const arquivos = ['Until Dawn (PS5) (BR).png', 'Until Dawn 2 (PS5) (BR).png', 'God of War Ragnarok (PS5) (BR).png',
    'God of War Laufey (PS5) (BR).png', "Marvel's Spider-Man 2 (PS5) (BR).png", "Marvel's Spider-Man Miles Morales (PS5) (BR).png"];
  const fetchOriginal = globalThis.fetch;
  globalThis.fetch = async url => {
    url = String(url);
    if (/\/files\?/.test(url)) return new Response(JSON.stringify({ files: arquivos.map((name, i) => ({ id: 'c' + i, name })) }));
    // PNG mínimo (só o cabeçalho conta para reconhecer a imagem)
    if (/\/files\/c\d\?alt=media/.test(url)) return new Response(Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489', 'hex'));
    return new Response('', { status: 404 });
  };
  process.env.BANCO_DRIVE_PASTA = 'pasta';
  process.env.BANCO_DRIVE_CHAVE = 'chave';
  try {
    await listarBanco({ atualizar: true });
    const nomes = async n => (await capasDoCombo(n)).map(a => a.arquivo);
    assert.deepEqual(await nomes('Until Dawn 1 + 2'), ['Until Dawn (PS5) (BR).png', 'Until Dawn 2 (PS5) (BR).png']);
    assert.deepEqual(await nomes('God of War Laufey + Ragnarök'), ['God of War Laufey (PS5) (BR).png', 'God of War Ragnarok (PS5) (BR).png']);
    assert.deepEqual(await nomes('Spider Man 2 + Miles Morales'), ["Marvel's Spider-Man 2 (PS5) (BR).png", "Marvel's Spider-Man Miles Morales (PS5) (BR).png"]);
  } finally {
    globalThis.fetch = fetchOriginal;
    delete process.env.BANCO_DRIVE_PASTA;
    delete process.env.BANCO_DRIVE_CHAVE;
  }
});

test('/lista: oferta copiada de outro grupo vira o padrão daqui', async () => {
  const { comLinks } = await import('../lib/lista.js');
  const copiada = `(Pré-venda) Controle sem fio DualSense – Edição Limitada Gran Turismo

* KaBuM!
🔥 R$ 501,36 à vista
💳 R$ 539,10 em até 10x
🎟️ Cupom: RACERVIP
👉
📦 Exclusivo para VIP Prime Ninja

* Amazon
🔥 R$ 599,90 em até 10x
🔥 R$ 557,90 no Pix
👉

* Mercado Livre
🔥 R$ 557,90 no Pix
🔥 R$ 599,90 em até 10x  (ou em 15x no cartão Mercado Pago)
👉 https://jogobara.to/ML1

Canais de Promoções do Outro Grupo
👉 https://exemplo.com/redes`;
  const l = montarLista(copiada);
  assert.equal(l.texto, `Pré-venda do Controle sem fio DualSense Edição Limitada Gran Turismo!

KaBuM!
🎟 Cupom: RACERVIP
👉
• R$ 501,36 à vista
• R$ 539,10 em até 10x
• Exclusivo para VIP Prime Ninja

Amazon
👉
• R$ 599,90 em até 10x
• R$ 557,90 no Pix

Mercado Livre
👉 https://jogobara.to/ML1
• R$ 557,90 no Pix
• R$ 599,90 em até 10x (ou em 15x no cartão Mercado Pago)`);
  assert.deepEqual(l.semLink, ['KaBuM!', 'Amazon']);
  // Link escondido no "👉" (copiado dentro do Telegram) entra no texto
  const t = 'KaBuM!\n🔥 R$ 501,36 à vista\n👉';
  assert.equal(comLinks(t, [{ type: 'text_link', offset: t.length - 2, length: 2, url: 'https://kabum.com.br/x' }]), t + ' https://kabum.com.br/x');
  assert.equal(montarLista(comLinks(t, [{ type: 'text_link', offset: t.length - 2, length: 2, url: 'https://kabum.com.br/x' }])).texto,
    'Jogos em promoção\n\nKaBuM!\n👉 https://kabum.com.br/x\n• R$ 501,36 à vista');
});

test('oferta no estilo de outro grupo é reconhecida; a do Jogo Barato não', async () => {
  const { estiloDeFora } = await import('../lib/lista.js');
  assert.equal(estiloDeFora('Controle\n\n* KaBuM!\n🔥 R$ 501,36 à vista\n👉 https://x.com'), true);
  assert.equal(estiloDeFora(montarLista(RASCUNHO).texto), false);
  assert.equal(estiloDeFora('Jogo X (PS5)\n🔥 Oferta relâmpago\nR$ 99,90 no Pix'), false);
});

test('título de pré-venda no padrão do Jogo Barato', async () => {
  const { preVenda } = await import('../lib/lista.js');
  assert.equal(preVenda('(Pré-venda) Controle sem fio DualSense – Edição Limitada Gran Turismo'), 'Pré-venda do Controle sem fio DualSense Edição Limitada Gran Turismo!');
  assert.equal(preVenda('[Pré-venda Global] Edição de Colecionador de Zelda'), 'Pré-venda Global da Edição de Colecionador de Zelda!');
  assert.equal(preVenda('Pré-venda do Dualsense Edição Limitada!'), 'Pré-venda do Dualsense Edição Limitada!');
  assert.equal(preVenda('Jogos em promoção'), 'Jogos em promoção');
  // Acento separado e hífen diferente, como vem de cópia
  assert.equal(preVenda('(Pre\u0301\u2011venda) Controle \u2013 Edição'), 'Pré-venda do Controle Edição!');
});

test('banco: número e algarismo romano decidem a continuação, e preço não entra no nome', async () => {
  const { analisarArquivo, consultaDe, buscarNoBanco } = await import('../lib/banco.js');
  const arquivos = ['FIFA 23 (PS5) (BR).png', 'FIFA 24 (PS5) (BR).png', 'The Last of Us Part I (PS5) (BR).png',
    'The Last of Us Part II (PS5) (BR).png', 'Dragons Dogma 2 (PS5) (BR).png'].map((name, i) => analisarArquivo({ id: 'f' + i, name }));
  const achar = linha => buscarNoBanco(arquivos, consultaDe(linha)).map(x => x.f.arquivo);
  assert.deepEqual(achar('FIFA 24 (PS5)'), ['FIFA 24 (PS5) (BR).png']);
  assert.deepEqual(achar('The Last of Us Part 2 (PS5)'), ['The Last of Us Part II (PS5) (BR).png']);
  assert.deepEqual(achar('Dragons Dogma II (PS5) R$ 199,90 -40%'), ['Dragons Dogma 2 (PS5) (BR).png']);
});
