const test = require('node:test');
const assert = require('node:assert/strict');
const { createGame, act, GameError } = require('../game');

const cards = values => values.map((value, i) => ({ name: `Card ${i}`, value }));
const makeGame = () => createGame({
  players: [{ name: 'Alice', cards: cards([100, 200, 300, 400, 500, 600]) }, { name: 'Bob', cards: cards([100, 200, 300, 400, 500, 600]) }],
  first: 0,
});
const named = (id, value) => ({ id, name: id, value });

test('creation validates decks and draws a playable opening hand', () => {
  const game = makeGame();
  assert.equal(game.players[0].hand.length, 5);
  assert.equal(game.players[0].deck.length, 1);
  assert.equal(game.phase, 'setup-handoff');
  assert.throws(() => createGame({ players: [{ name: 'A', cards: cards([700, 700, 700, 700, 700]) }, { name: 'B', cards: cards([100, 100, 100, 100, 100]) }], first: 0 }), GameError);
});

test('legend selection and starting protector total are enforced', () => {
  const game = makeGame();
  const p = game.players[0];
  p.hand = [named('legend', 400), named('one', 200), named('two', 300), named('high', 500)];
  act(game, { type: 'ready' });
  game.phase = 'setup-legend';
  game.roll = 4;
  assert.throws(() => act(game, { type: 'legend', cardId: 'high' }), GameError);
  act(game, { type: 'legend', cardId: 'legend' });
  act(game, { type: 'place', cardId: 'one' });
  assert.throws(() => act(game, { type: 'place', cardId: 'two' }), GameError);
  assert.equal(p.protectors.length, 1);
  act(game, { type: 'done' });
  assert.equal(game.active, 1);
  assert.equal(game.phase, 'setup-handoff');
});

test('reroll is allowed only when no legend fits', () => {
  const game = makeGame();
  game.phase = 'setup-legend';
  game.roll = 1;
  game.players[0].hand = [named('high', 600)];
  act(game, { type: 'reroll' });
  assert.ok(game.roll >= 1 && game.roll <= 6);
  game.players[0].hand.push(named('low', 1));
  assert.throws(() => act(game, { type: 'reroll' }), GameError);
});

test('later protector limit applies to each new card, with two slots', () => {
  const game = makeGame();
  const p = game.players[0];
  p.hand = [named('one', 400), named('two', 400), named('three', 100)];
  game.phase = 'turn-place';
  game.roll = 4;
  act(game, { type: 'place', cardId: 'one' });
  act(game, { type: 'place', cardId: 'two' });
  assert.equal(p.protectors.length, 2);
  assert.throws(() => act(game, { type: 'place', cardId: 'three' }), GameError);
});

test('attacks defeat equal defenders, keep attackers alive and require an exposed legend', () => {
  const game = makeGame();
  const [p, opponent] = game.players;
  p.protectors = [named('attacker', 400)];
  opponent.protectors = [named('equal', 400), named('higher', 500)];
  opponent.legend = named('legend', 400);
  game.phase = 'attack';
  assert.throws(() => act(game, { type: 'attack', attackerId: 'attacker', targetId: 'legend' }), GameError);
  assert.throws(() => act(game, { type: 'attack', attackerId: 'attacker', targetId: 'higher' }), GameError);
  act(game, { type: 'attack', attackerId: 'attacker', targetId: 'equal' });
  assert.equal(p.protectors.length, 1);
  assert.equal(opponent.discard[0].id, 'equal');
  opponent.protectors[0].value = 400;
  act(game, { type: 'attack', attackerId: 'attacker', targetId: 'higher' });
  act(game, { type: 'attack', attackerId: 'attacker', targetId: 'legend' });
  assert.equal(game.winner, 0);
  assert.equal(game.phase, 'finished');
  assert.throws(() => act(game, { type: 'end-turn' }), GameError);
});

test('players draw on their turn and lose if their deck is empty', () => {
  const game = makeGame();
  game.phase = 'turn-handoff';
  const p = game.players[0];
  const handSize = p.hand.length;
  act(game, { type: 'ready' });
  assert.equal(p.hand.length, handSize + 1);
  assert.equal(game.phase, 'turn-roll');
  game.phase = 'turn-handoff';
  act(game, { type: 'ready' });
  assert.equal(game.winner, 1);
  assert.equal(game.phase, 'finished');
});

test('both players complete setup before the selected first player draws', () => {
  const game = makeGame();
  for (let i = 0; i < 2; i++) {
    act(game, { type: 'ready' });
    act(game, { type: 'roll' });
    while (!game.players[game.active].hand.some(card => card.value <= game.roll * 100)) act(game, { type: 'reroll' });
    act(game, { type: 'legend', cardId: game.players[game.active].hand.find(card => card.value <= game.roll * 100).id });
    act(game, { type: 'done' });
  }
  assert.equal(game.active, 0);
  assert.equal(game.phase, 'turn-handoff');
  act(game, { type: 'ready' });
  assert.equal(game.turn, 1);
});
