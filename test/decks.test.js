const test = require('node:test');
const assert = require('node:assert/strict');
const decks = require('../public/decks');
const { createGame } = require('../game');

test('starter decks contain 100 distinct themed cards with matching playable values', () => {
  for (const deck of [decks.fire, decks.water]) {
    assert.equal(deck.length, 100);
    assert.equal(new Set(deck.map(card => card.name)).size, 100);
    assert.ok(deck.every(card => card.name && card.value >= 100 && card.value <= 600 && card.value % 100 === 0));
    assert.deepEqual(new Set(deck.map(card => card.value)), new Set([100, 200, 300, 400, 500, 600]));
  }
  assert.deepEqual(decks.fire.map(card => card.value), decks.water.map(card => card.value));
  assert.equal(decks.fire.some(card => decks.water.some(other => other.name === card.name)), false);
  const game = createGame({ players: [{ name: 'Fire', cards: decks.fire }, { name: 'Water', cards: decks.water }], first: 0 });
  for (const player of game.players) {
    assert.equal(player.hand.length, 5);
    assert.equal(player.deck.length, 95);
  }
});
