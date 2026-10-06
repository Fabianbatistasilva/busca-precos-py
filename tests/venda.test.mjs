// Modo venda (site do cliente): só nome e preço de venda. A origem do produto não pode aparecer.
process.env.TZ = 'America/Sao_Paulo';

import assert from 'node:assert/strict';
import { test } from 'node:test';

const { answer, prepare, search } = await import('../bot.js');

const features = (tokens, doses, extra = {}) => ({ tokens, doses, marcas: ['x'], count: null, volume: null, pack: null, form: null, ...extra });
const product = (id, brand, name, price, original, f) => ({
  loja: 'venda', id: String(id), nome: name, marca: brand, preco: price, disponivel: true,
  chave_marca: brand.toLowerCase().split(' ')[0], busca: original, f,
});
const DATA = {
  venda: true,
  gerado_em: '2026-10-06T19:42:00+00:00',
  cotacoes: { venda: 1 },
  lojas: { venda: '' },
  sinonimos: { testenat: ['testosterona', 'enantato'], trembo: ['trembolona'], enanbolic: ['testosterona', 'enantato'] },
  apelidos_marca: { lander: 'landerlan' },
  grupos: [],
  produtos: [
    product(1, 'LANDERLAN', 'Testenat Depot 4ml (Enantato de Testosterona)', 93, 'LANDER TESTENAT DEPOT X 4 ML.',
      features(['enantato', 'testosterona'], ['250mg'], { volume: 4 })),
    product(2, 'COOPER', 'Enanbolic 250mg 10ml', 311, 'COOPER ENANBOLIC X 250MG/10ML',
      features(['enantato', 'testosterona'], ['250mg'], { volume: 10 })),
    product(3, 'ZPHC', 'Testosterona Enantato 250mg 10ml', 293, 'ZPHC TEST ENANTATO 250MG/ML 10ML [ST-2157]',
      features(['enantato', 'testosterona'], ['250mg'], { volume: 10 })),
    product(4, 'ZPHC', 'Trembolona Enantato 200mg 10ml', 1418, 'ZPHC TREMBOLONA ENANTATO 200MG 10ML',
      features(['enantato', 'trembolona'], ['200mg'], { volume: 10 })),
    product(5, 'LANDERLAN', 'Trembolona Enantato 200mg/ml 10ml', 184, 'LANDERLAN Trembolona Enantato 200mg/ml 10ml',
      features(['enantato', 'trembolona'], ['200mg'], { volume: 10 })),
  ],
};
const index = prepare(DATA);

test('a busca mostra só o nome limpo e o preço de venda', () => {
  assert.equal(
    search(index, 'enantato de testosterona'),
    [
      '🔎 *enantato de testosterona* — 3 produto(s) disponíveis',
      '',
      '*LANDERLAN*',
      '• Testenat Depot 4ml (Enantato de Testosterona) — *R$ 93,00*',
      '',
      '*ZPHC*',
      '• Testosterona Enantato 250mg 10ml — *R$ 293,00*',
      '',
      '*COOPER*',
      '• Enanbolic 250mg 10ml — *R$ 311,00*',
      '',
      '_Preço por unidade · atualizado em 06/10 16:42_',
    ].join('\n'),
  );
});

test('acha pelo nome original do produto, sem mostrar esse nome', () => {
  const reply = search(index, 'lander testenat');
  assert.match(reply, /Testenat Depot 4ml/);
  assert.doesNotMatch(reply, /LANDER TESTENAT DEPOT X/);
});

test('busca ampla resume por tipo de produto, com as outras opções', () => {
  const reply = search(index, 'enantato', 3);
  assert.match(reply, /5 produto\(s\) disponíveis, de 2 tipo\(s\) de produto/);
  assert.match(reply, /• Testenat Depot 4ml \(Enantato de Testosterona\) — \*R\$ 93,00\* · \+2 até R\$ 311,00/);
  assert.match(reply, /• Trembolona Enantato 200mg\/ml 10ml — \*R\$ 184,00\* · \+1 até R\$ 1\.418,00/);
});

test('comparação de marcas sem loja nem código', () => {
  assert.equal(
    answer(index, '/comparar zphc cooper'),
    [
      '⚖️ *ZPHC x COOPER* — 1 produto(s) equivalentes disponíveis',
      '',
      '🏆 *ZPHC* mais barata em 1 · *COOPER* em 0',
      '',
      '• *ZPHC* · Testosterona Enantato 250mg 10ml — *R$ 293,00*',
      '   _COOPER: Enanbolic 250mg 10ml — R$ 311,00 (6% mais cara)_',
      '',
      '_Só entram produtos com o mesmo princípio ativo, a mesma dose (mg/UI) e a mesma quantidade (comprimidos ou ml) ' +
        'nas duas marcas. Preço por unidade · atualizado em 06/10 16:42_',
    ].join('\n'),
  );
  // "Só numa loja" não existe para o cliente.
  assert.match(answer(index, '/comparar zphc cooper shape'), /^Use assim: \*\/comparar MARCA1 MARCA2\*\n/);
});

test('nenhuma resposta fala de loja, dólar, código ou do grupo', () => {
  const asked = ['enantato', 'zphc', 'trembo', 'xyzabc', '', '/help', '/fav 1', '/pdf', '/comparar zphc cooper', '/comparar zphc landerlan', '/comparar a'];
  for (const text of asked) {
    assert.doesNotMatch(answer(index, text), /Shape|ByPharmacon|Atacado|US\$|WhatsApp|loja|estoque|coleta|\[[A-Z]{2}-/i, text);
  }
});
