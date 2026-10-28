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

test('álbum: as fotos que chegam juntas viram uma arte só, com todas', async () => {
  const fotos = { A: png(300, 200, '<rect width="300" height="200" fill="#c00"/>'), B: png(300, 200, '<rect width="300" height="200" fill="#00c"/>') };
  const chamadas = [];
  const fetchOriginal = globalThis.fetch;
  process.env.TELEGRAM_BOT_TOKEN = 'teste';
  globalThis.fetch = async (url, op = {}) => {
    url = String(url);
    if (!url.startsWith('https://api.telegram.org/')) return fetchOriginal(url, op);
    if (url.includes('/file/bot')) return new Response(fotos[url.split('/').pop()]);
    const metodo = url.split('/').pop();
    const corpo = op.body instanceof FormData ? {} : JSON.parse(op.body || '{}');
    if (metodo === 'getFile') return new Response(JSON.stringify({ ok: true, result: { file_path: corpo.file_id } }));
    chamadas.push(metodo);
    return new Response(JSON.stringify({ ok: true, result: { message_id: 99 } }));
  };
  try {
    const { default: handler } = await import('../api/telegram.js');
    const res = { status() { return this; }, send() { return this; } };
    const chat = { id: 7, type: 'private' }, from = { id: 7 };
    const foto = id => [{ file_id: id, width: 300, height: 200 }];
    const enviar = message => handler({ method: 'POST', headers: {}, body: { message } }, res);
    await Promise.all([
      enviar({ message_id: 1, chat, from, media_group_id: 'g', photo: foto('A'), caption: 'Controle DualSense\nR$ 399,90 no Pix', caption_entities: [] }),
      enviar({ message_id: 2, chat, from, media_group_id: 'g', photo: foto('B') })
    ]);
    // Uma arte com as duas fotos e nenhum aviso de "mande o texto" pela segunda foto
    assert.deepEqual(chamadas, ['sendPhoto']);
  } finally {
    globalThis.fetch = fetchOriginal;
    delete process.env.TELEGRAM_BOT_TOKEN;
  }
});

test('fotos de um álbum valem mais que o banco e viram colagem', async () => {
  const { arteDaOferta } = await import('../lib/capas.js');
  const a = png(300, 200, '<rect width="300" height="200" fill="#c00"/>');
  const arte = await arteDaOferta(OFERTA, { fotos: [a, a] });
  assert.equal(arte.imagem, 'album');
  assert.equal(arte.capas, 2);
  assert.equal((await arteDaOferta(OFERTA, { grupo: 'ind', fotos: [a, a, a] })).imagem, 'album');
});

test('colagem desenha foto JPEG sem margem (foto do Telegram)', async () => {
  const { gerarArte } = await import('../lib/arte.js');
  // Capa vermelha de 78x100 em JPEG, sem margem branca: entra como está, sem virar PNG
  const jpeg = Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCABkAE4DASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDySiiivmD9yCiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigD/2Q==', 'base64');
  assert.equal(semBordaBranca(jpeg).tipo, 'image/jpeg');
  const arte = await gerarArte({ titulo: 'Lista', preco: '219,91', condicao: 'à vista', capas: [jpeg, jpeg, jpeg] });
  // Pixel no meio da capa do meio
  const r = new Resvg(`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1000"><image href="data:image/png;base64,${arte.toString('base64')}" width="1200" height="1000"/></svg>`).render();
  const o = (565 * 1200 + 600) * 4;
  assert.ok(r.pixels[o] > 150 && r.pixels[o + 1] < 60, `pixel ${[...r.pixels.subarray(o, o + 3)]}`);
});

test('capa única perde a margem branca e não fica pequena na arte', async () => {
  const { gerarArte } = await import('../lib/arte.js');
  // Foto montada: produtos pequenos num fundo branco grande
  const foto = png(800, 500, '<rect width="800" height="500" fill="#fff"/><rect x="300" y="190" width="200" height="120" fill="#c00"/>');
  const arte = await gerarArte({ titulo: 'Combo', preco: '4.646,00', condicao: 'à vista', capa: foto });
  const r = new Resvg(`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1000"><image href="data:image/png;base64,${arte.toString('base64')}" width="1200" height="1000"/></svg>`).render();
  // Sem o corte o vermelho ficava entre x 528 e 672; cortado, ocupa a largura das imagens largas
  const o = (571 * 1200 + 250) * 4;
  assert.ok(r.pixels[o] > 150 && r.pixels[o + 1] < 60, `pixel ${[...r.pixels.subarray(o, o + 3)]}`);
});

test('foto larga com fundo próprio ocupa o quadro inteiro; capa e foto em fundo branco não', async () => {
  const { gerarArte, ehFotoCheia } = await import('../lib/arte.js');
  const pixel = (png, x, y) => {
    const r = new Resvg(`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1000"><image href="data:image/png;base64,${png.toString('base64')}" width="1200" height="1000"/></svg>`).render();
    const o = (y * 1200 + x) * 4;
    return [...r.pixels.subarray(o, o + 3)];
  };
  // Foto de colecionador: fundo verde-escuro até a borda, com moldura branca de print
  const foto = png(1030, 630, '<rect width="1030" height="630" fill="#fff"/><rect x="5" y="5" width="1020" height="620" fill="#123c3c"/><rect x="300" y="200" width="400" height="200" fill="#c00"/>');
  const arte = await gerarArte({ titulo: '', preco: '1.449,53', condicao: 'à vista', capa: foto });
  // Beirada do quadro e lugar dos ícones das redes: o fundo da foto, sem branco nem ícones
  for (const [x, y] of [[10, 500], [10, 200], [1145, 470], [600, 965]]) {
    const [r, g, b] = pixel(arte, x, y);
    assert.ok(r < 60 && g > 40 && g < 90 && b > 40 && b < 90, `(${x},${y}) ${[r, g, b]}`);
  }
  // Capa em pé ou foto em fundo branco: desenho de sempre, com o quadro branco
  const capaEmPe = png(400, 500, '<rect width="400" height="500" fill="#123c3c"/>');
  assert.equal(ehFotoCheia(capaEmPe), false);
  // Print do Mercado Livre: a foto com uma margem branca larga em volta também enche
  const print = png(1300, 900, '<rect width="1300" height="900" fill="#fff"/><rect x="120" y="110" width="1030" height="630" fill="#123c3c"/>');
  const [pr, pg] = pixel(await gerarArte({ titulo: '', preco: '1.449,53', capa: print }), 10, 500);
  assert.ok(pr < 60 && pg > 40 && pg < 90, `print ${[pr, pg]}`);
  // TV com pé em fundo branco: o recorte tem cantos brancos
  const branca = png(800, 500, '<rect width="800" height="500" fill="#fff"/><rect x="200" y="100" width="400" height="250" fill="#123c3c"/><rect x="380" y="350" width="40" height="50" fill="#333"/>');
  assert.deepEqual(pixel(await gerarArte({ titulo: '', preco: '10,00', capa: branca }), 10, 500), [255, 255, 255]);
});
