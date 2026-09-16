#!/usr/bin/env node
// App Store copy has hard character limits, and App Store Connect enforces them by silently
// truncating the box you are typing into - which is how you end up shipping "Which CBS and FOX
// games your mar". Counting by eye does not survive a fifth rewrite, so count here instead.
//
//   node marketing/check-copy.js
//
// Limits come from the documents themselves: a heading like "## Subtitle (30)" or a field like
// "- **Event name:** ..." declares what it is, so adding a field to the sheet adds a check.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

// Field label -> limit, for the "- **Label:** value" lines in the events sheet.
const FIELD_LIMITS = {
  'Reference name': 64,
  'Event name': 30,
  'Short description': 50,
  'Long description': 120,
};

export function checkCopy() {
  const problems = [];
  const files = ['app-store-copy.md', 'in-app-events.md'];

  for (const name of files) {
    const file = path.join(here, name);
    if (!fs.existsSync(file)) { problems.push(`${name}: missing`); continue; }
    const lines = fs.readFileSync(file, 'utf8').split('\n');

    // "- **Event name:** Week 3 Coverage Map"
    lines.forEach((line, i) => {
      const m = line.match(/^- \*\*([^:*]+):\*\*\s*(.+)$/);
      if (!m) return;
      const limit = FIELD_LIMITS[m[1].trim()];
      if (!limit) return;
      const value = m[2].replace(/`/g, '').trim();
      if (value.length > limit) problems.push(`${name}:${i + 1} ${m[1]} is ${value.length}/${limit}: "${value}"`);
    });

    // "## Subtitle (30)" followed by one or more blockquote blocks, each a candidate string.
    let section = null;
    let block = [];
    const flush = (n) => {
      if (section && block.length) {
        const value = block.join(' ').replace(/\s+/g, ' ').trim();
        if (value.length > section.limit) problems.push(`${name}:${n} ${section.title} is ${value.length}/${section.limit}: "${value.slice(0, 60)}..."`);
      }
      block = [];
    };
    lines.forEach((line, i) => {
      const h = line.match(/^##+\s+(.+?)\s*\((\d+)\)/);
      if (h) { flush(i); section = { title: h[1], limit: Number(h[2]) }; return; }
      if (/^##+\s/.test(line)) { flush(i); section = null; return; }
      if (line.startsWith('>')) { block.push(line.replace(/^>\s?/, '')); return; }
      flush(i);
    });
    flush(lines.length);
  }
  return problems;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const problems = checkCopy();
  if (problems.length) { console.error(problems.map((p) => `  ${p}`).join('\n')); console.error(`${problems.length} string(s) over the limit.`); process.exit(1); }
  console.log('All App Store copy is within Apple\'s character limits.');
}
