# Tabela de preços (chat)

Página de chat em que o cliente busca um produto e vê o preço, compara duas marcas e
baixa a tabela completa em PDF. É um site estático: não tem servidor, e a busca roda no
navegador de quem acessa.

## Como funciona

1. A cada publicação, o site recebe dois arquivos prontos: `venda.json` (produtos e
   preços) e `tabela-precos.pdf` (a tabela completa).
2. `app.js` carrega `venda.json` ao abrir a página (e de novo se tiver mais de 5 minutos).
3. `bot.js` faz a busca e a comparação e devolve o texto; `app.js` mostra na conversa.

A publicação (`.github/workflows/publicar.yml`) roda a cada envio de código e algumas
vezes por hora, para trazer os preços novos. Se a fonte dos dados estiver fora do ar,
ficam os últimos arquivos salvos neste repositório.

## O que o chat responde

- Nome do produto, princípio ativo ou marca: o que está disponível e o preço.
- `/comparar MARCA1 MARCA2`: qual marca está mais barata em cada produto equivalente.
- `/help`: o guia.
- Botão **Tabela em PDF**: todos os produtos e preços.

A busca entende erro de digitação ("zhpc"), nomes colados ou separados ("bpc157",
"bpc 157") e nomes comerciais ("masteron" acha drostanolona).

## Arquivos

| Arquivo | Papel |
|---|---|
| `index.html` | A página e o visual |
| `app.js` | Carrega os dados e cuida da conversa |
| `bot.js` | Busca e comparação (sem nada de tela; roda também no Node) |
| `venda.json`, `tabela-precos.pdf` | Últimos dados salvos, usados se a atualização falhar |
| `tests/` | Testes da busca e da comparação |

## Testes

```
npm test
```

## Ver no computador

```
python -m http.server 8799
```

e abra `http://127.0.0.1:8799/`.
