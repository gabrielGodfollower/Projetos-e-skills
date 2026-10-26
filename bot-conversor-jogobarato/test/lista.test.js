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
  const l = montarLista('Pré-venda na Amazon\n\nZelda\ncupom: JOGO10\nR$ 1.299,9 pix / 1.399,90 10x sem juros\nhttps://a.co/x');
  assert.equal(l.texto, 'Pré-venda na Amazon\n\nZelda\n🎟 Cupom: JOGO10\n👉 https://a.co/x\n• R$ 1.299,90 no Pix\n• R$ 1.399,90 em até 10x sem juros');
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
