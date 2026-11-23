'use strict';

(() => {
  class GameError extends Error {}
  const fail = message => { throw new GameError(message); };
  const required = (condition, message) => { if (!condition) fail(message); };
  const randomInt = max => Math.floor(Math.random() * max);
  const randomUUID = () => {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, char => {
      const value = Math.floor(Math.random() * 16);
      return (char === 'x' ? value : (value & 3) | 8).toString(16);
    });
  };

  function shuffle(cards) {
    const result = [...cards];
    for (let i = result.length - 1; i > 0; i--) {
      const j = randomInt(i + 1);
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }

  function createPlayer(input) {
    required(input && typeof input.name === 'string' && input.name.trim().length > 0 && input.name.trim().length <= 60, 'Player name must be between 1 and 60 characters.');
    required(Array.isArray(input.cards) && input.cards.length >= 5 && input.cards.length <= 200, 'Each deck must contain 5 to 200 cards.');
    const cards = input.cards.map(card => {
      required(card && typeof card.name === 'string' && card.name.trim().length > 0 && card.name.trim().length <= 80, 'Each card needs a name of at most 80 characters.');
      required(Number.isSafeInteger(card.value) && card.value > 0 && card.value <= 1000000, 'Card values must be whole numbers from 1 to 1,000,000.');
      return { id: randomUUID(), name: card.name.trim(), value: card.value };
    });
    required(cards.some(card => card.value <= 600), 'Each deck must include at least one card valued 600 or less.');
    let deck = shuffle(cards);
    while (!deck.slice(0, 5).some(card => card.value <= 600)) deck = shuffle(cards);
    return { name: input.name.trim(), hand: deck.splice(0, 5), deck, legend: null, protectors: [], discard: [] };
  }

  function createGame(input) {
    required(input && Array.isArray(input.players) && input.players.length === 2, 'Two players are required.');
    required(input.first === 0 || input.first === 1, 'Choose the first player.');
    required(input.robot === undefined || typeof input.robot === 'boolean', 'Invalid robot setting.');
    const now = new Date().toISOString();
    return {
      id: randomUUID(), createdAt: now, updatedAt: now,
      players: input.players.map(createPlayer), first: input.first, active: input.first, robot: input.robot === true,
      phase: 'setup-handoff', roll: null, setupTotal: 0, winner: null, turn: 0,
      log: ['A new game begins.'],
    };
  }

  function act(game, action) {
    required(action && typeof action.type === 'string', 'An action is required.');
    const player = game.players[game.active];
    const opponent = game.players[1 - game.active];
    const log = message => { game.log.unshift(message); game.log = game.log.slice(0, 30); };
    const roll = () => { game.roll = randomInt(6) + 1; log(`${player.name} rolled ${game.roll} (${game.roll * 100}).`); };
    const takeCard = id => {
      const index = player.hand.findIndex(card => card.id === id);
      required(index !== -1, 'That card is not in the active hand.');
      return index;
    };
    switch (action.type) {
      case 'ready':
        if (game.phase === 'setup-handoff') game.phase = 'setup-roll';
        else if (game.phase === 'turn-handoff') {
          if (player.deck.length === 0) {
            game.winner = 1 - game.active; game.phase = 'finished';
            log(`${player.name} could not draw. ${opponent.name} wins!`);
          } else {
            player.hand.push(player.deck.shift()); game.turn++; game.phase = 'turn-roll';
            log(`${player.name} drew a card.`);
          }
        } else fail('The game is not waiting for a player.');
        break;
      case 'roll':
        required(['setup-roll', 'turn-roll'].includes(game.phase), 'You cannot roll now.');
        roll(); game.phase = game.phase === 'setup-roll' ? 'setup-legend' : 'turn-place';
        break;
      case 'reroll':
        required(game.phase === 'setup-legend', 'You cannot reroll now.');
        required(!player.hand.some(card => card.value <= game.roll * 100), 'Choose an eligible legend instead of rerolling.');
        roll();
        break;
      case 'legend': {
        required(game.phase === 'setup-legend', 'You cannot choose a legend now.');
        const index = takeCard(action.cardId);
        required(player.hand[index].value <= game.roll * 100, 'That legend exceeds the roll.');
        player.legend = player.hand.splice(index, 1)[0]; game.setupTotal = 0; game.phase = 'setup-place';
        log(`${player.name} chose ${player.legend.name} as their legend.`);
        break;
      }
      case 'place': {
        required(['setup-place', 'turn-place'].includes(game.phase), 'You cannot play a protector now.');
        required(player.protectors.length < 2, 'There is no open protector slot.');
        const index = takeCard(action.cardId);
        const card = player.hand[index];
        const cost = game.phase === 'setup-place' ? game.setupTotal + card.value : card.value;
        required(cost <= game.roll * 100, 'That protector exceeds the roll limit.');
        player.protectors.push(player.hand.splice(index, 1)[0]);
        if (game.phase === 'setup-place') game.setupTotal += card.value;
        log(`${player.name} played ${card.name} as a protector.`);
        break;
      }
      case 'done':
        if (game.phase === 'setup-place') {
          if (game.active === game.first) { game.active = 1 - game.first; game.phase = 'setup-handoff'; }
          else { game.active = game.first; game.phase = 'turn-handoff'; }
          game.roll = null;
        } else if (game.phase === 'turn-place') game.phase = 'attack';
        else fail('You cannot continue from this phase.');
        break;
      case 'attack': {
        required(game.phase === 'attack', 'You cannot attack now.');
        const attacker = player.protectors.find(card => card.id === action.attackerId);
        required(attacker, 'Choose one of your protectors.');
        if (action.targetId === opponent.legend.id) {
          required(opponent.protectors.length === 0, 'Defeat the opposing protectors first.');
          required(attacker.value >= opponent.legend.value, 'Your protector is not strong enough.');
          game.winner = game.active; game.phase = 'finished';
          log(`${attacker.name} defeated ${opponent.name}'s legend. ${player.name} wins!`);
        } else {
          const index = opponent.protectors.findIndex(card => card.id === action.targetId);
          required(index !== -1, 'Choose an opposing protector.');
          required(attacker.value >= opponent.protectors[index].value, 'Your protector is not strong enough.');
          const defeated = opponent.protectors.splice(index, 1)[0];
          opponent.discard.push(defeated); log(`${attacker.name} defeated ${defeated.name}.`);
        }
        break;
      }
      case 'end-turn':
        required(game.phase === 'attack', 'You cannot end the turn now.');
        log(`${player.name} ended their turn.`); game.active = 1 - game.active; game.roll = null; game.phase = 'turn-handoff';
        break;
      default: fail('Unknown action.');
    }
    game.updatedAt = new Date().toISOString();
    return game;
  }

  function chooseSetupProtectors(hand, limit, slots) {
    if (slots === 0) return [];
    let best = [];
    const choices = [[]];
    for (let i = 0; i < hand.length; i++) {
      if (hand[i].value <= limit) choices.push([hand[i]]);
      if (slots < 2) continue;
      for (let j = i + 1; j < hand.length; j++) if (hand[i].value + hand[j].value <= limit) choices.push([hand[i], hand[j]]);
    }
    for (const choice of choices) {
      const total = choice.reduce((sum, card) => sum + card.value, 0);
      const bestTotal = best.reduce((sum, card) => sum + card.value, 0);
      if (choice.length > best.length || (choice.length === best.length && total > bestTotal)) best = choice;
    }
    return best;
  }

  function playRobot(game) {
    if (!game.robot || game.active !== 1 || game.phase === 'finished') return game;
    let steps = 0;
    while (game.active === 1 && game.phase !== 'finished') {
      if (++steps > 256) throw new Error('Robot could not finish its turn after 256 actions.');
      const player = game.players[1];
      const opponent = game.players[0];
      switch (game.phase) {
        case 'setup-handoff':
        case 'turn-handoff': act(game, { type: 'ready' }); break;
        case 'setup-roll':
        case 'turn-roll': act(game, { type: 'roll' }); break;
        case 'setup-legend': {
          const eligible = player.hand.filter(card => card.value <= game.roll * 100);
          if (!eligible.length) act(game, { type: 'reroll' });
          else act(game, { type: 'legend', cardId: eligible.reduce((best, card) => card.value > best.value ? card : best).id });
          break;
        }
        case 'setup-place': {
          const choices = chooseSetupProtectors(player.hand, game.roll * 100 - game.setupTotal, 2 - player.protectors.length);
          if (choices.length) act(game, { type: 'place', cardId: choices[0].id }); else act(game, { type: 'done' });
          break;
        }
        case 'turn-place': {
          const eligible = player.protectors.length < 2 ? player.hand.filter(card => card.value <= game.roll * 100) : [];
          if (eligible.length) act(game, { type: 'place', cardId: eligible.reduce((best, card) => card.value > best.value ? card : best).id });
          else act(game, { type: 'done' });
          break;
        }
        case 'attack': {
          const attacker = player.protectors.reduce((best, card) => !best || card.value > best.value ? card : best, null);
          const target = opponent.protectors.length ? opponent.protectors.reduce((best, card) => card.value < best.value ? card : best) : opponent.legend;
          if (attacker && target && attacker.value >= target.value) act(game, { type: 'attack', attackerId: attacker.id, targetId: target.id });
          else act(game, { type: 'end-turn' });
          break;
        }
        default: throw new Error(`Robot encountered an unknown game phase: ${game.phase}`);
      }
    }
    return game;
  }

  window.legendTableGame = { createGame, act, playRobot, GameError };
})();
