import { answer, prepare } from './bot.js';

// Dados publicados pelo coletor (repositório do painel) a cada coleta. "?dados=URL" troca a origem, para testar.
const DATA_URL =
  new URLSearchParams(location.search).get('dados') || 'https://fabianbatistasilva.github.io/respect-pharma-dashboard/bot.json';
// Antes de responder, busca os dados de novo se os que estão na página têm mais que isso.
const REFRESH_MS = 5 * 60 * 1000;
// Coleta mais velha que isso aparece como aviso: o coletor pode ter parado.
const STALE_MS = 3 * 60 * 60 * 1000;

const log = document.getElementById('log');
const scroll = document.getElementById('scroll');
const status = document.getElementById('status');
const form = document.getElementById('form');
const input = document.getElementById('input');
const send = document.getElementById('send');

let index = null;
let loadedAt = 0;
let loading = null;

const escapeHtml = (text) => text.replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[char]);

// As respostas vêm no formato do WhatsApp (*negrito*, _itálico_); aqui viram HTML.
function inline(text) {
  return escapeHtml(text)
    .replace(/\(ex\.: (\/busca [^)]+)\)/g, (_, query) => `(ex.: <button class="try" type="button" data-q="${query}">${query}</button>)`)
    .replace(/\[([A-Z]{2}-[A-Z0-9-]+)\]/g, '<span class="code">$1</span>')
    .replace(/\*([^*\n]+)\*/g, '<strong>$1</strong>')
    .replace(/(^|\s)_([^_\n]+)_(?=$|[\s.,·])/g, '$1<em>$2</em>');
}

function render(text) {
  return text
    .split('\n')
    .map((line) => {
      if (!line.trim()) return '<div class="gap"></div>';
      if (line.startsWith('• ')) return `<p class="item">${inline(line.slice(2))}</p>`;
      if (line.startsWith('   ')) return `<p class="sub">${inline(line.trim())}</p>`;
      if (/^_.*_$/.test(line)) return `<p class="note">${inline(line.slice(1, -1))}</p>`;
      return `<p>${inline(line)}</p>`;
    })
    .join('');
}

function addMessage(who, text) {
  const bubble = document.createElement('div');
  bubble.className = `msg ${who}`;
  if (who === 'user') bubble.textContent = text;
  else bubble.innerHTML = render(text);
  log.append(bubble);
  // A resposta começa no topo da tela, logo abaixo da pergunta: listas longas são lidas de cima para baixo.
  const anchor = who === 'bot' && bubble.previousElementSibling ? bubble.previousElementSibling : bubble;
  const top = anchor.getBoundingClientRect().top - scroll.getBoundingClientRect().top + scroll.scrollTop;
  scroll.scrollTo({ top: top - 12, behavior: 'smooth' });
  return bubble;
}

function showStatus() {
  const age = Date.now() - index.generatedAt.getTime();
  const stale = age > STALE_MS;
  status.classList.toggle('warn', stale);
  status.textContent = stale
    ? `Preços de ${index.collected} (há ${Math.round(age / 3600000)} h; a coleta pode estar parada)`
    : `Preços de ${index.collected} · ${Object.keys(index.stores).length} lojas`;
}

async function load() {
  const response = await fetch(DATA_URL, { cache: 'no-cache' });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  index = prepare(await response.json());
  loadedAt = Date.now();
  showStatus();
}

// Uma carga por vez; se a atualização falhar e já houver dados, responde com os que tem.
async function ensureData() {
  if (index && Date.now() - loadedAt < REFRESH_MS) return;
  loading ||= load().finally(() => {
    loading = null;
  });
  try {
    await loading;
  } catch (error) {
    if (!index) throw error;
  }
}

async function ask(text) {
  const question = text.trim();
  if (!question) return;
  addMessage('user', question);
  input.value = '';
  send.disabled = true;
  try {
    await ensureData();
    addMessage('bot', answer(index, question));
  } catch {
    status.classList.add('warn');
    status.textContent = 'Não consegui carregar os preços';
    addMessage('bot', 'Não consegui carregar os preços agora. Confira a conexão e tente de novo em instantes.');
  }
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  ask(input.value);
});
input.addEventListener('input', () => {
  send.disabled = !input.value.trim();
});
// Exemplos do rodapé e sugestões dentro das respostas ("ex.: /busca enantato testosterona").
document.addEventListener('click', (event) => {
  const button = event.target.closest('[data-q]');
  if (button) ask(button.dataset.q);
});

addMessage(
  'bot',
  'Escreva o nome de um produto, o princípio ativo, a marca ou o código, e eu mostro a loja mais barata com estoque.\n' +
    'Para comparar duas marcas: */comparar zphc cooper*. Para ver tudo: */help*.',
);
ensureData().catch(() => {
  status.classList.add('warn');
  status.textContent = 'Não consegui carregar os preços';
});
if (matchMedia('(pointer: fine)').matches) input.focus();
