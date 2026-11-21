const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createApp } = require('../server');

test('game actions persist across server restarts and invalid actions do not alter storage', async t => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'legend-table-test-'));
  t.after(() => fs.rm(dataDir, { recursive: true, force: true }));
  let server = createApp({ dataDir });
  const listen = async () => {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    return `http://127.0.0.1:${server.address().port}`;
  };
  let base = await listen();
  t.after(() => new Promise(resolve => server.close(resolve)));
  for (const artwork of ['fire-dog.svg', 'water-dog.svg']) {
    const image = await fetch(`${base}/${artwork}`);
    assert.equal(image.status, 200);
    assert.match(image.headers.get('content-type'), /image\/svg\+xml/);
    assert.match(await image.text(), /<svg/);
  }
  const deck = Array.from({ length: 6 }, (_, index) => ({ name: `Card ${index}`, value: 100 }));
  const response = await fetch(`${base}/api/games`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ players: [{ name: 'A', cards: deck }, { name: 'B', cards: deck }], first: 1, robot: false }),
  });

  assert.equal(response.status, 201);
  const game = await response.json();
  assert.equal(game.robot, false);
  assert.equal(game.phase, 'setup-handoff');
  assert.equal(game.players[1].legend, null);
  const url = `${base}/api/games/${game.id}/actions`;
  const post = body => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  assert.equal((await post({ type: 'ready' })).status, 200);
  assert.equal((await post({ type: 'attack' })).status, 400);
  await new Promise(resolve => server.close(resolve));
  server = createApp({ dataDir });
  base = await listen();
  const loaded = await (await fetch(`${base}/api/games/${game.id}`)).json();
  assert.equal(loaded.phase, 'setup-roll');
  assert.equal(loaded.active, 1);
  assert.equal(loaded.robot, false);
  const disk = JSON.parse(await fs.readFile(path.join(dataDir, 'games.json'), 'utf8'));
  assert.equal(disk[0].phase, 'setup-roll');
  assert.equal(disk[0].players[1].hand.length, 5);
});

test('robot games save automatic setup and survive restart', async t => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'legend-robot-test-'));
  t.after(() => fs.rm(dataDir, { recursive: true, force: true }));
  let server = createApp({ dataDir });
  const listen = async () => {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    return `http://127.0.0.1:${server.address().port}`;
  };
  let base = await listen();
  t.after(() => new Promise(resolve => server.close(resolve)));
  const cards = Array.from({ length: 10 }, (_, index) => ({ name: `Card ${index}`, value: 100 }));
  const created = await fetch(`${base}/api/games`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ players: [{ name: 'Human', cards }, { name: 'Robot', cards }], first: 1, robot: true }),
  });
  assert.equal(created.status, 201);
  const game = await created.json();
  assert.equal(game.robot, true);
  assert.equal(game.active, 0);
  assert.ok(game.players[1].legend);
  await new Promise(resolve => server.close(resolve));
  server = createApp({ dataDir });
  base = await listen();
  const loaded = await (await fetch(`${base}/api/games/${game.id}`)).json();
  assert.equal(loaded.robot, true);
  assert.deepEqual(loaded.players[1], game.players[1]);
  assert.equal(loaded.phase, 'setup-handoff');
});
