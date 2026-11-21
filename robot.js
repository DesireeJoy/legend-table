const { act } = require('./game');

function chooseSetupProtectors(hand, limit, slots) {
  if (slots === 0) return [];
  let best = [];
  const choices = [[]];
  for (let i = 0; i < hand.length; i++) {
    if (hand[i].value <= limit) choices.push([hand[i]]);
    if (slots < 2) continue;
    for (let j = i + 1; j < hand.length; j++) {
      if (hand[i].value + hand[j].value <= limit) choices.push([hand[i], hand[j]]);
    }
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
      case 'turn-handoff':
        act(game, { type: 'ready' });
        break;
      case 'setup-roll':
      case 'turn-roll':
        act(game, { type: 'roll' });
        break;
      case 'setup-legend': {
        const eligible = player.hand.filter(card => card.value <= game.roll * 100);
        if (!eligible.length) act(game, { type: 'reroll' });
        else {
          const legend = eligible.reduce((best, card) => card.value > best.value ? card : best);
          act(game, { type: 'legend', cardId: legend.id });
        }
        break;
      }
      case 'setup-place': {
        const choices = chooseSetupProtectors(player.hand, game.roll * 100 - game.setupTotal, 2 - player.protectors.length);
        if (choices.length) act(game, { type: 'place', cardId: choices[0].id });
        else act(game, { type: 'done' });
        break;
      }
      case 'turn-place': {
        const eligible = player.protectors.length < 2 ? player.hand.filter(card => card.value <= game.roll * 100) : [];
        if (eligible.length) {
          const protector = eligible.reduce((best, card) => card.value > best.value ? card : best);
          act(game, { type: 'place', cardId: protector.id });
        } else act(game, { type: 'done' });
        break;
      }
      case 'attack': {
        const attacker = player.protectors.reduce((best, card) => !best || card.value > best.value ? card : best, null);
        const target = opponent.protectors.length
          ? opponent.protectors.reduce((best, card) => card.value < best.value ? card : best)
          : opponent.legend;
        if (attacker && target && attacker.value >= target.value) {
          act(game, { type: 'attack', attackerId: attacker.id, targetId: target.id });
        } else act(game, { type: 'end-turn' });
        break;
      }
      default:
        throw new Error(`Robot encountered an unknown game phase: ${game.phase}`);
    }
  }
  return game;
}

module.exports = { playRobot };
