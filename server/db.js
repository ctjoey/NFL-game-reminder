// Tiny JSON-file store. Good enough for a single-node deployment; swap for SQLite/Postgres by
// keeping the same get/save surface. No accounts, no passwords: a user is a random token.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const DATA_DIR = process.env.DATA_DIR || path.resolve(process.cwd(), 'data');
const FILE = path.join(DATA_DIR, 'db.json');

const EMPTY = () => ({ users: {}, sent: {}, schedule: null, changes: [], meta: { createdAt: new Date().toISOString() } });

export class DB {
  constructor({ file = FILE, persist = true } = {}) {
    this.file = file;
    this.persist = persist;
    this.data = EMPTY();
    this._timer = null;
    if (persist) this.load();
  }
  load() {
    try {
      if (fs.existsSync(this.file)) {
        const raw = JSON.parse(fs.readFileSync(this.file, 'utf8'));
        this.data = { ...EMPTY(), ...raw };
      }
    } catch (e) {
      console.error('[db] could not read', this.file, e.message);
    }
  }
  save() {
    if (!this.persist) return;
    clearTimeout(this._timer);
    this._timer = setTimeout(() => this.flush(), 150);
  }
  flush() {
    if (!this.persist) return;
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = this.file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 1));
    fs.renameSync(tmp, this.file);
  }
  newId(prefix = 'u') { return `${prefix}_${crypto.randomBytes(12).toString('base64url')}`; }
  // users
  createUser(fields) {
    const id = this.newId('u');
    const user = { id, createdAt: new Date().toISOString(), ...fields };
    this.data.users[id] = user;
    this.save();
    return user;
  }
  getUser(id) { return this.data.users[id] || null; }
  updateUser(id, patch) {
    const u = this.data.users[id];
    if (!u) return null;
    Object.assign(u, patch, { updatedAt: new Date().toISOString() });
    this.save();
    return u;
  }
  deleteUser(id) { delete this.data.users[id]; this.save(); }
  users() { return Object.values(this.data.users); }
  // sent log (idempotency)
  wasSent(key) { return Boolean(this.data.sent[key]); }
  markSent(key, info = {}) { this.data.sent[key] = { at: new Date().toISOString(), ...info }; this.save(); } // info.at may override for clock-driven callers
  sentEntries(prefix = '') { return Object.entries(this.data.sent).filter(([k]) => k.startsWith(prefix)); }
  // schedule cache
  getSchedule() { return this.data.schedule; }
  setSchedule(s) { this.data.schedule = s; this.save(); }
  addChanges(list) { this.data.changes.push(...list); if (this.data.changes.length > 2000) this.data.changes = this.data.changes.slice(-2000); this.save(); }
  changes() { return this.data.changes; }
}
