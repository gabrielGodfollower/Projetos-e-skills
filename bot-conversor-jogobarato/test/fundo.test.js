import test from 'node:test';
import assert from 'node:assert/strict';
import { Resvg } from '@resvg/resvg-js';
import { tirarFundo } from '../lib/fundo.js';
import { arteDaOferta } from '../lib/capas.js';

test('tirarFundo manda a foto pro remove.bg e devolve o PNG', async () => {
  process.env.REMOVEBG_API_KEY = 'chave-de-teste';
  let pedido;
  const png = Buffer.from('png-recortado');
  const f = async (url, op) => { pedido = { url, op }; return new Response(png, { status: 200 }); };
  const r = await tirarFundo(Buffer.from('foto'), { fetch: f });
  assert.equal(r.toString(), 'png-recortado');
  assert.equal(pedido.url, 'https://api.remove.bg/v1.0/removebg');
  assert.equal(pedido.op.headers['X-Api-Key'], 'chave-de-teste');
  assert.equal(pedido.op.body.get('size'), 'auto');
});

test('tirarFundo explica a falta de créditos', async () => {
  const f = async () => new Response(JSON.stringify({ errors: [{ title: 'Insufficient credits' }] }), { status: 402 });
  await assert.rejects(tirarFundo(Buffer.from('foto'), { fetch: f }), /créditos/);
});

test('a arte usa a imagem recortada quando tem "recortar"', async () => {
  const foto = new Resvg('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect width="400" height="300" fill="#123c3c"/></svg>').render().asPng();
  let recebeu = null;
  const recortar = async capa => { recebeu = capa; return capa; };
  const arte = await arteDaOferta('Jogo X\nR$ 100,00', { foto, recortar });
  assert.ok(arte.png);
  assert.equal(recebeu, foto);
});
