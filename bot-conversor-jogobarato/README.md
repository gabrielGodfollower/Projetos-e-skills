# Bot conversor do Jogo Barato

Bot do Telegram que faz o mesmo que o conversor em HTML: pega uma oferta, converte a formatação entre Telegram e WhatsApp e coloca o rodapé do grupo.

## Como usar

1. Mande a foto da capa com o texto da oferta na legenda (ou encaminhe uma oferta do Telegram).
2. O bot já responde com a **arte** no padrão do Jogo Barato e o texto para o WhatsApp na legenda, com o rodapé do **Jogo Barato**. Segure a mensagem e toque em **Copiar**.
3. Os botões trocam o rodapé (**Jogo Barato**, **JB Indica** ou **Sem rodapé**) e o destino (**Para WhatsApp** ou **Para Telegram**). Se a oferta já vier com um rodapé ("Grupo de Promoções do...", "Canais de Promoções do..."), ele é trocado, não duplicado.
4. Pra trocar a capa, responda à arte com outra foto. Se a foto for pequena, o bot avisa.
5. Sem foto, o bot tenta pegar a capa pela página do link. Se não conseguir, responde só com o texto e pede a foto.

A arte usa o fundo `assets/fundo-arte.png`, título em Saira, preço em Teko Medium. O primeiro preço da oferta define o texto embaixo: "no pix"/"à vista" vira **à vista**, "em até 6x" vira **parcelado**.

**Encurtador:** com `YOURLS_SIGNATURE` configurado, os links de loja (Amazon, Mercado Livre...) viram links `jogobara.to` no YOURLS do Jogo Barato. Links que já são jogobara.to, Telegram ou WhatsApp ficam como estão. Pegue o token em YOURLS > **Tools** > *Secure passwordless API call* (o "signature token").

**Envio pro WhatsApp (SendFlow):** com `SENDFLOW_API_KEY` configurado, a resposta ganha o botão **📲 Enviar nos grupos do ...**. Ele manda a arte com o texto do WhatsApp na legenda (ou só o texto, se não tiver arte) pros grupos do lançamento do rodapé escolhido: `SENDFLOW_LANCAMENTO_JB` para o Jogo Barato e `SENDFLOW_LANCAMENTO_INDICA` para o JB Indica. O bot pede confirmação com o número de grupos antes de enviar, e depois marca a oferta como enviada para não sair duas vezes. Só funciona com `ALLOWED_USERS` preenchido. Mande `/sendflow` para o bot para ver o que falta configurar e os IDs dos lançamentos. O SendFlow baixa a arte pelo endereço `/arte/...` do próprio bot, que só entrega imagens com assinatura.

Comandos: `/ajuda`, `/id` (mostra seu ID do Telegram) e `/sendflow` (configuração do envio pro WhatsApp).

## Colocar no ar (grátis, na Vercel)

1. **Criar o bot:** no Telegram, fale com o [@BotFather](https://t.me/BotFather), mande `/newbot`, escolha nome e usuário. Ele te dá o **token**. Guarde, não mande para ninguém.
2. **Importar na Vercel:** em [vercel.com/new](https://vercel.com/new), importe este repositório e em **Root Directory** escolha `bot-conversor-jogobarato`. Framework: *Other*.
3. **Variáveis** (Settings > Environment Variables):
   - `TELEGRAM_BOT_TOKEN`: o token do BotFather.
   - `TELEGRAM_WEBHOOK_SECRET`: uma senha que você inventa, só letras, números, `_` e `-` (ex.: `jb_conversor_8f3k2`).
   - `YOURLS_SIGNATURE` (opcional): token do YOURLS para encurtar os links.
   - `ALLOWED_USERS` (opcional): IDs de quem pode usar, separados por vírgula. Sem isso, qualquer pessoa que achar o bot consegue usar.
   - `SENDFLOW_API_KEY`, `SENDFLOW_LANCAMENTO_JB`, `SENDFLOW_LANCAMENTO_INDICA` (opcional): envio pros grupos do WhatsApp pelo SendFlow.
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
- `lib/sendflow.js`: envio pros grupos do WhatsApp pelo SendFlow.
- `api/imagem.js`: entrega a arte pro SendFlow baixar (endereço com assinatura).
