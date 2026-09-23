import crypto from 'node:crypto';

export class SessionStore {
  #sessions = new Map();
  constructor({ idleMs }) { this.idleMs = idleMs; }
  create(identity) {
    const id = crypto.randomBytes(32).toString('base64url');
    const now = Date.now();
    this.#sessions.set(id, { id, ...identity, createdAt: now, lastActivityAt: now, strongAuthAt: null, locked: false });
    return id;
  }
  get(id, { touch = true } = {}) {
    const session = id ? this.#sessions.get(id) : null;
    if (!session) return null;
    if (Date.now() - session.lastActivityAt > this.idleMs) session.locked = true;
    if (touch && !session.locked) session.lastActivityAt = Date.now();
    return session;
  }
  lock(id) { const s = this.#sessions.get(id); if (s) s.locked = true; }
  unlockForDevelopment(id) { const s = this.#sessions.get(id); if (s) { s.locked = false; s.strongAuthAt = Date.now(); s.lastActivityAt = Date.now(); } return s; }
  revoke(id) { this.#sessions.delete(id); }
  clear() { this.#sessions.clear(); }
}
