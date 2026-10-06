// A busca do site tem de responder exatamente o mesmo texto que a busca interna (Python) para os mesmos dados.
// Os dois arquivos de comparação (dados.json e esperado.json) não ficam no repositório: são gerados no computador
// por gerar_esperado.py. Sem eles, estes testes são pulados.
process.env.TZ = 'America/Sao_Paulo';

import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

const { answer, compareBrands, prepare, search, searchDetails, setInternalMode } = await import('../bot.js');
setInternalMode((await import('./modo-interno.js')).default);

const file = (name) => new URL(name, import.meta.url);
const read = (name) => JSON.parse(readFileSync(file(name), 'utf8'));
const available = existsSync(file('./dados.json')) && existsSync(file('./esperado.json'));
if (!available) test('paridade com a busca interna', { skip: 'dados de comparação ausentes (ver gerar_esperado.py)' }, () => {});
const index = available ? prepare(read('./dados.json')) : null;
const expected = available ? read('./esperado.json') : { busca: {}, comparar: {}, mensagem: {} };

for (const [query, text] of Object.entries(expected.busca)) {
  test(`busca: ${JSON.stringify(query)}`, () => assert.equal(search(index, query), text));
}
for (const [query, text] of Object.entries(expected.comparar)) {
  test(`comparar: ${JSON.stringify(query)}`, () => assert.equal(compareBrands(index, query), text));
}
for (const [body, text] of Object.entries(expected.mensagem)) {
  test(`mensagem: ${JSON.stringify(body)}`, () => assert.equal(answer(index, body), text));
}

if (available) {
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
}
