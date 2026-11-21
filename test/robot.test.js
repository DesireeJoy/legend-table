const test = require('node:test');
const assert = require('node:assert/strict');
const { createGame, act } = require('../game');
const { playRobot } = require('../robot');

const card = (id, value) => ({ id, name: id, value });
const deck = Array.from({ length: 10 }, (_, i) => ({ name: `Card ${i}`, value: 100 }));
const makeGame = first => createGame({
  players: [{ name: 'Human', cards: deck }, { name: 'Robot', cards: deck }],
  first, robot: true,
});

test('robot goes first and performs setup using legal cards', () => {
  const game = makeGame(1);
  playRobot(game);
  assert.equal(game.phase, 'setup-handoff');
  assert.equal(game.active, 0);
  assert.equal(game.players[1].legend.value, 100);
  assert.equal(game.players[1].protectors.length <= 2, true);
  const roll = Number(game.log.find(entry => entry.includes('rolled')).match(/rolled (\d)/)[1]);
  assert.ok(game.players[1].protectors.reduce((sum, item) => sum + item.value, 0) <= roll * 100);
});

test('robot completes setup after human and leaves the human ready to draw', () => {
  const game = makeGame(0);
  act(game, { type: 'ready' });
  act(game, { type: 'roll' });
  act(game, { type: 'legend', cardId: game.players[0].hand[0].id });
  act(game, { type: 'done' });
  playRobot(game);
  assert.equal(game.phase, 'turn-handoff');
  assert.equal(game.active, 0);
  assert.ok(game.players[1].legend);
});

test('robot defeats multiple protectors and the legend in one turn', () => {
  const game = makeGame(1);
  game.phase = 'attack';
  game.players[1].protectors = [card('attacker', 500)];
  game.players[0].protectors = [card('guard1', 400), card('guard2', 500)];
  game.players[0].legend = card('legend', 500);
  playRobot(game);
  assert.equal(game.phase, 'finished');
  assert.equal(game.winner, 1);
  assert.equal(game.players[0].discard.length, 2);
  assert.equal(game.players[1].protectors.length, 1);
});

test('robot ends its turn when it cannot defeat the defender', () => {
  const game = makeGame(1);
  game.phase = 'attack';
  game.players[1].protectors = [card('attacker', 100)];
  game.players[0].protectors = [card('guard', 200)];
  game.players[0].legend = card('legend', 100);
  playRobot(game);
  assert.equal(game.active, 0);
  assert.equal(game.phase, 'turn-handoff');
  assert.equal(game.players[0].protectors.length, 1);
});

test('robot loses if it cannot draw and older games remain two-player', () => {
  const game = makeGame(1);
  game.phase = 'turn-handoff';
  game.players[1].deck = [];
  playRobot(game);
  assert.equal(game.winner, 0);
  const old = makeGame(1);
  delete old.robot;
  playRobot(old);
  assert.equal(old.phase, 'setup-handoff');
  assert.equal(old.active, 1);
});
