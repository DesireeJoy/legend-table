'use strict';

const starterDecks = (() => {
  const fire = {
    descriptors: ['Ember', 'Blazing', 'Flame', 'Cinder', 'Lava', 'Sunfire', 'Inferno', 'Scorch', 'Phoenix', 'Volcanic'],
    creatures: ['Hound', 'Guardian', 'Pup', 'Hunter', 'Sentinel', 'Champion', 'Scout', 'Defender', 'Wolf', 'Knight'],
  };
  const water = {
    descriptors: ['Ocean', 'Tidal', 'River', 'Coral', 'Frost', 'Azure', 'Storm', 'Mist', 'Aqua', 'Glacier'],
    creatures: ['Hound', 'Guardian', 'Pup', 'Hunter', 'Sentinel', 'Champion', 'Scout', 'Defender', 'Wolf', 'Knight'],
  };

  function makeDeck(theme) {
    return theme.descriptors.flatMap((descriptor, row) =>
      theme.creatures.map((creature, column) => ({
        name: `${descriptor} ${creature}`,
        value: ((row * theme.creatures.length + column) % 6 + 1) * 100,
      }))
    );
  }

  return { fire: makeDeck(fire), water: makeDeck(water) };
})();

if (typeof module !== 'undefined') module.exports = starterDecks;
