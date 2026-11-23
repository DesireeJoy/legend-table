const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { createGame, act, GameError } = require('./game');
const { playRobot } = require('./robot');

const publicDir = path.join(__dirname, 'public');
const maxBodyBytes = 1024 * 1024;
const staticFiles = {
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/app.js': ['app.js', 'text/javascript; charset=utf-8'],
  '/game.js': ['game.js', 'text/javascript; charset=utf-8'],
  '/decks.js': ['decks.js', 'text/javascript; charset=utf-8'],
  '/styles.css': ['styles.css', 'text/css; charset=utf-8'],
  '/fire-dog.svg': ['fire-dog.svg', 'image/svg+xml'],
  '/water-dog.svg': ['water-dog.svg', 'image/svg+xml'],
};

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function text(value, label, max, required = false) {
  if (typeof value !== 'string' || value.length > max || (required && !value.trim())) {
    throw new HttpError(400, `${label} must be ${required ? 'a non-empty string' : 'a string'} of at most ${max} characters.`);
  }
  return value.trim();
}

function sessionFields(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new HttpError(400, 'A session object is required.');
  const status = text(input.status, 'Status', 20, true);
  if (!['planned', 'in-progress', 'completed'].includes(status)) throw new HttpError(400, 'Invalid session status.');
  return {
    name: text(input.name, 'Session name', 100, true),
    status,
    progress: text(input.progress, 'Progress', 2000),
    notes: text(input.notes, 'Session notes', 5000),
  };
}

function handFields(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new HttpError(400, 'A hand object is required.');
  if (!Array.isArray(input.cards) || input.cards.length > 200) throw new HttpError(400, 'Cards must be a list of at most 200 entries.');
  return {
    name: text(input.name, 'Hand name', 100, true),
    cards: input.cards.map(card => text(card, 'Card', 100, true)),
    notes: text(input.notes, 'Hand notes', 5000),
  };
}

async function readBody(req) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBodyBytes) throw new HttpError(413, 'Request is too large.');
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new HttpError(400, 'Request body must be valid JSON.');
  }
}

function sendJson(res, status, value) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(JSON.stringify(value));
}

function createApp({ dataDir = path.join(__dirname, 'data') } = {}) {
  let queue = Promise.resolve();

  async function readRecords(name) {
    let raw;
    try {
      raw = await fs.readFile(path.join(dataDir, `${name}.json`), 'utf8');
    } catch (error) {
      if (error.code === 'ENOENT') return [];
      throw error;
    }
    const data = JSON.parse(raw);
    if (!Array.isArray(data)) throw new Error(`${name}.json must contain an array.`);
    return data;
  }

  async function writeRecords(name, records) {
    await fs.mkdir(dataDir, { recursive: true });
    const dataFile = path.join(dataDir, `${name}.json`);
    const tempFile = path.join(dataDir, `.${name}-${randomUUID()}.tmp`);
    try {
      await fs.writeFile(tempFile, `${JSON.stringify(records, null, 2)}\n`, { flag: 'wx' });
      await fs.rename(tempFile, dataFile);
    } finally {
      await fs.rm(tempFile, { force: true });
    }
  }

  async function routeApi(req, res, pathname) {
    const segments = pathname.split('/').filter(Boolean);
    if (segments[1] === 'games') {
      if (segments.length < 2 || segments.length > 4 || (segments.length === 4 && segments[3] !== 'actions')) throw new HttpError(404, 'Not found.');
      const games = await readRecords('games');
      if (segments.length === 2 && req.method === 'GET') return sendJson(res, 200, games);
      if (segments.length === 2 && req.method === 'POST') {
        const game = createGame(await readBody(req));
        playRobot(game);
        games.push(game);
        await writeRecords('games', games);
        return sendJson(res, 201, game);
      }
      if (segments.length >= 3) {
        const index = games.findIndex(game => game.id === segments[2]);
        if (index < 0) throw new HttpError(404, 'Game not found.');
        if (segments.length === 3 && req.method === 'GET') return sendJson(res, 200, games[index]);
        if (segments.length === 3 && req.method === 'DELETE') {
          games.splice(index, 1);
          await writeRecords('games', games);
          return sendJson(res, 200, { ok: true });
        }
        if (segments.length === 4 && req.method === 'POST') {
          if (games[index].robot && games[index].active === 1 && games[index].phase !== 'finished') throw new HttpError(409, 'Wait for the robot to finish its turn.');
          act(games[index], await readBody(req));
          playRobot(games[index]);
          await writeRecords('games', games);
          return sendJson(res, 200, games[index]);
        }
      }
      throw new HttpError(405, 'Method not allowed.');
    }
    if (segments[0] !== 'api' || segments[1] !== 'sessions' || segments.length > 5 ||
        (segments.length >= 4 && segments[3] !== 'hands')) {
      throw new HttpError(404, 'Not found.');
    }
    const method = req.method;
    const sessions = await readRecords('sessions');
    if (segments.length === 2) {
      if (method === 'GET') return sendJson(res, 200, sessions);
      if (method === 'POST') {
        const fields = sessionFields(await readBody(req));
        const now = new Date().toISOString();
        const session = { id: randomUUID(), ...fields, hands: [], createdAt: now, updatedAt: now };
        sessions.push(session);
        await writeRecords('sessions', sessions);
        return sendJson(res, 201, session);
      }
    } else {
      const sessionIndex = sessions.findIndex(item => item.id === segments[2]);
      if (sessionIndex < 0) throw new HttpError(404, 'Session not found.');
      const session = sessions[sessionIndex];
      if (segments.length === 3) {
        if (method === 'PUT') {
          Object.assign(session, sessionFields(await readBody(req)), { updatedAt: new Date().toISOString() });
          await writeRecords('sessions', sessions);
          return sendJson(res, 200, session);
        }
        if (method === 'DELETE') {
          sessions.splice(sessionIndex, 1);
          await writeRecords('sessions', sessions);
          return sendJson(res, 200, { ok: true });
        }
      } else if (segments.length === 4 && method === 'POST') {
        const fields = handFields(await readBody(req));
        const now = new Date().toISOString();
        const hand = { id: randomUUID(), ...fields, createdAt: now, updatedAt: now };
        session.hands.push(hand);
        session.updatedAt = now;
        await writeRecords('sessions', sessions);
        return sendJson(res, 201, hand);
      } else if (segments.length === 5) {
        const handIndex = session.hands.findIndex(item => item.id === segments[4]);
        if (handIndex < 0) throw new HttpError(404, 'Hand not found.');
        if (method === 'PUT') {
          const hand = session.hands[handIndex];
          const fields = handFields(await readBody(req));
          Object.assign(hand, fields, { updatedAt: new Date().toISOString() });
          session.updatedAt = hand.updatedAt;
          await writeRecords('sessions', sessions);
          return sendJson(res, 200, hand);
        }
        if (method === 'DELETE') {
          session.hands.splice(handIndex, 1);
          session.updatedAt = new Date().toISOString();
          await writeRecords('sessions', sessions);
          return sendJson(res, 200, { ok: true });
        }
      }
    }
    throw new HttpError(405, 'Method not allowed.');
  }

  return http.createServer((req, res) => {
    const work = async () => {
      try {
        const address = req.socket.localAddress;
        const allowedHost = `${address === '::1' ? '[::1]' : address}:${req.socket.localPort}`;
        if (req.headers.host !== allowedHost || (req.headers.origin && req.headers.origin !== `http://${allowedHost}`)) {
          throw new HttpError(403, 'Invalid host or origin.');
        }
        const pathname = new URL(req.url, `http://${allowedHost}`).pathname;
        if (pathname.startsWith('/api/')) return await routeApi(req, res, pathname);
        const file = staticFiles[pathname];
        if (!file) throw new HttpError(404, 'Not found.');
        if (req.method !== 'GET') throw new HttpError(405, 'Method not allowed.');
        const content = await fs.readFile(path.join(publicDir, file[0]));
        res.writeHead(200, {
          'Content-Type': file[1],
          'Cache-Control': 'no-store',
          'X-Content-Type-Options': 'nosniff',
          'Content-Security-Policy': "default-src 'self'; style-src 'self'; script-src 'self'; base-uri 'none'; frame-ancestors 'none'",
        });
        res.end(content);
      } catch (error) {
        if (!(error instanceof HttpError) && !(error instanceof GameError)) console.error('Request failed:', error);
        if (!res.headersSent) sendJson(res, error instanceof GameError ? 400 : error.status || 500, error instanceof HttpError || error instanceof GameError ? error.message : 'Unable to process the request. Check the server output.');
        else res.destroy();
      }
    };
    // Serialize API requests so concurrent writes cannot overwrite one another.
    if (req.url.startsWith('/api/')) {
      queue = queue.then(work, work);
    } else {
      work();
    }
  });
}

if (require.main === module) {
  const port = Number(process.env.PORT || 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be an integer between 1 and 65535.');
  createApp().listen(port, '127.0.0.1', () => {
    console.log(`Card Table is running at http://127.0.0.1:${port}`);
  });
}

module.exports = { createApp };
