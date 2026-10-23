import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { lista, idDoGrupo, prepararEnvio, enviarProsGrupos } from '../lib/sendflow.js';
import { assinarArquivo, linkPublicoDaFoto } from '../lib/telegram.js';

// Respostas falsas do SendFlow, guardando o que o bot pediu
let pedidos = [];
function fingirSendflow(rotas) {
  pedidos = [];
  globalThis.fetch = async (url, op = {}) => {
    const caminho = new URL(url).pathname;
    pedidos.push({ caminho, metodo: op.method, auth: op.headers.authorization, corpo: op.body && JSON.parse(op.body) });
    const [status, corpo] = rotas[op.method + ' ' + caminho] || [404, { message: 'não existe' }];
    return { ok: status < 300, status, text: async () => JSON.stringify(corpo) };
  };
}

beforeEach(() => {
  process.env.SENDFLOW_API_KEY = ' chave-teste ';
  process.env.SENDFLOW_LANCAMENTO_JB = 'rel1';
  delete process.env.SENDFLOW_LANCAMENTO_INDICA;
  delete process.env.SENDFLOW_CONTA;
});

test('lista aceita resposta solta, em "data" e aninhada', () => {
  assert.deepEqual(lista([{ id: 1 }]), [{ id: 1 }]);
  assert.deepEqual(lista({ data: [[{ id: 1 }], [{ id: 2 }]] }), [{ id: 1 }, { id: 2 }]);
  assert.deepEqual(lista(null), []);
});

test('ID do grupo do WhatsApp vem do gid, do jid ou do id', () => {
  assert.equal(idDoGrupo({ id: 'abc', gid: '120363111' }), '120363111');
  assert.equal(idDoGrupo({ id: 'abc', jid: '120363222@g.us' }), '120363222');
  assert.equal(idDoGrupo({ id: 'abc' }), null);
});

test('prepara e manda a arte pros grupos do lançamento', async () => {
  fingirSendflow({
    'GET /releases': [200, [{ id: 'rel1', name: 'Jogo Barato', accountIds: ['conta9'] }, { id: 'velho', archived: true }]],
    'GET /releases/rel1/groups': [200, [[{ id: 'x', gid: '120363001' }, { id: 'y', jid: '120363002@g.us' }], [{ id: 'z' }]]],
    'POST /actions/send-image-message': [200, { success: true }]
  });
  const envio = await prepararEnvio('jb');
  assert.deepEqual(envio, { accountId: 'conta9', releaseId: 'rel1', groupIds: ['120363001', '120363002'] });
  assert.equal(await enviarProsGrupos(envio, { texto: '*Oferta*', imagem: 'https://bot/arte/a/b.jpg' }), 2);
  const ultimo = pedidos.at(-1);
  assert.equal(ultimo.auth, 'Bearer chave-teste');
  assert.deepEqual(ultimo.corpo, {
    accountId: 'conta9', releaseId: 'rel1', chooseSpecificGroups: true,
    groupIds: ['120363001', '120363002'], url: 'https://bot/arte/a/b.jpg', caption: '*Oferta*'
  });
});

test('sem imagem manda só o texto', async () => {
  fingirSendflow({ 'POST /actions/send-text-message': [200, { success: true }] });
  await enviarProsGrupos({ accountId: 'c', releaseId: 'r', groupIds: ['120363001'] }, { texto: 'oi' });
  assert.equal(pedidos[0].corpo.messageText, 'oi');
});

test('erros do SendFlow viram motivo em português', async () => {
  await assert.rejects(prepararEnvio('ind'), /SENDFLOW_LANCAMENTO_INDICA/);
  fingirSendflow({ 'GET /releases': [401, { message: 'Unauthorized' }] });
  await assert.rejects(prepararEnvio('jb'), /chave da API foi recusada/);
  fingirSendflow({ 'GET /releases': [200, []] });
  await assert.rejects(prepararEnvio('jb'), /lançamento não encontrado/);
  process.env.SENDFLOW_CONTA = 'c';
  fingirSendflow({ 'GET /releases/rel1/groups': [409, {}] });
  await assert.rejects(prepararEnvio('jb'), /desconectado/);
  fingirSendflow({ 'POST /actions/send-text-message': [200, { success: false, message: 'grupo cheio' }] });
  await assert.rejects(enviarProsGrupos({ accountId: 'c', releaseId: 'r', groupIds: ['1'] }, { texto: 'oi' }), /grupo cheio/);
});

test('link público da arte leva assinatura e não o token', () => {
  process.env.TELEGRAM_WEBHOOK_SECRET = 'segredo';
  process.env.TELEGRAM_BOT_TOKEN = '123:token-secreto';
  const link = linkPublicoDaFoto('bot.vercel.app', 'AgACAgEAAx');
  assert.equal(link, `https://bot.vercel.app/arte/${assinarArquivo('AgACAgEAAx')}/AgACAgEAAx.jpg`);
  assert.ok(!link.includes('token-secreto'));
  assert.notEqual(assinarArquivo('AgACAgEAAx'), assinarArquivo('outro'));
});
