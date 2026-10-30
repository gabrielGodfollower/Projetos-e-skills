import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { textoPlano, textoCurto, contarCaracteres, publicar, registrarNoHistorico, miniatura, esquecerCache } from '../lib/script.js';

// Script do Google falso, guardando o que o bot pediu
let pedidos = [];
function fingirScript(respostas) {
  pedidos = [];
  globalThis.fetch = async (url, op = {}) => {
    const dados = JSON.parse(op.body);
    pedidos.push({ url: String(url), tipo: op.headers['content-type'], ...dados });
    const r = respostas[dados.acao];
    const corpo = typeof r === 'function' ? r(dados) : r || { ok: false, erro: 'ação desconhecida' };
    return new Response(JSON.stringify(corpo));
  };
}

beforeEach(() => {
  process.env.SF_SCRIPT_URL = 'https://script.google.com/macros/s/teste/exec';
  process.env.SF_SCRIPT_SENHA = 'senha-teste';
  esquecerCache();
});

test('texto do WhatsApp vira texto puro, sem mexer nos links', () => {
  assert.equal(textoPlano('*Elden Ring*\n_R$ 99,90_ no Pix\nhttps://jogobara.to/a_b_c'), 'Elden Ring\nR$ 99,90 no Pix\nhttps://jogobara.to/a_b_c');
});

test('texto curto: inteiro quando cabe, senão título, preço e link (27.html)', () => {
  const curto = 'Elden Ring\nR$ 99,90 no Pix\nhttps://jogobara.to/abc';
  assert.equal(textoCurto(curto, 300), curto);
  const longo = 'Elden Ring Nightreign Deluxe Edition PS5 com um título bem comprido que não cabe de jeito nenhum no limite\n\n' +
    'R$ 199,90 no Pix\nR$ 219,90 em até 10x\n' + 'Texto explicando a promoção. '.repeat(12) + '\nhttps://jogobara.to/abc';
  const t = textoCurto(longo, 120);
  assert.ok(contarCaracteres(t) <= 120, t);
  assert.match(t, /R\$ 199,90 no Pix\nR\$ 219,90 em 10x\njogobara\.to\/abc$/);
  assert.match(t.split('\n')[0], /…$/);
});

test('texto curto com vários produtos: um item por produto e "+ N ofertas no grupo"', () => {
  const produtos = [1, 2, 3, 4, 5, 6].map(i => ({ nome: 'Jogo número ' + i, precoTxt: 'R$ ' + i + '9,90', bloco: 'https://jogobara.to/j' + i }));
  const plano = 'Jogos em promoção\n\n' + produtos.map(p => `${p.nome}\n${p.precoTxt} no Pix\n${p.bloco}\nmais um texto longo pra não caber`).join('\n\n');
  const t = textoCurto(plano, 160, produtos);
  assert.ok(contarCaracteres(t) <= 160, t);
  assert.match(t, /^Jogos em promoção\n• Jogo número 1 – R\$ 19,90 jogobara\.to\/j1\n/);
  assert.match(t, /\n\+ \d ofertas no grupo$/);
});

test('publica no WhatsApp e nas redes pelo script e guarda os posts', async () => {
  fingirScript({
    enviar: { ok: true, resultados: [{ ok: true, nome: 'Grupos JB' }, { ok: false, nome: 'Grupos VIP', erro: 'desconectado' }] },
    bluesky: { ok: true, ref: 'at://1', link: 'https://bsky.app/1' },
    threads: { ok: false, erro: 'token vencido' },
    x: { ok: true }
  });
  const jpeg = Buffer.from('jpeg');
  const r = await publicar({
    jpeg, legenda: 'texto wa', textos: { bluesky: 'bs', threads: 'th', x: 'xx' }, alt: 'Elden Ring',
    destinos: { campanhas: ['c1', 'c2'], velocidade: 'fast', redes: ['bluesky', 'threads', 'x'] }
  });
  assert.deepEqual(r.resultados.map(x => [x.ok, x.texto]), [
    [true, 'WhatsApp · Grupos JB'], [false, 'WhatsApp · Grupos VIP: desconectado'],
    [true, 'Bluesky'], [false, 'Threads: token vencido'], [true, 'X (pelo Buffer)']
  ]);
  assert.deepEqual(r.posts, { bluesky: [{ ref: 'at://1', link: 'https://bsky.app/1' }] });
  const env = pedidos.find(p => p.acao === 'enviar');
  assert.equal(env.senha, 'senha-teste');
  assert.equal(env.tipo, 'text/plain;charset=utf-8');
  assert.deepEqual([env.imagem, env.legenda, env.campanhas, env.velocidade], [jpeg.toString('base64'), 'texto wa', ['c1', 'c2'], 'fast']);
  assert.equal(pedidos.find(p => p.acao === 'bluesky').alt, 'Elden Ring');
});

test('registra no histórico com a miniatura da arte', async () => {
  fingirScript({ 'hist-salvar': d => ({ ok: true, item: { id: d.item.id } }), 'hist-imagens': { ok: true } });
  const jpeg = readFileSync(new URL('./arte-pequena.jpg', import.meta.url));
  await registrarNoHistorico({ entrada: 'oferta', saida: 'oferta wa', rodape: 'jb', posts: {}, jpeg });
  const [salvar, imagens] = pedidos;
  assert.equal(salvar.item.sentido, 'tg-wa');
  assert.equal(salvar.item.saida, 'oferta wa');
  assert.equal(imagens.id, salvar.item.id);
  const mini = Buffer.from(imagens.mini, 'base64');
  assert.equal(mini.readUInt32BE(16), 120);
  assert.equal(mini.readUInt32BE(20), 100);
});

test('sem configuração, o script não é chamado', async () => {
  delete process.env.SF_SCRIPT_SENHA;
  await assert.rejects(registrarNoHistorico({ entrada: 'a', saida: 'b', rodape: 'jb', posts: {} }), /SF_SCRIPT_SENHA/);
  assert.ok(miniatura);
});
