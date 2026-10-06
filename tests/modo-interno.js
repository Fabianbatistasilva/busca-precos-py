// Textos e apelidos do modo interno da busca, usados só no teste de paridade. Não vão para o site.

// Como cada loja pode ser chamada no final do /comparar (texto já sem acentos e em minúsculas).
const storeAliases = [
  ['(?:atacado\\s*)?paraguai|atacadopy|ap', 'atacadoparaguai'],
  ['(?:atacado\\s*)?brasil|atacadobrasil|ab', 'atacadobrasil'],
  ['shape(?:\\s*total)?|shapetotal|st', 'shapetotal'],
  ['by\\s*pharmacon|bypharmacon|bymac|byp|by', 'bypharmacon'],
];

const compareHelp =
  'Use assim: */comparar MARCA1 MARCA2* ou */comparar MARCA1 MARCA2 LOJA*\n' +
  'Exemplos: /comparar ZPHC Cooper · /comparar alpha pharma x landerlan · /comparar zphc cooper shape\n' +
  'Lojas: shape, bypharmacon, paraguai, brasil';
const guide = `🤖 *Como usar*

*🔎 Buscar um produto*
Escreva o nome, o princípio ativo, a marca ou o código. Mostra a loja mais barata de cada produto, com estoque.
_enantato 250_ · _bratva_ · _ST-1396_

*⚖️ /comparar MARCA1 MARCA2*
Diz qual das duas marcas está mais barata em cada produto equivalente.
_/comparar zphc cooper_ · só numa loja: _/comparar zphc cooper shape_

*Código do produto:* é o que vem entre colchetes nas respostas.
ST = Shape Total · BY = ByPharmacon · AP = Atacado Paraguai · AB = Atacado Brasil

_Preços de 1 unidade, da última coleta das lojas. Avisos de preço, favoritos e PDFs continuam só no grupo do WhatsApp._`;
const otherCommand = 'Esse comando só funciona no grupo do WhatsApp. Aqui você pode buscar um produto ou usar */comparar MARCA1 MARCA2*.';

export default { storeAliases, compareHelp, guide, otherCommand };
