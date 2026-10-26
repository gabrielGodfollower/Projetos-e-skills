import test from 'node:test';
import assert from 'node:assert/strict';
import { semAfiliado, limparLinks } from '../lib/limpeza.js';

test('tira o afiliado dos outros e põe a tag do Jogo Barato na Amazon', () => {
  assert.equal(semAfiliado('https://www.amazon.com.br/Controle-DualSense/dp/B0F1234567/ref=sr_1?tag=outro-20&linkCode=ll1', { amazonTag: 'jogobarato-20' }),
    'https://www.amazon.com.br/dp/B0F1234567?tag=jogobarato-20');
  assert.equal(semAfiliado('https://www.amazon.com.br/dp/B0F1234567?tag=outro-20', { amazonTag: '' }), 'https://www.amazon.com.br/dp/B0F1234567');
  assert.equal(semAfiliado('https://www.kabum.com.br/produto/123/controle?awc=1_2&utm_source=x'), 'https://www.kabum.com.br/produto/123/controle');
});

test('segue os redirecionamentos até a loja e avisa o que não dá para limpar', async () => {
  const fetchOriginal = globalThis.fetch;
  const destinos = {
    'https://amzn.to/abc': 'https://www.amazon.com.br/dp/B0F1234567?tag=outro-20',
    'https://tidd.ly/xyz': 'https://www.awin1.com/cread.php?awinmid=1&ued=' + encodeURIComponent('https://www.kabum.com.br/produto/123/x?awc=9'),
    'https://meli.la/q1': 'https://www.mercadolivre.com.br/social/outrogrupo?matt_word=x'
  };
  globalThis.fetch = async u => {
    const d = destinos[String(u)];
    return new Response('', d ? { status: 301, headers: { location: d } } : { status: 200 });
  };
  process.env.AMAZON_TAG = 'jogobarato-20';
  try {
    const r = await limparLinks('👉 https://amzn.to/abc\n👉 https://tidd.ly/xyz\n👉 https://meli.la/q1\n👉 https://jogobara.to/M05ex');
    assert.equal(r.texto, '👉 https://www.amazon.com.br/dp/B0F1234567?tag=jogobarato-20\n👉 https://www.kabum.com.br/produto/123/x\n👉 https://meli.la/q1\n👉 https://jogobara.to/M05ex');
    assert.deepEqual(r.semComissao, ['KaBuM!']);
    assert.deepEqual(r.naoLimpos, ['https://meli.la/q1']);
  } finally {
    globalThis.fetch = fetchOriginal;
    delete process.env.AMAZON_TAG;
  }
});
