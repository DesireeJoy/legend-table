'use strict';

const $ = selector => document.querySelector(selector);
const escapeHtml = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const esc = escapeHtml;
let game = null;
let attackerId = null;
let busy = false;

function fillStarterDecks() {
  const format = deck => deck.map(card => `${card.name}, ${card.value}`).join('\n');
  document.querySelector('[name="deck1"]').value = format(starterDecks.fire);
  document.querySelector('[name="deck2"]').value = format(starterDecks.water);
}

function updateOpponentLabels() {
  const isRobot = $('[name="opponent"]').value === 'robot';
  const name = $('[name="player2"]');
  if (name.value === 'Water Robot' || name.value === 'Player 2') name.value = isRobot ? 'Water Robot' : 'Player 2';
  $('#opponent-heading').textContent = isRobot ? 'ROBOT · WATER DOG' : 'PLAYER TWO · WATER DOG';
  $('#opponent-name-label').textContent = isRobot ? 'Robot name' : 'Player 2 name';
  $('#opponent-first').textContent = isRobot ? 'Robot' : 'Player 2';
}

fillStarterDecks();
$('[name="opponent"]').addEventListener('change', updateOpponentLabels);

const storageKey = 'legend-table-games';
const { createGame, act, playRobot } = window.legendTableGame;

function readGames() {
  const raw = localStorage.getItem(storageKey);
  if (!raw) return [];
  const games = JSON.parse(raw);
  if (!Array.isArray(games)) throw new Error('Saved games are invalid.');
  return games;
}

function writeGames(games) {
  localStorage.setItem(storageKey, JSON.stringify(games));
}

async function api(url, options = {}) {
  const games = readGames();
  const parts = url.split('/').filter(Boolean);
  if (parts[0] !== 'api' || parts[1] !== 'games') throw new Error('The requested game resource is invalid.');
  const id = parts[2];
  if (!id && (!options.method || options.method === 'GET')) return games;
  if (!id && options.method === 'POST') {
    const input = JSON.parse(options.body);
    const savedGame = createGame(input);
    playRobot(savedGame);
    games.push(savedGame);
    writeGames(games);
    return savedGame;
  }
  const index = games.findIndex(item => item.id === id);
  if (index < 0) throw new Error('Game not found.');
  if (parts[3] === 'actions' && options.method === 'POST') {
    const savedGame = games[index];
    act(savedGame, JSON.parse(options.body));
    playRobot(savedGame);
    writeGames(games);
    return savedGame;
  }
  if (parts.length === 3 && (!options.method || options.method === 'GET')) return games[index];
  if (parts.length === 3 && options.method === 'DELETE') {
    games.splice(index, 1);
    writeGames(games);
    return { ok: true };
  }
  throw new Error('The requested game action is invalid.');
}

function showError(error) {
  const notice = $('#notice');
  notice.textContent = error.message;
  notice.hidden = false;
  notice.scrollIntoView({ block: 'nearest' });
}

function clearError() { $('#notice').hidden = true; }
function show(section) {
  for (const id of ['home', 'create', 'play']) $(`#${id}`).hidden = id !== section;
  clearError();
}

async function home() {
  show('home');
  const games = await api('/api/games');
  $('#games').innerHTML = games.length ? games.slice().reverse().map(item => `
    <article class="game-tile">
      <div><p class="eyebrow">${item.phase === 'finished' ? 'GAME COMPLETE' : 'IN PROGRESS'}</p><h3>${esc(item.players[0].name)} <span class="versus">vs</span> ${esc(item.players[1].name)}</h3><p class="muted">Last played ${esc(new Date(item.updatedAt).toLocaleString())}</p></div>
      <div class="tile-actions"><button data-action="open" data-id="${esc(item.id)}">Open game →</button><button class="text-danger" data-action="delete" data-id="${esc(item.id)}">Delete</button></div>
    </article>`).join('') : '<div class="empty-list">No games yet. Start a game to see it here.</div>';
}

function parseDeck(raw) {
  return raw.split(/\r?\n/).filter(line => line.trim()).map((line, index) => {
    const match = line.match(/^(.*),\s*(\d+)\s*$/);
    if (!match || !match[1].trim()) throw new Error(`Deck line ${index + 1} must be a card name followed by a comma and a whole-number value.`);
    return { name: match[1].trim(), value: Number(match[2]) };
  });
}

function card(card, options = {}) {
  if (!card) return '<div class="card empty-card"><span>+</span><small>OPEN SLOT</small></div>';
  const tag = options.action ? 'button' : 'div';
  const action = options.action ? ` data-action="${options.action}" data-id="${esc(card.id)}"` : '';
  const theme = options.player === 0 ? 'fire' : 'water';
  return `<${tag} class="card ${theme} ${options.kind || ''} ${options.selected ? 'selected' : ''}"${action}><span class="card-art" aria-hidden="true"></span><span class="card-info"><strong>${esc(card.name)}</strong><span class="card-bottom"><small>${esc(options.label || 'CARD')}</small><span class="card-value">${esc(card.value)}</span></span></span></${tag}>`;
}

function renderGame() {
  const p = game.players[game.active];
  const opponent = game.players[1 - game.active];
  const content = $('#game-content');
  if (game.phase === 'finished') {
    content.innerHTML = `<div class="handoff"><div class="emblem">✦</div><p class="eyebrow">THE BATTLE IS OVER</p><h1>${esc(game.players[game.winner].name)} wins!</h1><p>${esc(game.log[0])}</p><button class="primary" data-action="home">Back to saved games →</button></div>`;
    return;
  }
  if (game.phase.endsWith('handoff')) {
    const heading = game.robot ? 'YOUR TURN' : 'PASS THE DEVICE';
    const message = game.robot ? 'Ready to face the water robot?' : 'Make sure the other player looks away before continuing. Your hand will be shown on the next screen.';
    content.innerHTML = `<div class="handoff"><div class="emblem">✦</div><p class="eyebrow">${heading}</p><h1>${esc(p.name)}, it’s your turn.</h1><p>${message}</p><button class="primary" data-action="ready">I’m ready →</button></div>`;
    return;
  }
  const setup = game.phase.startsWith('setup');
  const instructions = {
    'setup-roll': 'Roll the die to set your starting card limit.',
    'setup-legend': 'Choose a legend from your hand that fits the roll.',
    'setup-place': 'Choose up to two protectors. Their combined value must fit the roll.',
    'turn-roll': 'You drew a card. Roll to set your protector limit.',
    'turn-place': 'Play up to two protectors. Each new protector must fit the roll.',
    'attack': 'Select your protector, then select an opposing card to attack.',
  };
  let controls = '';
  if (game.phase.endsWith('roll')) controls = '<button class="primary" data-action="roll">⚄ &nbsp; Roll the die</button>';
  if (game.phase === 'setup-legend' && !p.hand.some(c => c.value <= game.roll * 100)) controls = '<button class="primary" data-action="reroll">⚄ &nbsp; No eligible legend — roll again</button>';
  if (game.phase === 'setup-place' || game.phase === 'turn-place') controls = `<button class="primary" data-action="done">${setup ? 'Finish setup' : 'Continue to attacks'} →</button>`;
  if (game.phase === 'attack') controls = '<button class="primary" data-action="end-turn">End turn →</button>';
  const handAction = game.phase === 'setup-legend' ? 'legend' : ['setup-place', 'turn-place'].includes(game.phase) ? 'place' : '';
  const enemyTargets = game.phase === 'attack' && attackerId;
  const opponentProtectors = opponent.protectors.map(c => card(c, { player: 1 - game.active, kind: 'enemy', label: 'PROTECTOR', action: enemyTargets ? 'target' : '' })).join('');
  const ownProtectors = p.protectors.map(c => card(c, { player: game.active, kind: 'ally', label: 'PROTECTOR', action: game.phase === 'attack' ? 'select-attacker' : '', selected: c.id === attackerId })).join('');
  content.innerHTML = `
    <div class="play-heading"><div><p class="eyebrow">${setup ? 'GAME SETUP' : `TURN ${game.turn}`}</p><h1>${esc(p.name)}’s ${setup ? 'setup' : 'turn'}</h1></div><div class="roll-badge">${game.roll ? `DIE ROLL <b>${game.roll}</b> <span>LIMIT ${game.roll * 100}</span>` : 'DIE NOT ROLLED'}</div></div>
    <div class="instruction"><div><span class="step-dot"></span><strong>${esc(instructions[game.phase])}</strong>${game.phase === 'setup-place' ? `<small>Starting protector total: ${game.setupTotal} / ${game.roll * 100}</small>` : ''}</div>${controls}</div>
    <div class="table ${game.active === 0 ? 'fire-active' : 'water-active'}">
      <div class="side-label"><div><span class="eyebrow">OPPONENT</span><h2>${esc(opponent.name)}</h2></div><span class="caption">${opponent.deck.length} cards in deck · ${opponent.hand.length} in hand</span></div>
      <div class="field"><div><p class="field-label">LEGEND</p>${card(opponent.legend, { player: 1 - game.active, kind: 'legend enemy', label: 'LEGEND', action: enemyTargets && opponent.protectors.length === 0 && opponent.legend ? 'target' : '' })}</div><div><p class="field-label">PROTECTORS</p><div class="cards">${opponentProtectors}${card(null).repeat(2 - opponent.protectors.length)}</div></div></div>
      <div class="divider"><span>THE BATTLEFIELD</span></div>
      <div class="field"><div><p class="field-label">YOUR LEGEND</p>${card(p.legend, { player: game.active, kind: 'legend ally', label: 'LEGEND' })}</div><div><p class="field-label">YOUR PROTECTORS ${game.phase === 'attack' ? '· SELECT TO ATTACK' : ''}</p><div class="cards">${ownProtectors}${card(null).repeat(2 - p.protectors.length)}</div></div></div>
      <div class="side-label own"><div><span class="eyebrow">YOUR SIDE</span><h2>${esc(p.name)}</h2></div><span class="caption">${p.deck.length} cards in deck · ${p.discard.length} defeated</span></div>
    </div>
    <div class="hand-heading"><div><p class="eyebrow">YOUR CARDS</p><h2>In your hand <span class="count">${p.hand.length}</span></h2></div><span class="caption">${handAction ? 'Select a card to play it' : 'Only visible on your turn'}</span></div>
    <div class="cards hand">${p.hand.length ? p.hand.map(c => card(c, { player: game.active, action: handAction, label: 'IN HAND' })).join('') : '<p class="muted">Your hand is empty.</p>'}</div>
    <details class="history"><summary>Game activity</summary><ul>${game.log.map(entry => `<li>${esc(entry)}</li>`).join('')}</ul></details>`;
}

async function sendAction(type, extra = {}) {
  if (busy) return;
  busy = true;
  try {
    clearError();
    game = await api(`/api/games/${game.id}/actions`, { method: 'POST', body: JSON.stringify({ type, ...extra }) });
    attackerId = null;
    renderGame();
  } catch (error) { showError(error); }
  finally { busy = false; }
}

$('#show-create').addEventListener('click', () => show('create'));
$('#create-form').addEventListener('submit', async event => {
  event.preventDefault();
  if (busy) return;
  const formElement = event.currentTarget;
  busy = true;
  try {
    clearError();
    const form = new FormData(formElement);
    game = await api('/api/games', { method: 'POST', body: JSON.stringify({
      players: [{ name: form.get('player1'), cards: parseDeck(form.get('deck1')) }, { name: form.get('player2'), cards: parseDeck(form.get('deck2')) }],
      first: Number(form.get('first')), robot: form.get('opponent') === 'robot',
    }) });
    attackerId = null;
    formElement.reset();
    fillStarterDecks();
    updateOpponentLabels();
    show('play');
    renderGame();
  } catch (error) { showError(error); }
  finally { busy = false; }
});

document.addEventListener('click', async event => {
  const button = event.target.closest('button[data-action]');
  if (!button || busy) return;
  const action = button.dataset.action;
  try {
    if (action === 'home') { await home(); return; }
    if (action === 'open') {
      game = await api(`/api/games/${button.dataset.id}`);
      attackerId = null;
      show('play');
      renderGame();
      return;
    }
    if (action === 'delete') {
      if (confirm('Delete this saved game? This cannot be undone.')) {
        await api(`/api/games/${button.dataset.id}`, { method: 'DELETE' });
        await home();
      }
      return;
    }
    if (action === 'select-attacker') { attackerId = button.dataset.id; renderGame(); return; }
    if (action === 'target') { await sendAction('attack', { attackerId, targetId: button.dataset.id }); return; }
    if (action === 'legend' || action === 'place') { await sendAction(action, { cardId: button.dataset.id }); return; }
    await sendAction(action);
  } catch (error) { showError(error); }
});

home().catch(showError);
