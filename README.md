# Busca de preços (chat)

Página de chat que responde buscas de preço e comparações entre marcas, com as mesmas
respostas do bot do grupo do WhatsApp. É um site estático: não tem servidor, e a busca
roda no navegador de quem acessa.

## Como funciona

1. O coletor (repositório `respect-pharma-dashboard`) consulta as lojas e publica
   `bot.json` a cada coleta: os produtos, as cotações, os grupos de "mesmo produto" e a
   lista de sinônimos.
2. `app.js` baixa esse arquivo ao abrir a página (e de novo se ele tiver mais de 5 minutos).
3. `bot.js` faz a busca e a comparação e devolve o texto; `app.js` mostra na conversa.

As regras de leitura dos nomes (princípio ativo, dose, quantidade) ficam só no Python do
coletor. Cada produto já chega com isso extraído, então mexer nos sinônimos ou nas regras
lá muda o chat sem alterar este repositório.

## O que o chat responde

- Texto simples ou `/busca nome`: a loja mais barata de cada produto com estoque.
- `/comparar MARCA1 MARCA2 [loja]`: qual marca está mais barata em cada produto equivalente.
- `/help`: o guia.

Avisos de preço, favoritos e PDFs continuam só no grupo do WhatsApp.

## Arquivos

| Arquivo | Papel |
|---|---|
| `index.html` | A página e o visual |
| `app.js` | Carrega os dados e cuida da conversa |
| `bot.js` | Busca e comparação (sem nada de tela; roda também no Node) |
| `tests/` | Teste de paridade com o bot do WhatsApp |

O endereço dos dados fica em `DATA_URL`, no começo de `app.js`.

## Testes

```
npm test
```

O teste exige que `bot.js` responda **exatamente** o mesmo texto que o bot do WhatsApp para
106 consultas. `tests/esperado.json` guarda as respostas do bot em Python e `tests/dados.json`
os dados usados. Depois de mudar a busca no bot do WhatsApp, gere os dois de novo e ajuste
`bot.js` até o teste passar:

```
python tests/gerar_esperado.py --bot "C:/caminho/monitor-shapetotal" --exportador "C:/caminho/respect-pharma-dashboard/comparador"
```

## Ver no computador

```
python -m http.server 8799
```

e abra `http://127.0.0.1:8799/?dados=/tests/dados.json` (usa os dados do teste em vez dos publicados).
