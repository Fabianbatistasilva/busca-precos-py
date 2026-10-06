// O chat do site tem de responder exatamente o mesmo texto que o bot do WhatsApp.
// tests/esperado.json guarda as respostas do bot (Python) para os dados de tests/dados.json; ver gerar_esperado.py.
process.env.TZ = 'America/Sao_Paulo';

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const { answer, compareBrands, prepare, search, searchDetails } = await import('../bot.js');

const read = (name) => JSON.parse(readFileSync(new URL(name, import.meta.url), 'utf8'));
const index = prepare(read('./dados.json'));
const expected = read('./esperado.json');

for (const [query, text] of Object.entries(expected.busca)) {
  test(`busca: ${JSON.stringify(query)}`, () => assert.equal(search(index, query), text));
}
for (const [query, text] of Object.entries(expected.comparar)) {
  test(`comparar: ${JSON.stringify(query)}`, () => assert.equal(compareBrands(index, query), text));
}
for (const [body, text] of Object.entries(expected.mensagem)) {
  test(`mensagem: ${JSON.stringify(body)}`, () => assert.equal(answer(index, body), text));
}

test('texto sem barra é uma busca', () => {
  assert.equal(answer(index, 'enantato 250'), search(index, 'enantato 250'));
});

test('comandos do grupo que o site não tem avisam onde funcionam', () => {
  for (const body of ['/fav ST-1396', '/favlist', '/pdf', '/pdfvenda 80']) {
    assert.match(answer(index, body), /só funciona no grupo do WhatsApp/);
  }
  assert.match(answer(index, '/help'), /Como usar/);
});

test('resumo da busca diz o que achou e o que corrigiu', () => {
  const details = searchDetails(index, 'retatrutida zhpc');
  assert.deepEqual(details.corrected, [['zhpc', 'zphc']]);
  assert.ok(details.found > 0 && details.shown === details.found);
  assert.equal(searchDetails(index, 'xyzabc').mode, 'vazio');
});
