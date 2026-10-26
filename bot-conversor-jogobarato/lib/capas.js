// Escolhe a imagem da arte e gera a arte. No modelo Jogo Barato, com o banco de capas
// ligado, segue o conversor em HTML (25.html):
// - oferta com dois ou mais produtos: colagem com a capa de cada um, achada no banco;
// - um produto só: a foto que veio com a oferta, senão a capa do banco, senão a imagem do link.
// No JB Indica (e sem banco) a imagem é a foto da oferta ou a do link, como antes.
// Fotos de um álbum (duas ou mais) viram colagem nos dois modelos, no lugar do banco.
import { gerarArte, dadosDaOferta, modeloDoGrupo } from './arte.js';
import { bancoLigado, capaDoBanco, capasDoCombo } from './banco.js';
import { produtosDoTexto, primeiraLinhaEhProduto, maisBarato } from './produtos.js';

async function doBanco(nome, contexto) {
  try {
    return await capaDoBanco(nome, contexto);
  } catch (e) {
    console.error(e);
    return null;
  }
}

// Capas de um produto: um combo ("Jogo 1 + 2") pode dar uma capa por jogo; sem achar
// as partes, procura o nome inteiro
async function capasDoProduto(nome, contexto) {
  try {
    const partes = await capasDoCombo(nome, contexto);
    if (partes && partes.length) return partes.map(p => p.capa);
  } catch (e) {
    console.error(e);
  }
  const a = await doBanco(nome, contexto);
  return a ? [a.capa] : [];
}

// "foto": a foto que veio com a oferta (ou que a pessoa mandou respondendo à arte).
// "fotos": as fotos de um álbum, na ordem em que foram mandadas.
// "soFoto": a pessoa escolheu a foto, então nada de banco nem colagem.
// "capaDoLink": função que procura a imagem pela página do link, chamada só se precisar.
// "semImagem": gera a arte mesmo sem achar imagem nenhuma (senão png fica null).
// Devolve { png, imagem: 'album' | 'colagem' | 'foto' | 'banco' | 'link' | null, capas, faltam }
export async function arteDaOferta(texto, { grupo = 'jb', foto = null, fotos = [], soFoto = false, semImagem = false, capaDoLink = async () => null } = {}) {
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

  // As fotos que a pessoa mandou valem mais que o banco
  if (fotos.length >= 2) {
    return { png: await gerarArte({ ...dados, capas: fotos, modelo }), imagem: 'album', capas: fotos.length, faltam: [] };
  }
  if (fotos.length) foto = fotos[0];

  if (banco && produtos.length >= 2) {
    const achados = await Promise.all(produtos.map(p => capasDoProduto(p.nome, p.bloco)));
    const capas = achados.flat();
    // Com menos de duas capas no banco não tem colagem: usa a foto da oferta
    if (capas.length >= 2) {
      return {
        png: await gerarArte({ ...dados, capas, modelo }),
        imagem: 'colagem',
        capas: capas.length,
        faltam: produtos.filter((p, i) => !achados[i].length).map(p => p.nome)
      };
    }
  }

  let capa = foto, imagem = foto ? 'foto' : null;
  if (!capa && banco) {
    const primeira = texto.split('\n').map(l => l.trim()).find(l => /[a-zA-ZÀ-ú]{3}/.test(l)) || '';
    const nome = dados.titulo || primeira;
    const achadas = await capasDoProduto(nome, texto);
    // Um combo com as capas de cada jogo vira colagem
    if (achadas.length >= 2) {
      return { png: await gerarArte({ ...dados, capas: achadas, modelo }), imagem: 'colagem', capas: achadas.length, faltam: [] };
    }
    if (achadas.length) { capa = achadas[0]; imagem = 'banco'; }
  }
  if (!capa) {
    capa = await capaDoLink();
    if (capa) imagem = 'link';
  }
  const png = capa || semImagem ? await gerarArte({ ...dados, capa, modelo }) : null;
  return { png, imagem, capas: 0, faltam: [] };
}
