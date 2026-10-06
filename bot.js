// Busca e comparação de preços, iguais às do bot do WhatsApp (bot_busca.py), rodando no navegador.
// As regras de leitura dos nomes ficam no Python: cada produto já chega com o princípio ativo, a dose e a
// quantidade extraídos, junto com a lista de sinônimos. Aqui só se busca, compara e monta o texto.

export const MAX_PRODUCTS = 40;
export const MAX_COMPARED = 30;
const MIN_EQUIVALENCE = 0.62;
const BEST_MARGIN = 0.1;
// Preço de centavos é marcador da loja (item vencido, "consulte"), não oferta.
const MIN_PRICE_USD = 1;
const MIN_TYPO_LENGTH = 4;
// Um agrupamento que deixa quase tudo num grupo só não resume nada.
const MAX_GROUP_SHARE = 0.7;

// Palavras de ligação: "enantato de testosterona" busca o mesmo que "enantato testosterona".
const CONNECTORS = new Set(['de', 'da', 'do', 'das', 'dos', 'com', 'para']);
// Complementos do nome da marca que cada loja escreve de um jeito ("King Farma", "King Pharma", "King").
const BRAND_FILLERS = new Set(['pharma', 'farma', 'pharm', 'labs', 'lab']);
const ROMAN = { ii: '2', iii: '3' };

// Como cada loja pode ser chamada no final do /comparar (texto já sem acentos e em minúsculas).
const STORE_ALIASES = [
  ['(?:atacado\\s*)?paraguai|atacadopy|ap', 'atacadoparaguai'],
  ['(?:atacado\\s*)?brasil|atacadobrasil|ab', 'atacadobrasil'],
  ['shape(?:\\s*total)?|shapetotal|st', 'shapetotal'],
  ['by\\s*pharmacon|bypharmacon|bymac|byp|by', 'bypharmacon'],
];

export const HELP = 'Use assim: */busca nome do produto*\nExemplo: /busca enantato 250';
export const COMPARE_HELP =
  'Use assim: */comparar MARCA1 MARCA2* ou */comparar MARCA1 MARCA2 LOJA*\n' +
  'Exemplos: /comparar ZPHC Cooper · /comparar alpha pharma x landerlan · /comparar zphc cooper shape\n' +
  'Lojas: shape, bypharmacon, paraguai, brasil';
export const GUIDE = `🤖 *Como usar*

*🔎 Buscar um produto*
Escreva o nome, o princípio ativo, a marca ou o código. Mostra a loja mais barata de cada produto, com estoque.
_enantato 250_ · _bratva_ · _ST-1396_

*⚖️ /comparar MARCA1 MARCA2*
Diz qual das duas marcas está mais barata em cada produto equivalente.
_/comparar zphc cooper_ · só numa loja: _/comparar zphc cooper shape_

*Código do produto:* é o que vem entre colchetes nas respostas.
ST = Shape Total · BY = ByPharmacon · AP = Atacado Paraguai · AB = Atacado Brasil

_Preços de 1 unidade, da última coleta das lojas. Avisos de preço, favoritos e PDFs continuam só no grupo do WhatsApp._`;
const WHATSAPP_ONLY = 'Esse comando só funciona no grupo do WhatsApp. Aqui você pode buscar um produto ou usar */comparar MARCA1 MARCA2*.';

export function normalizeText(value) {
  return String(value ?? '').normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase();
}

function words(text) {
  return text.match(/[a-z0-9]+/g) || [];
}

function pieces(word) {
  return word.match(/[a-z]+|\d+/g) || [];
}

const isDigits = (text) => /^\d+$/.test(text);
const isAlpha = (text) => /^[a-z]+$/.test(text);

// Arredonda como o Python: no meio exato, vai para o par ("12,5%" vira 12; R$ 80,125 vira 80,12).
function roundHalfEven(value) {
  const floor = Math.floor(value);
  const rest = value - floor;
  if (rest !== 0.5) return rest > 0.5 ? floor + 1 : floor;
  return floor % 2 === 0 ? floor : floor + 1;
}

function fixed2(value) {
  const scaled = value * 100;
  const exactHalf = Number.isInteger(value * 8) && scaled - Math.floor(scaled) === 0.5;
  return exactHalf ? (roundHalfEven(scaled) / 100).toFixed(2) : value.toFixed(2);
}

function thousands(value) {
  const [whole, cents] = fixed2(value).split('.');
  return `${whole.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${cents}`;
}

export const formatBrl = (value) => `R$ ${thousands(value)}`;
export const formatUsd = (value) => `US$ ${thousands(value)}`;

const named = (item) => (item.codigo ? `[${item.codigo}] ${item.nome}` : item.nome);

function nameWords(items) {
  return words(normalizeText(items.map((item) => `${item.nome} ${item.marca || ''} ${item.detalhe || ''}`).join(' ')));
}

/** Prepara os dados uma vez: produtos agrupados, palavras de cada um e rótulos das marcas. */
export function prepare(data) {
  const products = data.produtos.map((item) => ({
    ...item,
    f: {
      ...item.f,
      tokens: new Set(item.f.tokens),
      doses: new Set(item.f.doses),
      marcas: new Set(item.f.marcas),
    },
  }));
  const rates = data.cotacoes || {};
  const hasBrl = products.every((item) => (rates[item.loja] || 0) > 0);
  const synonyms = new Map(Object.entries(data.sinonimos));
  const ingredients = new Set([...synonyms.values()].flat());

  const counts = new Map();
  for (const item of products) {
    if (!counts.has(item.chave_marca)) counts.set(item.chave_marca, new Map());
    const label = (item.marca || 'Sem marca').toUpperCase();
    const brand = counts.get(item.chave_marca);
    brand.set(label, (brand.get(label) || 0) + 1);
  }
  // A grafia mais usada da marca; no empate, a mais curta.
  const labels = new Map();
  for (const [key, brand] of counts) {
    let best = null;
    for (const [label, uses] of brand) {
      if (!best || uses > best[1] || (uses === best[1] && label.length < best[0].length)) best = [label, uses];
    }
    labels.set(key, best[0]);
  }

  // Cada entrada é um produto: os itens das lojas que vendem o mesmo, ou um item sozinho.
  const grouped = new Set();
  const entries = [];
  for (const group of data.grupos) {
    group.forEach((index) => grouped.add(index));
    entries.push({ items: group.map((index) => products[index]) });
  }
  products.forEach((item, index) => {
    if (!grouped.has(index)) entries.push({ items: [item] });
  });
  for (const entry of entries) {
    entry.words = nameWords(entry.items);
    entry.tokens = searchTokens(entry, synonyms);
  }

  const value = (item) => (hasBrl ? item.preco * rates[item.loja] : item.preco);
  const collected = new Date(data.gerado_em);
  const two = (number) => String(number).padStart(2, '0');
  return {
    products,
    entries,
    labels,
    rates,
    hasBrl,
    synonyms,
    ingredients,
    stores: data.lojas,
    aliases: data.apelidos_marca || {},
    value,
    generatedAt: collected,
    collected: `${two(collected.getDate())}/${two(collected.getMonth() + 1)} ${two(collected.getHours())}:${two(collected.getMinutes())}`,
    vocabulary: null,
  };
}

/** Palavras do produto mais o princípio ativo padronizado ("masteron" também vale como "drostanolona"). */
function searchTokens(entry, synonyms) {
  // Cada loja escreve de um jeito: "BPC 157", "BPC-157", "BPC157"; "100 MG", "100MG". Guarda as partes e as junções.
  const parts = entry.words.flatMap(pieces);
  const tokens = new Set([...entry.words, ...parts]);
  for (const sequence of [entry.words, parts]) {
    for (let index = 0; index + 1 < sequence.length; index += 1) {
      const [a, b] = [sequence[index], sequence[index + 1]];
      if (!(isDigits(a) && isDigits(b))) tokens.add(a + b);
    }
  }
  for (const word of entry.words) (synonyms.get(word) || []).forEach((canonical) => tokens.add(canonical));
  // O código inteiro também vale como palavra: "st-1396" ou "st1396".
  for (const item of entry.items) tokens.add(normalizeText(item.codigo || '').replaceAll('-', ''));
  return tokens;
}

function wordMatches(index, word, tokens) {
  // Terminou em número, vale a palavra inteira: "250" não é "2500", "t3" não é "t36".
  if (/\d$/.test(word)) return tokens.has(word);
  for (const token of tokens) if (token.startsWith(word)) return true;
  const canonical = index.synonyms.get(word);
  return Boolean(canonical) && canonical.every((name) => tokens.has(name));
}

/** Todas as palavras da consulta estão no produto, aceitando palavras coladas ou separadas de outro jeito. */
function wordsMatch(index, asked, tokens) {
  if (!asked.length) return true;
  if (wordMatches(index, asked[0], tokens) && wordsMatch(index, asked.slice(1), tokens)) return true;
  // "slu pp" para um produto escrito "SLUPP".
  if (asked.length > 1 && wordMatches(index, asked[0] + asked[1], tokens) && wordsMatch(index, asked.slice(2), tokens)) return true;
  // "slupp332" para um produto escrito "SLU-PP 332".
  const parts = pieces(asked[0]);
  if (parts.length > 1 && parts.every((part) => part.length > 1 || isDigits(part))) {
    return wordsMatch(index, [...parts, ...asked.slice(1)], tokens);
  }
  return false;
}

function queryWords(query) {
  const asked = words(normalizeText(query).replace(/\b([a-z]{2})-(?=[a-z0-9])/g, '$1')).map((word) => ROMAN[word] || word);
  const kept = asked.filter((word) => !CONNECTORS.has(word) && !BRAND_FILLERS.has(word));
  return kept.length ? kept : asked;
}

/** Letras trocadas, a mais, a menos ou invertidas entre duas palavras; para de contar depois de `limit`. */
function editDistance(a, b, limit) {
  if (Math.abs(a.length - b.length) > limit) return limit + 1;
  let before = [];
  let previous = Array.from({ length: b.length + 1 }, (_, position) => position);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) {
      let cost = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + (a[i - 1] !== b[j - 1] ? 1 : 0));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) cost = Math.min(cost, before[j - 2] + 1);
      current.push(cost);
    }
    if (Math.min(...current) > limit) return limit + 1;
    before = previous;
    previous = current;
  }
  return previous[previous.length - 1];
}

function vocabulary(index) {
  if (!index.vocabulary) {
    const uses = new Map();
    const add = (word) => uses.set(word, (uses.get(word) || 0) + 1);
    for (const entry of index.entries) {
      for (const word of new Set(entry.words)) if (word.length >= MIN_TYPO_LENGTH && isAlpha(word)) add(word);
    }
    for (const key of index.synonyms.keys()) if (key.length >= MIN_TYPO_LENGTH) add(key);
    index.vocabulary = uses;
  }
  return index.vocabulary;
}

/** A palavra conhecida mais parecida com uma que não existe em nenhum produto ("zhpc" -> "zphc"). */
function closestWord(word, known) {
  if (word.length < MIN_TYPO_LENGTH || !isAlpha(word)) return null;
  const limit = word.length >= 8 ? 2 : 1;
  let best = null; // no empate, a mais usada; depois, ordem alfabética
  for (const [candidate, uses] of known) {
    // O erro quase nunca é na primeira letra; sem isso "actiza" viraria qualquer coisa.
    if (candidate[0] !== word[0] && candidate.slice(0, 2) !== word[1] + word[0]) continue;
    const distance = editDistance(word, candidate, limit);
    if (distance > limit) continue;
    const better =
      !best ||
      distance < best.distance ||
      (distance === best.distance && (uses > best.uses || (uses === best.uses && candidate < best.candidate)));
    if (better) best = { distance, uses, candidate };
  }
  return best ? best.candidate : null;
}

/** O que o produto é, sem marca, dose nem embalagem: serve para resumir uma busca ampla. */
function productKind(index, item) {
  const tokens = [...item.f.tokens];
  // Com o princípio ativo reconhecido, o nome comercial não separa: "Testoviron" e "Enanbolic" são o mesmo tipo.
  const active = tokens.filter((token) => index.ingredients.has(token));
  const kind = active.length ? active : tokens;
  return (kind.length ? kind : [normalizeText(item.nome)]).sort();
}

/** Agrupa uma busca ampla por tipo de produto ou, se o tipo não separar, por marca. */
function summarize(index, found, limit) {
  const byKind = new Map();
  const byBrand = new Map();
  for (const item of found) {
    const kind = productKind(index, item);
    const key = kind.join('|');
    if (!byKind.has(key)) byKind.set(key, { words: kind, items: [] });
    byKind.get(key).items.push(item);
    if (!byBrand.has(item.chave_marca)) byBrand.set(item.chave_marca, { words: [item.chave_marca], items: [] });
    byBrand.get(item.chave_marca).items.push(item);
  }
  for (const [label, groups] of [['tipo', byKind], ['marca', byBrand]]) {
    const largest = Math.max(...[...groups.values()].map((group) => group.items.length));
    if (groups.size > 1 && groups.size <= limit && largest <= MAX_GROUP_SHARE * found.length) return [label, [...groups.values()]];
  }
  return ['tipo', [...byKind.values()]];
}

/** Resposta da busca e o resumo dela (quantos achou, quantos mostrou, o que corrigiu). */
export function searchDetails(index, query, maxProducts = MAX_PRODUCTS) {
  const asked = queryWords(query);
  if (!asked.length) return { text: HELP, found: 0, shown: 0, outOfStock: 0, mode: 'ajuda' };
  const { value, hasBrl, rates } = index;
  const money = (amount) => (hasBrl ? formatBrl(amount) : formatUsd(amount));

  // Palavra que não existe em produto nenhum: tenta a mais parecida antes de responder "nada encontrado".
  const corrected = [];
  const unknown = [];
  asked.forEach((word, position) => {
    if (index.entries.some((entry) => wordsMatch(index, [word], entry.tokens))) return;
    const replacement = closestWord(word, vocabulary(index));
    if (replacement) {
      corrected.push([word, replacement]);
      asked[position] = replacement;
    } else {
      unknown.push(word);
    }
  });

  const found = [];
  let outOfStock = 0;
  for (const entry of index.entries) {
    if (!wordsMatch(index, asked, entry.tokens)) continue;
    const available = entry.items.filter((item) => item.disponivel && item.preco >= MIN_PRICE_USD);
    if (!available.length) {
      outOfStock += 1;
      continue;
    }
    found.push(available.reduce((best, item) => (value(item) < value(best) ? item : best)));
  }
  const stats = (shown, mode) => ({ found: found.length, shown, outOfStock, mode, corrected, unknown });

  const title = `🔎 *${query.trim()}*`;
  const fixes = corrected.map(([wrong, right]) => `Não achei "${wrong}"; busquei por "${right}".`);
  if (!found.length) {
    let body = 'Nada encontrado. Tente outra palavra, por exemplo o princípio ativo ou a marca.';
    if (outOfStock) {
      body = `Encontrei ${outOfStock} produto(s), mas todos estão sem estoque agora.`;
    } else if (unknown.length) {
      const listed = unknown.map((word) => `"${word}"`).join(', ');
      body = `Nenhuma das lojas tem ${listed} no nome, na marca ou na composição. Confira a grafia ou tente o princípio ativo.`;
    }
    const parts = [title, ...(fixes.length ? [`_${fixes.join(' ')}_`] : []), body];
    return { text: parts.join('\n\n'), ...stats(0, 'vazio') };
  }

  found.sort((a, b) => value(a) - value(b));
  let shown = found.slice(0, maxProducts);
  const extra = new Map();
  let kinds = 0;
  let grouping = '';
  let hint = '';
  if (found.length > maxProducts) {
    // Busca ampla: em vez de cortar a lista, mostra o mais barato de cada tipo de produto (ou de cada marca).
    let groups;
    [grouping, groups] = summarize(index, found, maxProducts);
    kinds = groups.length;
    shown = groups.map((group) => group.items[0]).slice(0, maxProducts);
    for (const group of groups) {
      if (group.items.length > 1) {
        extra.set(group.items[0], ` · +${group.items.length - 1} até ${money(value(group.items[group.items.length - 1]))}`);
      }
    }
    // Sugere a palavra que abre o grupo com mais opções.
    const largest = groups.reduce((best, group) => (group.items.length > best.items.length ? group : best));
    const narrowing =
      grouping === 'marca'
        ? largest.words
        : largest.words
            .filter((word) => !asked.some((given) => word.startsWith(given)))
            .sort((a, b) => a.length - b.length || (a < b ? -1 : a > b ? 1 : 0));
    if (narrowing.length && largest.items.length > 1) hint = ` (ex.: /busca ${asked.join(' ')} ${narrowing[narrowing.length - 1]})`;
  }

  const byBrand = new Map();
  for (const item of shown) {
    if (!byBrand.has(item.chave_marca)) byBrand.set(item.chave_marca, []);
    byBrand.get(item.chave_marca).push(item);
  }

  const lines = [
    kinds
      ? `${title} — ${found.length} produto(s) com estoque, de ${kinds} ${grouping}(s)`
      : `${title} — ${found.length} produto(s) com estoque`,
    '',
  ];
  if (fixes.length) lines.splice(1, 0, `_${fixes.join(' ')}_`);
  const brands = [...byBrand.keys()].sort((a, b) => value(byBrand.get(a)[0]) - value(byBrand.get(b)[0]));
  for (const key of brands) {
    lines.push(`*${index.labels.get(key)}*`);
    for (const item of byBrand.get(key)) {
      let price = hasBrl ? `${formatBrl(value(item))} (${formatUsd(item.preco)})` : formatUsd(item.preco);
      const tiers = item.atacado || [];
      let quantity = '';
      if (kinds) {
        price = money(value(item)); // linha curta: a busca detalhada mostra o dólar e as faixas de atacado
      } else if (tiers.length) {
        const best = tiers.reduce((low, tier) => (tier.preco < low.preco ? tier : low));
        const bestValue = hasBrl ? best.preco * rates[item.loja] : best.preco;
        quantity = ` · 1 un. (${best.min}+ un.: ${money(bestValue)})`;
      }
      lines.push(`• ${named(item)} — *${price}* · ${index.stores[item.loja]}${quantity}${extra.get(item) || ''}`);
    }
    lines.push('');
  }

  const notes = [];
  if (kinds) {
    notes.push(
      `Busca ampla: mostrei o mais barato de cada ${grouping}; "+N até" são as outras opções e o preço da mais cara. ` +
        `Para ver todas, acrescente uma palavra${hint}.`,
    );
    if (kinds > shown.length) notes.push(`Ficaram de fora ${kinds - shown.length} ${grouping}(s) mais caros.`);
  }
  if (outOfStock) notes.push(`${outOfStock} sem estoque não listado(s).`);
  notes.push(`Melhor preço de 1 unidade entre as lojas · coleta de ${index.collected}`);
  lines.push(`_${notes.join(' ')}_`);
  return { text: lines.join('\n'), ...stats(shown.length, kinds ? `amplo_por_${grouping}` : 'normal') };
}

export const search = (index, query, maxProducts = MAX_PRODUCTS) => searchDetails(index, query, maxProducts).text;

function brandKey(index, brand) {
  const found = words(normalizeText(brand));
  return found.length ? index.aliases[found[0]] || found[0] : '';
}

/** "ZPHC Cooper", "alpha pharma x landerlan", "zphc vs cooper" ou "zphc, cooper". */
function parseBrands(index, text) {
  const normalized = normalizeText(text).trim();
  let parts = normalized.split(/\s+(?:x|vs|versus)\s+|\s*,\s*/).filter((part) => part.trim());
  if (parts.length < 2) parts = normalized.split(/\s+/).filter(Boolean);
  return parts.map((part) => brandKey(index, part)).filter(Boolean);
}

/** Separa a loja opcional do fim do texto: "zphc cooper shape" -> ["zphc cooper", "shapetotal"]. */
function splitStore(text) {
  const normalized = normalizeText(text).trim();
  for (const [pattern, store] of STORE_ALIASES) {
    const found = normalized.match(new RegExp(`(?:^|\\s)(?:na\\s+|no\\s+|loja\\s+)?(?:${pattern})$`));
    if (found) return [normalized.slice(0, found.index).replace(/^[ ,]+|[ ,]+$/g, ''), store];
  }
  return [normalized, null];
}

/** Junta o que cada loja informa do mesmo produto: uma diz a dose, outra a quantidade de frascos. */
function combinedFeatures(items) {
  const base = items.reduce((longest, item) => ((item.detalhe || '').length > (longest.detalhe || '').length ? item : longest));
  const merged = { ...base.f, doses: new Set(base.f.doses) };
  for (const item of items) {
    item.f.doses.forEach((dose) => merged.doses.add(dose));
    for (const field of ['count', 'volume', 'pack', 'form']) merged[field] = merged[field] || item.f[field];
  }
  return merged;
}

/** Para comparar marcas, dose e quantidade não podem faltar em nenhum dos lados. */
function strictlyEquivalent(a, b) {
  if (!a.doses.size || !b.doses.size) return false;
  // Comprimidos variam muito (20, 50, 100): a contagem tem de estar nos dois e ser igual.
  if ((a.count || b.count) && a.count !== b.count) return false;
  // Volume diferente quando os dois informam; injetável sem volume no nome costuma ser o frasco padrão.
  if (a.volume && b.volume && a.volume !== b.volume) return false;
  // Número de frascos: 1 frasco de 60 mg não é o mesmo que um kit de 5.
  if (a.pack && b.pack && a.pack !== b.pack) return false;
  return true;
}

const shared = (a, b) => [...a].filter((element) => b.has(element)).length;

/** 0 = produtos diferentes; 1 = mesmo princípio ativo, dose e embalagem. A marca não entra: são duas marcas. */
function matchScore(a, b) {
  if (!a.tokens.size || !b.tokens.size || !a.marcas.size) return 0;
  const common = shared(a.tokens, b.tokens);
  if (!common) return 0;
  const commonDoses = shared(a.doses, b.doses);
  if (a.doses.size && b.doses.size && !commonDoses) return 0;
  if (a.count && b.count && a.count !== b.count) return 0;
  if (a.volume && b.volume && a.volume !== b.volume) return 0;
  if (a.form && b.form && a.form !== b.form) return 0;
  // Caneta sempre vem escrita no nome: se só um lado diz "caneta", o outro é frasco.
  if ((a.form === 'caneta') !== (b.form === 'caneta')) return 0;
  if (a.pack && b.pack && a.pack !== b.pack) return 0;

  const union = a.tokens.size + b.tokens.size - common;
  const names = 0.5 * (common / union) + 0.5 * (common / Math.min(a.tokens.size, b.tokens.size));
  const dose = a.doses.size && b.doses.size ? commonDoses / (a.doses.size + b.doses.size - commonDoses) : 0.5;
  return Number((0.7 * names + 0.3 * dose).toFixed(3));
}

const byScore = (a, b) => b[0] - a[0] || a[1] - b[1] || a[2] - b[2];

/** Produtos equivalentes das duas marcas (mesmo princípio ativo, dose e embalagem), com a mais barata de cada. */
export function compareBrands(index, rawText, maxProducts = MAX_COMPARED) {
  const [text, onlyStore] = splitStore(rawText);
  const brands = parseBrands(index, text);
  if (brands.length !== 2 || brands[0] === brands[1]) return COMPARE_HELP;
  const { labels, value, hasBrl, stores } = index;
  const unknown = brands.filter((key) => !labels.has(key));
  if (unknown.length) {
    return `Não encontrei a marca *${unknown.join(', ')}* nas lojas. Confira a grafia, por exemplo: ZPHC, Cooper, Landerlan, Oxygen.`;
  }
  const money = (item) => (hasBrl ? formatBrl(value(item)) : formatUsd(item.preco));

  const offers = { [brands[0]]: [], [brands[1]]: [] };
  for (const entry of index.entries) {
    const available = entry.items.filter(
      (item) => item.disponivel && item.preco >= MIN_PRICE_USD && (onlyStore === null || item.loja === onlyStore),
    );
    if (!available.length) continue;
    const best = available.reduce((low, item) => (value(item) < value(low) ? item : low));
    if (best.chave_marca in offers) offers[best.chave_marca].push([best, combinedFeatures(entry.items)]);
  }
  const [offersA, offersB] = [offers[brands[0]], offers[brands[1]]];

  const candidates = [];
  offersA.forEach(([, featuresA], a) => {
    offersB.forEach(([, featuresB], b) => {
      if (!strictlyEquivalent(featuresA, featuresB)) return;
      const score = matchScore(featuresA, featuresB);
      if (score >= MIN_EQUIVALENCE) candidates.push([score, a, b]);
    });
  });
  const bestA = new Map();
  const bestB = new Map();
  for (const [score, a, b] of candidates) {
    bestA.set(a, Math.max(score, bestA.get(a) || 0));
    bestB.set(b, Math.max(score, bestB.get(b) || 0));
  }
  const pairs = [];
  const usedA = new Set();
  const usedB = new Set();
  for (const [score, a, b] of [...candidates].sort(byScore)) {
    if (usedA.has(a) || usedB.has(b)) continue;
    if (score < bestA.get(a) - BEST_MARGIN || score < bestB.get(b) - BEST_MARGIN) continue;
    usedA.add(a);
    usedB.add(b);
    pairs.push([offersA[a][0], offersB[b][0]]);
  }

  // Segunda passada: mesmo princípio ativo e mesma forma, mas dose ou quantidade diferente (ou não informada).
  const loose = [];
  offersA.forEach(([, featuresA], a) => {
    offersB.forEach(([, featuresB], b) => {
      if (usedA.has(a) || usedB.has(b)) return;
      if (Boolean(featuresA.count) !== Boolean(featuresB.count)) return; // comprimido de um lado, injetável do outro
      if (featuresA.form && featuresB.form && featuresA.form !== featuresB.form) return;
      const common = shared(featuresA.tokens, featuresB.tokens);
      if (!common) return;
      const union = featuresA.tokens.size + featuresB.tokens.size - common;
      const score = (common / union + common / Math.min(featuresA.tokens.size, featuresB.tokens.size)) / 2;
      if (score >= 0.7) loose.push([score, a, b]);
    });
  });
  const similar = [];
  for (const [, a, b] of loose.sort(byScore)) {
    if (usedA.has(a) || usedB.has(b)) continue;
    usedA.add(a);
    usedB.add(b);
    similar.push([offersA[a], offersB[b]]);
  }

  const size = (features) => {
    const parts = [[...features.doses].sort().join(', ') || 'dose não informada'];
    if (features.count) parts.push(`${features.count} comp.`);
    else if (features.volume) parts.push(`${features.volume} ml`);
    return parts.join(' · ');
  };

  const [nameA, nameB] = [labels.get(brands[0]), labels.get(brands[1])];
  const title = `⚖️ *${nameA} x ${nameB}*${onlyStore ? ` · só ${stores[onlyStore]}` : ''}`;
  const similarLines = [];
  if (similar.length) {
    similarLines.push('', `*Mesmo princípio ativo, dose ou quantidade diferente* (${similar.length}) — não é comparação direta`);
    for (const [[itemA, featuresA], [itemB, featuresB]] of similar.slice(0, maxProducts)) {
      similarLines.push(`• ${named(itemA)} — ${money(itemA)} · ${size(featuresA)}`);
      similarLines.push(`   _${named(itemB)} — ${money(itemB)} · ${size(featuresB)}_`);
    }
  }
  if (!pairs.length) {
    if (!similar.length) {
      return `${title}\n\nNão achei produtos equivalentes com estoque entre as duas marcas${onlyStore ? ` no ${stores[onlyStore]}` : ''}.`;
    }
    const note =
      '_Nenhum produto com a mesma dose e quantidade informadas nas duas marcas; por isso não há placar. ' +
      'Preço de 1 unidade, só com estoque._';
    return [title, ...similarLines, '', note].join('\n');
  }

  const wins = { [brands[0]]: 0, [brands[1]]: 0, empate: 0 };
  const rows = pairs.map(([itemA, itemB]) => {
    const [cheaper, other] = value(itemA) <= value(itemB) ? [itemA, itemB] : [itemB, itemA];
    const tie = fixed2(value(itemA)) === fixed2(value(itemB));
    wins[tie ? 'empate' : cheaper.chave_marca] += 1;
    const saving = value(other) ? ((value(other) - value(cheaper)) / value(other)) * 100 : 0;
    return { saving, tie, cheaper, other };
  });
  rows.sort((a, b) => b.saving - a.saving);

  let scoreLine = `🏆 *${nameA}* mais barata em ${wins[brands[0]]} · *${nameB}* em ${wins[brands[1]]}`;
  if (wins.empate) scoreLine += ` · ${wins.empate} empate(s)`;
  const lines = [`${title} — ${pairs.length} produto(s) equivalentes com estoque`, '', scoreLine, ''];
  for (const { saving, tie, cheaper, other } of rows.slice(0, maxProducts)) {
    const winner = tie ? 'mesmo preço' : labels.get(cheaper.chave_marca);
    lines.push(`• *${winner}* · ${named(cheaper)} — *${money(cheaper)}* · ${stores[cheaper.loja]}`);
    const detail = tie ? 'mesmo valor' : `${roundHalfEven(saving)}% mais cara`;
    const otherCode = other.codigo ? `[${other.codigo}] ` : '';
    lines.push(`   _${labels.get(other.chave_marca)}: ${otherCode}${money(other)} · ${stores[other.loja]} (${detail})_`);
  }
  const notes = [];
  if (rows.length > maxProducts) notes.push(`Mostrando os ${maxProducts} com maior diferença, de ${rows.length}.`);
  if (onlyStore) notes.push(`Preços só do ${stores[onlyStore]}.`);
  notes.push(
    'Preço de 1 unidade, só com estoque. Só entram produtos com o mesmo princípio ativo, a mesma dose (mg/UI) ' +
      'e a mesma quantidade (comprimidos ou ml) informadas nas duas marcas; ' +
      `confira antes de comprar. Coleta de ${index.collected}`,
  );
  lines.push(...similarLines, '', `_${notes.join(' ')}_`);
  return lines.join('\n');
}

/** Resposta para o que a pessoa escreveu no chat. Texto sem barra é uma busca. */
export function answer(index, body) {
  const text = body.trim();
  const lowered = text.toLowerCase();
  if (lowered.startsWith('/help') || lowered.startsWith('/ajuda')) return GUIDE;
  if (lowered.startsWith('/comparar')) return compareBrands(index, text.slice('/comparar'.length));
  if (lowered.startsWith('/busca')) {
    // "/buscar" também vale: sem isso, o "r" que sobra viraria uma palavra da busca.
    let query = text.slice('/busca'.length);
    if (query.slice(0, 1).toLowerCase() === 'r' && (query.length === 1 || !/[\p{L}\p{N}]/u.test(query[1]))) query = query.slice(1);
    return search(index, query.trim());
  }
  if (lowered.startsWith('/')) return WHATSAPP_ONLY;
  return search(index, text);
}
