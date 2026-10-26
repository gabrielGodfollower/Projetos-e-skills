// Escolhe a imagem da arte e gera a arte. No modelo Jogo Barato, com o banco de capas
// ligado, segue o conversor em HTML (25.html):
// - oferta com dois ou mais produtos: colagem com a capa de cada um, achada no banco;
// - um produto só: a foto que veio com a oferta, senão a capa do banco, senão a imagem do link.
// No JB Indica (e sem banco) a imagem é a foto da oferta ou a do link, como antes.
import { gerarArte, dadosDaOferta, modeloDoGrupo } from './arte.js';
import { bancoLigado, capaDoBanco } from './banco.js';
import { produtosDoTexto, primeiraLinhaEhProduto, maisBarato } from './produtos.js';

async function doBanco(nome, contexto) {
  try {
    return await capaDoBanco(nome, contexto);
  } catch (e) {
    console.error(e);
    return null;
  }
}

// "foto": a foto que veio com a oferta (ou que a pessoa mandou respondendo à arte).
// "soFoto": a pessoa escolheu a foto, então nada de banco nem colagem.
// "capaDoLink": função que procura a imagem pela página do link, chamada só se precisar.
// "semImagem": gera a arte mesmo sem achar imagem nenhuma (senão png fica null).
// Devolve { png, imagem: 'colagem' | 'foto' | 'banco' | 'link' | null, capas, faltam }
export async function arteDaOferta(texto, { grupo = 'jb', foto = null, soFoto = false, semImagem = false, capaDoLink = async () => null } = {}) {
  const modelo = modeloDoGrupo(grupo);
  const dados = dadosDaOferta(texto);
  const banco = modelo === 'jb' && bancoLigado() && !soFoto;
  const produtos = modelo === 'jb' ? produtosDoTexto(texto) : [];
  if (produtos.length >= 2) {
    // Vários produtos: vale o menor preço, e o "parcelado" segue o bloco desse produto.
    // O título só fica se a primeira linha não for o nome de um dos produtos
    const barato = maisBarato(produtos);
    dados.preco = barato.preco;
    dados.condicao = barato.avista ? 'à vista' : 'parcelado';
    if (primeiraLinhaEhProduto(texto, produtos)) dados.titulo = '';
  }

  if (banco && produtos.length >= 2) {
    const achados = await Promise.all(produtos.map(p => doBanco(p.nome, p.bloco)));
    const capas = achados.filter(Boolean).map(a => a.capa);
    // Com menos de duas capas no banco não tem colagem: usa a foto da oferta
    if (capas.length >= 2) {
      return {
        png: await gerarArte({ ...dados, capas, modelo }),
        imagem: 'colagem',
        capas: capas.length,
        faltam: produtos.filter((p, i) => !achados[i]).map(p => p.nome)
      };
    }
  }

  let capa = foto, imagem = foto ? 'foto' : null;
  if (!capa && banco) {
    const primeira = texto.split('\n').map(l => l.trim()).find(l => /[a-zA-ZÀ-ú]{3}/.test(l)) || '';
    const achada = await doBanco(dados.titulo || primeira, texto);
    if (achada) { capa = achada.capa; imagem = 'banco'; }
  }
  if (!capa) {
    capa = await capaDoLink();
    if (capa) imagem = 'link';
  }
  const png = capa || semImagem ? await gerarArte({ ...dados, capa, modelo }) : null;
  return { png, imagem, capas: 0, faltam: [] };
}
