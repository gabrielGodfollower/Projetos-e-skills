# Bot conversor do Jogo Barato

Bot do Telegram que faz o mesmo que o conversor em HTML: pega uma oferta, converte a formatação entre Telegram e WhatsApp e coloca o rodapé do grupo.

## Como usar

1. Mande a foto da capa com o texto da oferta na legenda (ou encaminhe uma oferta do Telegram).
2. O bot já responde com a **arte** no padrão do Jogo Barato e o texto para o WhatsApp na legenda, com o rodapé do **Jogo Barato**. Segure a mensagem e toque em **Copiar**.
3. Os botões trocam o rodapé (**Jogo Barato**, **JB Indica** ou **Sem rodapé**) e o destino (**Para WhatsApp** ou **Para Telegram**). Se a oferta já vier com um rodapé ("Grupo de Promoções do...", "Canais de Promoções do..."), ele é trocado, não duplicado.
4. Pra trocar a capa, responda à arte com outra foto. Se a foto for pequena, o bot avisa.
   Oferta mandada com várias fotos de uma vez (álbum, como as cores de um controle), ou várias fotos respondendo à arte, vira **colagem** com todas, no mesmo desenho da colagem do banco. O Telegram manda cada foto do álbum como uma mensagem separada; o bot junta as fotos na memória da função (sem banco de dados), e se uma foto chegar depois da arte pronta, ele refaz a arte. Se a Vercel mandar as fotos para instâncias diferentes, a arte sai com a foto que veio com o texto.
5. Sem foto, o bot procura a capa no banco de capas (se estiver ligado) e depois na página do link. Se não conseguir, responde só com o texto e pede a foto.
6. Oferta com dois ou mais jogos vira **colagem**, com a capa de cada jogo achada no banco (só no rodapé do Jogo Barato, como no conversor em HTML). Se faltar a capa de algum, o bot avisa quais. Pra usar uma foto só no lugar da colagem, responda à arte com ela.

A arte do Jogo Barato segue o conversor em HTML do Jogo Barato: mesmo fundo (`assets/fundo-arte.png`, 1200x1000), mesmas fontes (Teko e Baloo 2, em `assets/`) e mesmas posições. O produto encaixa em 90% da área de 640x580 a partir de (280, 281); imagem bem larga (duas capas lado a lado) pode chegar a 940 px de largura, com a mesma altura; o nome do produto sai em Baloo 2 Medium 25 px; o quadro do preço tem "a partir de", o valor e "parcelado", centralizados em 931 e alinhados à direita em 1120. O preço é o menor valor da oferta, sem cupom, cashback, frete nem o valor da parcela ("10x de R$ 29,99"), sempre com centavos. Se o texto fala em Pix ou à vista, a linha "parcelado" não aparece.

**Banco de capas e colagem** (igual ao `25.html`): o banco é uma pasta pública do Google Drive com as capas, com nomes como `Persona 4 Revival (PS5) (BR).png` (nome, plataforma e país entre parênteses). O bot compara as palavras do nome do jogo com as do arquivo (pelo menos 60% iguais), fica com a mesma plataforma e prefere os países na ordem de `BANCO_PAISES` (padrão `BR, LATAM, NA, EU`); "versão americana", "europeia", "japonesa" ou "latam" no texto passa na frente. Um produto é cada bloco do texto (separado por linha em branco) com um nome e um preço; blocos que começam com nome de loja não contam, e linhas como `👉 PS5: link` viram uma capa por plataforma. Na colagem, as capas ficam com a mesma altura em 1 ou 2 fileiras na área de 1020x580 a partir de (50, 275), com a margem branca cortada; duas capas saem a 80% do tamanho máximo, três no máximo do tamanho de três caixas de PS5, e cabem até 12 (até 3 fileiras a partir de 5; o HTML para em 4); com mais, a última ganha um selo "+N". O preço da colagem é o do jogo mais barato, e o "parcelado" segue o bloco dele; o título sai em branco se a primeira linha for o nome de um dos jogos.

**Combos com "+"**: no banco, um nome como `Until Dawn 1 + 2` ou `God of War Laufey + Ragnarök` vira uma capa por jogo. A parte depois do "+" também é procurada com as primeiras palavras da primeira ("Until Dawn 2", "God of War Ragnarök"), e fica a que combinar melhor. Um combo sozinho já vira colagem; numa lista, as capas de cada combo entram na ordem do texto.

**Lista de várias ofertas (`/lista`)**: mande `/lista` na primeira linha e, embaixo, cada oferta separada por uma linha em branco, com o nome na primeira linha e, em qualquer ordem, o cupom (`cupom X` ou só o código, como `PRIMEGAME5`), o link, os preços (`408,40 no Pix`, `429,90 em até 8x`, ou os dois na mesma linha separados por `/`) e `Frete Grátis`. O bot devolve a lista com os nomes em negrito, 🎟 no cupom, 👉 no link e • nos preços, do menor para o maior preço, e responde a ela com a arte e o texto para o WhatsApp, como uma oferta normal. Um primeiro bloco sem link, preço nem cupom é o título; sem ele, o título é `[Loja] Jogos em promoção`, com a loja do primeiro link (o bot segue o jogobara.to até a loja). `/lista` sozinho mostra um exemplo. Também dá para colar depois do `/lista` uma oferta copiada de outro grupo (🔥 nos preços, 💳, `* KaBuM!` como nome de cada loja): os emojis de lá saem, entra o padrão daqui, as lojas ficam do menor para o maior preço e o rodapé do outro grupo sai. Links escondidos num "👉" (quando a cópia mantém o link) entram no texto; se faltar link, o bot avisa em quais lojas. Oferta nesse estilo de outro grupo (🔥 ou 💳 nos preços, `* Loja`) é formatada sozinha, mesmo sem o `/lista`.

**Links de outros grupos** (`lib/limpeza.js`): numa oferta copiada de outro grupo, o bot segue cada link (amzn.to, meli.la, tidd.ly, Awin...) até a loja e tira os parâmetros de afiliado antes de encurtar. Na Amazon entra a tag do Jogo Barato, se `AMAZON_TAG` estiver na Vercel (o ID de rastreamento do Amazon Associados, como `nome-20`). Nas outras lojas o link fica limpo, sem afiliado, e o bot avisa para gerar o link de vocês. Link que não chega numa loja (ou cai na vitrine "social" de outro afiliado no Mercado Livre) fica como está, com aviso.

**Encurtador:** com `YOURLS_SIGNATURE` configurado, os links de loja (Amazon, Mercado Livre...) viram links `jogobara.to` no YOURLS do Jogo Barato. Links que já são jogobara.to, Telegram ou WhatsApp ficam como estão. Pegue o token em YOURLS > **Tools** > *Secure passwordless API call* (o "signature token").

**Tirar fundo (remove.bg):** com `REMOVEBG_API_KEY` configurado, a arte feita com uma imagem só (foto da oferta, banco ou link) ganha o botão **✂️ Tirar fundo**. Ele manda a imagem pro remove.bg, refaz a arte com os itens recortados no quadro branco e troca o botão por **↩️ Voltar o fundo**. Cada recorte em tamanho cheio gasta 1 crédito da conta do remove.bg, por isso só roda quando alguém aperta. Trocar entre Jogo Barato e JB Indica refaz a arte com o fundo de volta.

**Envio pro WhatsApp (SendFlow):** com `SENDFLOW_API_KEY` configurado, a resposta ganha o botão **📲 Enviar nos grupos do ...**. Ele manda a arte com o texto do WhatsApp na legenda (ou só o texto, se não tiver arte) pros grupos do lançamento do rodapé escolhido: `SENDFLOW_LANCAMENTO_JB` para o Jogo Barato e `SENDFLOW_LANCAMENTO_INDICA` para o JB Indica. O bot pede confirmação com o número de grupos antes de enviar, e depois marca a oferta como enviada para não sair duas vezes. Só funciona com `ALLOWED_USERS` preenchido. Mande `/sendflow` para o bot para ver o que falta configurar e os IDs dos lançamentos. O SendFlow baixa a arte pelo endereço `/arte/...` do próprio bot, que só entrega imagens com assinatura.

Comandos: `/ajuda`, `/id` (mostra seu ID do Telegram), `/sendflow` (configuração do envio pro WhatsApp), `/lista` (monta uma lista de várias ofertas) e `/banco` (confere o banco de capas e atualiza a lista; `/banco nome do jogo` mostra as capas que combinam, com ✅ na que a arte usaria).

## Colocar no ar (grátis, na Vercel)

1. **Criar o bot:** no Telegram, fale com o [@BotFather](https://t.me/BotFather), mande `/newbot`, escolha nome e usuário. Ele te dá o **token**. Guarde, não mande para ninguém.
2. **Importar na Vercel:** em [vercel.com/new](https://vercel.com/new), importe este repositório e em **Root Directory** escolha `bot-conversor-jogobarato`. Framework: *Other*.
3. **Variáveis** (Settings > Environment Variables):
   - `TELEGRAM_BOT_TOKEN`: o token do BotFather.
   - `TELEGRAM_WEBHOOK_SECRET`: uma senha que você inventa, só letras, números, `_` e `-` (ex.: `jb_conversor_8f3k2`).
   - `YOURLS_SIGNATURE` (opcional): token do YOURLS para encurtar os links.
   - `ALLOWED_USERS` (opcional): IDs de quem pode usar, separados por vírgula. Sem isso, qualquer pessoa que achar o bot consegue usar.
   - `REMOVEBG_API_KEY` (opcional): botão de tirar o fundo da foto pelo remove.bg (chave em remove.bg > API Keys).
   - `SENDFLOW_API_KEY`, `SENDFLOW_LANCAMENTO_JB`, `SENDFLOW_LANCAMENTO_INDICA` (opcional): envio pros grupos do WhatsApp pelo SendFlow.
   - `BANCO_DRIVE_PASTA` e `BANCO_DRIVE_CHAVE` (opcional): o ID da pasta do banco de capas no Google Drive e a chave da API do Google que lê a pasta (os mesmos do conversor em HTML). `BANCO_PAISES` (opcional) muda a ordem de preferência dos países.
4. Faça o deploy (ou **Redeploy** depois de colocar as variáveis).
5. **Ligar o bot:** abra no navegador `https://SEU-PROJETO.vercel.app/api/setup?segredo=SUA_SENHA`. Deve aparecer "Pronto! O bot @... está ligado".
6. Mande `/id` para o bot, coloque seu ID (e o do seu primo) em `ALLOWED_USERS` e faça Redeploy.

## Testes

```
npm test
```

## Arquivos

- `lib/conversor.js`: regras de conversão (as mesmas do conversor em HTML).
- `api/telegram.js`: webhook que recebe as mensagens e os botões.
- `lib/arte.js`: monta a arte da oferta (satori + resvg).
- `api/setup.js`: liga o webhook e cadastra os comandos.
- `lib/lista.js`: monta o texto do `/lista`.
- `lib/sendflow.js`: envio pros grupos do WhatsApp pelo SendFlow.
- `api/imagem.js`: entrega a arte pro SendFlow baixar (endereço com assinatura).
