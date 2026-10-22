# Bot conversor do Jogo Barato

Bot do Telegram que faz o mesmo que o conversor em HTML: pega uma oferta, converte a formatação entre Telegram e WhatsApp e coloca o rodapé do grupo.

## Como usar

1. Encaminhe uma oferta do Telegram para o bot (com ou sem foto) ou cole o texto.
2. O bot responde com a versão para o WhatsApp e o rodapé do **Jogo Barato**. Segure a mensagem e toque em **Copiar**.
3. Os botões trocam o rodapé (**Jogo Barato**, **JB Indica** ou **Sem rodapé**) e o destino (**Para WhatsApp** ou **Para Telegram**).
4. Em **Para Telegram** a oferta volta já formatada (negrito, riscado, spoiler, links), pronta para encaminhar no grupo.

Se você colar um texto do WhatsApp (com `*negrito*`, `_itálico_`, `~riscado~`), o bot já abre na versão para o Telegram.

Comandos: `/ajuda` e `/id` (mostra seu ID do Telegram).

## Colocar no ar (grátis, na Vercel)

1. **Criar o bot:** no Telegram, fale com o [@BotFather](https://t.me/BotFather), mande `/newbot`, escolha nome e usuário. Ele te dá o **token**. Guarde, não mande para ninguém.
2. **Importar na Vercel:** em [vercel.com/new](https://vercel.com/new), importe este repositório e em **Root Directory** escolha `bot-conversor-jogobarato`. Framework: *Other*.
3. **Variáveis** (Settings > Environment Variables):
   - `TELEGRAM_BOT_TOKEN`: o token do BotFather.
   - `TELEGRAM_WEBHOOK_SECRET`: uma senha que você inventa, só letras, números, `_` e `-` (ex.: `jb_conversor_8f3k2`).
   - `ALLOWED_USERS` (opcional): IDs de quem pode usar, separados por vírgula. Sem isso, qualquer pessoa que achar o bot consegue usar.
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
- `api/setup.js`: liga o webhook e cadastra os comandos.
