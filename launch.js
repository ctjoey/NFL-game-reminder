// One-click launcher. Double-click "Run App" (or run `node launch.js`):
//  1. creates .env with fresh Web Push keys on first run (so push works on localhost)
//  2. loads .env, starts the server, opens your browser.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
process.chdir(root);
const envFile = path.join(root, '.env');

if (!fs.existsSync(path.join(root, 'node_modules', 'express'))) {
  console.log('Dependencies missing. Run:  npm install   (then start again)');
  process.exit(1);
}

if (!fs.existsSync(envFile)) {
  const { default: webpush } = await import('web-push');
  const k = webpush.generateVAPIDKeys();
  fs.writeFileSync(envFile, [
    '# Generated on first run. Safe to edit.',
    'PORT=3000',
    'BASE_URL=http://localhost:3000',
    `VAPID_PUBLIC_KEY=${k.publicKey}`,
    `VAPID_PRIVATE_KEY=${k.privateKey}`,
    'VAPID_SUBJECT=mailto:you@example.com',
    '# "espn" pulls the live schedule; "seed" runs fully offline',
    'SCHEDULE_SOURCE=espn',
    'SYNC_INTERVAL_MIN=15',
    '',
  ].join('\n'));
  console.log('Created .env with new push keys.');
}
for (const line of fs.readFileSync(envFile, 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
}

if (process.env.PORT && process.env.PORT !== '3000' && process.env.BASE_URL === 'http://localhost:3000') process.env.BASE_URL = `http://localhost:${process.env.PORT}`;

const { startServer } = await import('./server/index.js');
startServer({
  onListen(url) {
    console.log('\nOpen this in your browser if it did not open by itself:  ' + url);
    console.log('Press Ctrl+C in this window to stop the app.\n');
    if (process.env.NO_BROWSER) return;
    const cmd = process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]] : process.platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]];
    try { spawn(cmd[0], cmd[1], { stdio: 'ignore', detached: true }).on('error', () => {}).unref(); } catch {}
  },
});
