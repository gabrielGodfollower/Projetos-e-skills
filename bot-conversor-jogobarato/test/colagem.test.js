import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Resvg } from '@resvg/resvg-js';
import { produtosDoTexto, primeiraLinhaEhProduto } from '../lib/produtos.js';
import { analisarArquivo, consultaDe, buscarNoBanco, escolherDoBanco } from '../lib/banco.js';
import { slotsColagem, semBordaBranca, tamanhoImagem } from '../lib/arte.js';

const OFERTA = `Jogos de PS5 e Switch 2 em promoção na KaBuM!

Animal Crossing New Horizons (Nintendo Switch 2)
R$ 249,90 em até 10x
https://www.kabum.com.br/produto/1

EA Sports FC 27 (PS5)
R$ 199,90 em até 10x
https://www.kabum.com.br/produto/2

God of War Laufey (PS5)
R$ 299,90 no Pix
https://www.kabum.com.br/produto/3`;

test('separa os produtos de uma oferta como o 25.html', () => {
  const ps = produtosDoTexto(OFERTA);
  assert.deepEqual(ps.map(p => [p.nome, p.preco, p.avista]), [
    ['Animal Crossing New Horizons (Nintendo Switch 2)', '249,90', false],
    ['EA Sports FC 27 (PS5)', '199,90', false],
    ['God of War Laufey (PS5)', '299,90', true]
  ]);
  assert.equal(primeiraLinhaEhProduto(OFERTA, ps), false);
  assert.equal(primeiraLinhaEhProduto(OFERTA.split('\n\n').slice(1).join('\n\n'), ps), true);
  // Um produto só, ou o mesmo jogo em várias lojas, não vira colagem
  assert.deepEqual(produtosDoTexto('Persona 4 Revival (PS5)\nR$ 249,90 no Pix\nhttps://a.com'), []);
  assert.deepEqual(produtosDoTexto('Persona 4 Revival (PS5)\n\nAmazon\nR$ 249,90\nhttps://a.com\n\nKaBuM!\nR$ 259,90\nhttps://b.com'), []);
});

test('versões por plataforma viram uma capa cada', () => {
  const t = 'Pré-venda de EA Sports FC 27\n\n👉 PS5: https://a.com/1\n👉 PS4: https://a.com/2\nR$ 299,90 à vista\n\n👉 Nintendo Switch 2: https://a.com/3\nR$ 349,90 em até 10x';
  assert.deepEqual(produtosDoTexto(t).map(p => [p.nome, p.preco]), [
    ['EA Sports FC 27 (PS5)', '299,90'], ['EA Sports FC 27 (PS4)', '299,90'], ['EA Sports FC 27 (Nintendo Switch 2)', '349,90']
  ]);
});

const BANCO = [
  'Persona 4 Revival (PS5) (JP).png', 'Persona 4 Revival (PS5) (BR).png', 'Persona 4 Revival (Xbox Series X) (NA).png',
  'Discounty (PS5) (DE).png', 'Discounty (PS5) (NA).png', 'Discounty (PS5) (EU).png'
].map((name, i) => analisarArquivo({ id: 'id' + i, name }));

test('banco de capas: lê o nome do arquivo e prefere a plataforma e o país certos', () => {
  assert.deepEqual(
    (({ nome, plat, regiao, tokens }) => ({ nome, plat, regiao, tokens }))(BANCO[0]),
    { nome: 'Persona 4 Revival', plat: 'ps5', regiao: 'JP', tokens: ['persona', '4', 'revival'] }
  );
  const escolher = (linha, ctx) => { const q = consultaDe(linha, ctx); return (escolherDoBanco(q, buscarNoBanco(BANCO, q)) || {}).arquivo; };
  assert.equal(escolher('[KaBuM!] Persona 4 Revival (PS5)'), 'Persona 4 Revival (PS5) (BR).png');
  assert.equal(escolher('Persona 4 Revival - Xbox Series X'), 'Persona 4 Revival (Xbox Series X) (NA).png');
  // Sem BR: a ordem é LATAM, NA, EU; "versão europeia" no texto passa na frente
  assert.equal(escolher('Discounty (PS5)'), 'Discounty (PS5) (NA).png');
  assert.equal(escolher('Discounty (PS5)', 'Discounty (PS5)\nVersão europeia'), 'Discounty (PS5) (EU).png');
  assert.equal(escolher('Controle DualSense Branco'), undefined);
});

test('colagem: mesmas posições do 25.html', () => {
  const r = s => s.map(o => [o.x, o.y, o.w, o.h].map(Math.round));
  // Switch 2 + PS5: duas capas a 80% do máximo, 48 px entre elas
  assert.deepEqual(r(slotsColagem([0.618, 0.78])), [[212, 333, 287, 464], [546, 333, 362, 464]]);
  // Três: no máximo três caixas de PS5 lado a lado
  assert.deepEqual(r(slotsColagem([0.618, 0.78, 0.78])), [[95, 364, 248, 402], [371, 364, 313, 402], [712, 364, 313, 402]]);
  assert.deepEqual(r(slotsColagem([0.618, 0.78, 0.78, 0.618])).map(s => s[0]), [50, 285, 574, 863]);
  // Imagens largas vão para duas fileiras
  assert.deepEqual(r(slotsColagem([1.5, 1.5, 1.5])).map(s => s[1]), [275, 275, 579]);
});

const png = (w, h, corpo) => new Resvg(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">${corpo}</svg>`).render().asPng();

test('colagem corta a margem branca e transparente em volta da capa', () => {
  const capa = png(400, 500, '<rect width="400" height="500" fill="#fff"/><rect x="50" y="40" width="300" height="400" fill="#c00"/>');
  const r = semBordaBranca(capa);
  assert.ok(Math.abs(r.w - 300) <= 4 && Math.abs(r.h - 400) <= 4, `${r.w}x${r.h}`);
  assert.deepEqual(tamanhoImagem(r.capa), { w: r.w, h: r.h });
  const transparente = semBordaBranca(png(400, 500, '<rect x="100" y="100" width="200" height="300" fill="#00c"/>'));
  assert.ok(Math.abs(transparente.w - 200) <= 4 && Math.abs(transparente.h - 300) <= 4);
  // Capa sem margem fica como está
  const cheia = png(300, 400, '<rect width="300" height="400" fill="#0a0"/>');
  assert.equal(semBordaBranca(cheia).capa, cheia);
});

test('oferta com vários jogos vira colagem com as capas do banco', async () => {
  const capa = png(78, 100, '<rect width="78" height="100" fill="#c00"/>');
  const arquivos = ['Animal Crossing New Horizons (Nintendo Switch 2) (BR).png', 'EA Sports FC 27 (PS5) (BR).png', 'Outro Jogo (PS5) (BR).png'];
  const pedidos = [];
  const fetchOriginal = globalThis.fetch;
  globalThis.fetch = async url => {
    pedidos.push(String(url));
    if (/\/files\?/.test(url)) return new Response(JSON.stringify({ files: arquivos.map((name, i) => ({ id: 'f' + i, name })) }));
    if (/\/files\/f\d\?alt=media/.test(url)) return new Response(capa);
    return new Response('', { status: 404 });
  };
  process.env.BANCO_DRIVE_PASTA = 'pasta';
  process.env.BANCO_DRIVE_CHAVE = 'chave';
  try {
    const { arteDaOferta } = await import('../lib/capas.js');
    const arte = await arteDaOferta(OFERTA);
    assert.equal(arte.imagem, 'colagem');
    assert.equal(arte.capas, 2);
    assert.deepEqual(arte.faltam, ['God of War Laufey (PS5)']);
    assert.deepEqual(tamanhoImagem(arte.png), { w: 1200, h: 1000 });
    // Foto escolhida pela pessoa: nada de colagem; JB Indica não usa o banco
    assert.equal((await arteDaOferta(OFERTA, { foto: capa, soFoto: true })).imagem, 'foto');
    const n = pedidos.length;
    assert.equal((await arteDaOferta(OFERTA, { grupo: 'ind', foto: capa })).imagem, 'foto');
    assert.equal(pedidos.length, n);
    // Um jogo só, sem foto: a capa vem do banco
    assert.equal((await arteDaOferta('EA Sports FC 27 (PS5)\nR$ 199,90\nhttps://a.com')).imagem, 'banco');
  } finally {
    globalThis.fetch = fetchOriginal;
    delete process.env.BANCO_DRIVE_PASTA;
    delete process.env.BANCO_DRIVE_CHAVE;
  }
});
