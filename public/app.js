/* NFL Game Reminder — front end. Vanilla JS, no build step. */
const $ = (sel, el = document) => el.querySelector(sel);
const h = (tag, attrs = {}, ...kids) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') el.className = v; else if (k === 'html') el.innerHTML = v; else if (k.startsWith('on')) el.addEventListener(k.slice(2), v); else if (v !== null && v !== undefined && v !== false) el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) if (kid !== null && kid !== undefined && kid !== false) el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  return el;
};
const api = async (path, opts = {}) => {
  const res = await fetch(path, { headers: { 'content-type': 'application/json' }, ...opts, body: opts.body ? JSON.stringify(opts.body) : undefined });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`);
  return res.json();
};
const toast = (msg, ms = 3200) => { const t = h('div', { class: 'toast' }, msg); document.body.append(t); setTimeout(() => t.remove(), ms); };

const state = { config: null, user: null, view: 'week', week: null, weekData: null, showAll: false, expanded: new Set(), draft: null };
const LS = 'nfl-reminder-user-id';

async function boot() {
  state.config = await api('/api/config');
  const id = localStorage.getItem(LS);
  if (id) { try { state.user = await api(`/api/users/${id}`); } catch { localStorage.removeItem(LS); } }
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
  const params = new URLSearchParams(location.search);
  if (params.get('game')) { const w = params.get('game').match(/-W(\d+)-/); if (w) state.week = Number(w[1]); state.expanded.add(params.get('game')); }
  state.week = state.week || state.config.currentWeek;
  $('#nav').hidden = !state.user;
  $('#nav').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; state.view = b.dataset.view; render(); });
  render();
}

function render() {
  const main = $('#main');
  main.innerHTML = '';
  for (const b of $('#nav').querySelectorAll('button')) b.classList.toggle('active', b.dataset.view === state.view);
  if (!state.user) return main.append(renderSetup());
  if (state.view === 'week') return renderWeek(main);
  if (state.view === 'alerts') return renderAlerts(main);
  if (state.view === 'settings') return main.append(renderSetup(true));
}

/* ---------- setup / settings form ---------- */
function defaultDraft() {
  const c = state.config;
  return {
    tz: Intl.DateTimeFormat().resolvedOptions().timeZone, zip: '', market: null, provider: null, hasAntenna: false, services: [],
    follow: { mode: 'teams', teams: [], games: [], excludeGames: [] },
    alerts: { ...c.defaults.alerts }, quiet: { ...c.defaults.quiet }, maxPerDay: c.defaults.maxPerDay,
    channels: { webhook: '', sms: '' }, channelOverrides: {},
  };
}

function renderSetup(isSettings = false) {
  const c = state.config;
  const d = state.draft || (state.draft = isSettings ? JSON.parse(JSON.stringify({ ...defaultDraft(), ...state.user, channels: { webhook: state.user.channels?.webhook || '', sms: state.user.channels?.sms || '' } })) : defaultDraft());
  const wrap = h('div');
  const rerender = () => { const n = renderSetup(isSettings); wrap.replaceWith(n); };

  if (!isSettings) wrap.append(h('div', { class: 'panel' }, h('h2', {}, 'Set up in 60 seconds'), h('p', { class: 'hint' }, 'No account, no ads. Everything is stored on this device plus a random token on the server. Tell us where you are and what you pay for; we do the rest.')));

  // Location + provider
  const marketInfo = h('div', { class: 'hint' });
  const zipInput = h('input', { type: 'text', inputmode: 'numeric', placeholder: 'e.g. 15201', value: d.zip, oninput: async (e) => {
    d.zip = e.target.value.trim();
    if (d.zip.length >= 5) { const m = await api(`/api/lookup/zip/${d.zip}`); if (m.key) { d.market = m.key; marketSel.value = m.key; marketInfo.textContent = `${m.name}: CBS ${m.affiliates.CBS.call} · FOX ${m.affiliates.FOX.call} · NBC ${m.affiliates.NBC.call} · ABC ${m.affiliates.ABC.call}`; } else marketInfo.textContent = m.message; }
  } });
  const marketSel = h('select', { onchange: (e) => { d.market = e.target.value || null; marketInfo.textContent = ''; } }, h('option', { value: '' }, '— pick your TV market —'), ...c.markets.map((m) => h('option', { value: m.key, selected: d.market === m.key }, `${m.name}, ${m.state}`)));
  const provSel = h('select', { onchange: (e) => { d.provider = e.target.value || null; rerender(); } }, h('option', { value: '' }, '— how do you watch TV? —'), ...c.providers.map((p) => h('option', { value: p.key, selected: d.provider === p.key }, p.name)));
  const prov = c.providers.find((p) => p.key === d.provider);
  const tzSel = h('select', { onchange: (e) => (d.tz = e.target.value) }, ...[d.tz, 'America/New_York', 'America/Chicago', 'America/Denver', 'America/Phoenix', 'America/Los_Angeles', 'America/Anchorage', 'Pacific/Honolulu', 'Europe/London'].filter((v, i, a) => a.indexOf(v) === i).map((z) => h('option', { value: z, selected: d.tz === z }, z)));

  wrap.append(h('div', { class: 'panel' },
    h('h2', {}, 'Where you watch'),
    h('div', { class: 'row' },
      h('div', { class: 'field' }, h('label', {}, 'ZIP code (finds your TV market and local stations)'), zipInput),
      h('div', { class: 'field' }, h('label', {}, 'TV market'), marketSel)),
    marketInfo,
    h('div', { class: 'row' },
      h('div', { class: 'field' }, h('label', {}, 'TV provider'), provSel),
      h('div', { class: 'field' }, h('label', {}, 'Your time zone (all times shown in this zone)'), tzSel)),
    prov?.guideHint ? h('p', { class: 'hint' }, prov.guideHint) : null,
    prov?.carriageNotes ? h('div', { class: 'note warn' }, prov.carriageNotes) : null,
    h('label', { class: 'toggle' }, h('input', { type: 'checkbox', checked: d.hasAntenna, onchange: (e) => (d.hasAntenna = e.target.checked) }), 'I also have an antenna (CBS/FOX/NBC/ABC free over the air)'),
    h('h3', {}, 'Streaming services you pay for'),
    h('p', { class: 'hint' }, 'Used to warn you a day early when a game is somewhere you cannot watch (Netflix, Prime, Peacock, ESPN+...).'),
    h('div', { class: 'chips' }, ...c.services.map((s) => h('span', { class: `chip ${d.services.includes(s.key) ? 'on' : ''}`, title: s.note, onclick: (e) => { d.services = d.services.includes(s.key) ? d.services.filter((x) => x !== s.key) : [...d.services, s.key]; e.target.classList.toggle('on'); } }, s.name))),
    isSettings ? renderChannelOverrides(d, prov) : null,
  ));

  // Follow
  const modeChips = ['teams', 'all', 'games'].map((m) => h('span', { class: `chip ${d.follow.mode === m ? 'on' : ''}`, onclick: () => { d.follow.mode = m; rerender(); } }, { teams: 'My teams', all: 'Every game', games: 'Only games I pick' }[m]));
  wrap.append(h('div', { class: 'panel' },
    h('h2', {}, 'Which games'),
    h('div', { class: 'chips' }, ...modeChips),
    d.follow.mode !== 'games' ? h('div', {}, h('h3', {}, d.follow.mode === 'all' ? 'Highlight these teams' : 'Teams'), h('div', { class: 'chips' }, ...c.teams.map((t) => h('span', { class: `chip small ${d.follow.teams.includes(t.id) ? 'on' : ''}`, onclick: (e) => { d.follow.teams = d.follow.teams.includes(t.id) ? d.follow.teams.filter((x) => x !== t.id) : [...d.follow.teams, t.id]; e.target.classList.toggle('on'); } }, t.short)))) : h('p', { class: 'hint' }, 'Pick games with the “Remind me” button on each game card. You can also add or remove single games in any mode.'),
  ));

  // Alerts
  const a = d.alerts;
  const leadChips = [15, 30, 60, 120, 1440].map((m) => h('span', { class: `chip small ${a.kickoffLeads.includes(m) ? 'on' : ''}`, onclick: (e) => { a.kickoffLeads = a.kickoffLeads.includes(m) ? a.kickoffLeads.filter((x) => x !== m) : [...a.kickoffLeads, m]; e.target.classList.toggle('on'); } }, m >= 1440 ? `${m / 1440} day` : m >= 60 ? `${m / 60} h` : `${m} min`));
  const tog = (key, label, hint) => h('label', { class: 'toggle', title: hint || '' }, h('input', { type: 'checkbox', checked: a[key], onchange: (e) => (a[key] = e.target.checked) }), label);
  wrap.append(h('div', { class: 'panel' },
    h('h2', {}, 'Alerts'),
    h('p', { class: 'hint' }, 'Only these, only for games you follow, never anything else. You can preview every alert before it fires on the Alerts tab.'),
    tog('coverage', 'When network coverage begins (the pregame show), with kickoff time and channel'),
    h('div', { class: 'row', style: 'margin:4px 0 4px 26px' }, h('span', { class: 'hint', style: 'margin:0' }, 'Before kickoff:'), h('div', { class: 'chips' }, ...leadChips)),
    tog('kickoffNow', 'At kickoff'),
    tog('access', 'A day ahead, if the game is on something you don’t have (or has a catch like a blackout)'),
    tog('changes', 'When a game is moved (flex), re-timed, or changes network. Reminders re-arm automatically.'),
    h('div', { class: 'row' }, tog('weekly', 'Weekly rundown of your games with channels'), h('select', { style: 'width:auto', onchange: (e) => (a.weeklyDay = e.target.value) }, ...['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((x) => h('option', { value: x, selected: a.weeklyDay === x }, x))), h('select', { style: 'width:auto', onchange: (e) => (a.weeklyHour = Number(e.target.value)) }, ...Array.from({ length: 24 }, (_, i) => h('option', { value: i, selected: a.weeklyHour === i }, `${((i + 11) % 12) + 1} ${i < 12 ? 'am' : 'pm'}`)))),
    h('h3', {}, 'Quiet hours & limits'),
    h('div', { class: 'row' },
      h('div', { class: 'field' }, h('label', {}, 'Quiet from'), h('input', { type: 'time', value: d.quiet?.start || '', onchange: (e) => (d.quiet = { ...(d.quiet || {}), start: e.target.value }) })),
      h('div', { class: 'field' }, h('label', {}, 'until'), h('input', { type: 'time', value: d.quiet?.end || '', onchange: (e) => (d.quiet = { ...(d.quiet || {}), end: e.target.value }) })),
      h('div', { class: 'field' }, h('label', {}, 'Max alerts per day'), h('input', { type: 'number', min: 1, max: 50, value: d.maxPerDay, onchange: (e) => (d.maxPerDay = Number(e.target.value)) }))),
    h('p', { class: 'hint' }, 'Quiet hours hold the weekly rundown, access warnings and change notices until morning. Coverage and kickoff alerts still fire because you asked for them.'),
  ));

  // Delivery
  const pushRow = h('div', { class: 'actions' });
  wrap.append(h('div', { class: 'panel' },
    h('h2', {}, 'How to deliver'),
    h('p', { class: 'hint' }, state.config.pushPublicKey ? 'Push notifications work on this device once you allow them (on iPhone, add the app to your Home Screen first).' : 'Push is not configured on this server yet (the admin runs `npm run vapid`). You can still use a webhook (e.g. a free ntfy.sh topic to get phone alerts) or the calendar feed.'),
    pushRow,
    h('div', { class: 'row' },
      h('div', { class: 'field' }, h('label', {}, 'Webhook URL (optional: ntfy.sh topic, Slack/Discord webhook, Zapier, Home Assistant)'), h('input', { type: 'url', placeholder: 'https://ntfy.sh/my-nfl-alerts', value: d.channels.webhook || '', oninput: (e) => (d.channels.webhook = e.target.value.trim()) })),
      h('div', { class: 'field' }, h('label', {}, 'SMS number (optional; needs Twilio on the server)'), h('input', { type: 'tel', placeholder: '+1 412 555 0100', value: d.channels.sms || '', oninput: (e) => (d.channels.sms = e.target.value.trim()) }))),
  ));
  if (isSettings) renderPushControls(pushRow);

  const save = h('button', { class: 'btn', onclick: async () => {
    if (!d.market) return toast('Pick your TV market (or enter a ZIP) so we can find your channels.');
    save.disabled = true;
    try {
      const body = { ...d, channels: { webhook: d.channels.webhook || null, sms: d.channels.sms || null } };
      if (isSettings) state.user = await api(`/api/users/${state.user.id}`, { method: 'PUT', body });
      else { state.user = await api('/api/users', { method: 'POST', body }); localStorage.setItem(LS, state.user.id); }
      state.draft = null; $('#nav').hidden = false; state.view = 'week'; state.weekData = null; render();
      toast(isSettings ? 'Saved.' : 'You’re set. Here is your week.');
      if (!isSettings && state.config.pushPublicKey) enablePush().catch(() => {});
    } catch (e) { toast('Could not save: ' + e.message); } finally { save.disabled = false; }
  } }, isSettings ? 'Save changes' : 'Show my games');
  const bar = h('div', { class: 'actions' }, save);
  if (isSettings) {
    bar.append(h('a', { class: 'btn secondary', href: `/api/users/${state.user.id}/calendar.ics`, target: '_blank' }, 'Calendar feed (.ics)'));
    bar.append(h('button', { class: 'btn secondary', onclick: async () => { const r = await api(`/api/users/${state.user.id}/test`, { method: 'POST' }); toast('Test sent: ' + Object.entries(r.results).map(([k, v]) => `${k} ${v.ok ? '✓' : '✗ ' + (v.detail || '')}`).join(', '), 6000); } }, 'Send test alert'));
    bar.append(h('button', { class: 'btn danger', onclick: async () => { if (!confirm('Delete all your data from this server?')) return; await api(`/api/users/${state.user.id}`, { method: 'DELETE' }); localStorage.removeItem(LS); state.user = null; state.draft = null; $('#nav').hidden = true; render(); } }, 'Delete my data'));
  }
  wrap.append(h('div', { class: 'panel' }, bar, isSettings ? h('p', { class: 'hint', style: 'margin-top:10px' }, 'Calendar feed: subscribe to the .ics URL in Google/Apple/Outlook calendar and moved games update themselves. Copy the link address for a subscription rather than downloading it once.') : null));
  return wrap;
}

function renderChannelOverrides(d, prov) {
  const nets = ['CBS', 'FOX', 'NBC', 'ABC', 'ESPN', 'NFLN'];
  const m = state.config.markets.find((x) => x.key === d.market);
  return h('div', {},
    h('h3', {}, 'Channel numbers on ' + (prov?.name || 'your provider')),
    h('p', { class: 'hint' }, prov?.kind === 'stream' ? 'Streaming guides have no numbers; nothing to set. We show the station call sign so you can search for it.' : 'We default to the over-the-air number (exact for antenna, DirecTV and DISH). If your cable box uses different numbers, set them once here and every alert uses yours.'),
    h('div', { class: 'grid2' }, ...nets.map((n) => h('div', { class: 'field' }, h('label', {}, `${n}${m ? '' : ''}`), h('input', { type: 'text', placeholder: prov?.kind === 'stream' ? 'n/a' : 'channel #', value: d.channelOverrides?.[n] || '', oninput: (e) => { d.channelOverrides = { ...(d.channelOverrides || {}), [n]: e.target.value.trim() }; } })))),
  );
}

/* ---------- push ---------- */
function urlB64(s) { const p = '='.repeat((4 - (s.length % 4)) % 4); const b = atob((s + p).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from([...b].map((c) => c.charCodeAt(0))); }
async function enablePush() {
  if (!state.config.pushPublicKey) throw new Error('push not configured on server');
  if (!('Notification' in window) || !('serviceWorker' in navigator)) throw new Error('this browser cannot do push');
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('permission denied');
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64(state.config.pushPublicKey) });
  const r = await api(`/api/users/${state.user.id}/push`, { method: 'POST', body: { subscription: sub.toJSON() } });
  state.user.channels = { ...(state.user.channels || {}), push: Array(r.devices).fill({}) };
  toast(`Push enabled on this device (${r.devices} device${r.devices === 1 ? '' : 's'} total).`);
}
function renderPushControls(row) {
  row.innerHTML = '';
  const n = state.user?.channels?.push?.length || 0;
  row.append(h('span', { class: 'status' }, `Push devices: `, h('b', {}, String(n))));
  if (state.config.pushPublicKey) row.append(h('button', { class: 'btn secondary', onclick: () => enablePush().then(() => renderPushControls(row)).catch((e) => toast('Push: ' + e.message)) }, n ? 'Add this device' : 'Enable push on this device'));
}

/* ---------- week view ---------- */
async function renderWeek(main) {
  const c = state.config;
  const bar = h('div', { class: 'week-bar' },
    h('div', { class: 'row' }, h('select', { onchange: (e) => { state.week = Number(e.target.value); state.weekData = null; render(); } }, ...c.weeks.map((w) => h('option', { value: w, selected: w === state.week }, `Week ${w}`))),
      h('span', { class: `chip small ${!state.showAll ? 'on' : ''}`, onclick: () => { state.showAll = false; render(); } }, 'My games'), h('span', { class: `chip small ${state.showAll ? 'on' : ''}`, onclick: () => { state.showAll = true; render(); } }, 'All games')),
    h('div', { class: 'status', id: 'weekstatus' }));
  main.append(bar);
  const list = h('div');
  main.append(list);
  list.append(h('div', { class: 'empty' }, 'Loading…'));
  try { state.weekData = await api(`/api/users/${state.user.id}/week/${state.week}`); } catch (e) { list.innerHTML = ''; list.append(h('div', { class: 'empty' }, 'Could not load: ' + e.message)); return; }
  const wd = state.weekData;
  $('#weekstatus').replaceChildren(h('b', {}, String(wd.followedCount)), ` games you follow · `, h('b', {}, String(wd.alertsThisWeek)), ` alerts planned · `, h('span', { title: wd.schedule.lastError || '' }, `schedule: ${wd.schedule.source}${wd.schedule.lastSync ? ' (synced ' + new Date(wd.schedule.lastSync).toLocaleString() + ')' : ' (offline seed)'}`));
  list.innerHTML = '';
  const cards = wd.cards.filter((x) => state.showAll || x.followed);
  if (!cards.length) list.append(h('div', { class: 'empty' }, state.showAll ? 'No games loaded for this week yet. The schedule fills in when the live sync runs.' : 'None of your games this week. Switch to “All games” to add one.'));
  if (wd.schedule.source === 'seed') list.append(h('div', { class: 'note warn' }, 'Showing the built-in schedule seed (confirmed games only). The full slate, TBD kickoff times and late flexes load automatically once this server can reach the live schedule feed.'));
  for (const card of cards) list.append(renderCard(card));
}

function badge(conf, text) { return h('span', { class: `badge ${conf}` }, text || conf); }

function renderCard(card) {
  const isOpen = state.expanded.has(card.id);
  const net = card.carriers.networks[0];
  const chan = net?.channel;
  const watchParts = [];
  if (net) {
    watchParts.push(h('span', { class: 'big' }, chan?.station ? `${chan.station.call} (${net.label})` : net.label));
    if (chan?.number) watchParts.push(h('span', { class: 'big' }, `ch. ${chan.number}`), badge(chan.confidence, chan.confidence === 'confirmed' ? (chan.source === 'you set this' ? 'your number' : 'confirmed') : chan.confidence));
    else if (chan?.hint) watchParts.push(h('span', { class: 'hint', style: 'margin:0' }, chan.hint));
    for (const extra of card.carriers.networks.slice(1)) watchParts.push(h('span', {}, `· also ${extra.channel?.station ? extra.channel.station.call + ' ' : ''}${extra.label}${extra.channel?.number ? ' ch. ' + extra.channel.number : ''}`));
  }
  if (card.carriers.exclusive) watchParts.push(h('span', { class: 'big' }, card.carriers.exclusive), badge('info', 'streaming exclusive'));
  else if (card.carriers.streams.length) watchParts.push(h('span', { class: 'hint', style: 'margin:0' }, `· streams on ${card.carriers.streams.map((s) => s.label).join(', ')}`));

  const notes = [];
  if (card.inMarket?.airs === false) notes.push(h('div', { class: 'note warn' }, h('b', {}, 'Not on your local station. '), card.inMarket.reason, '. ', card.access.ways.some((w) => w.network === 'SundayTicket') ? 'Watch on Sunday Ticket.' : 'Out-of-market games need NFL Sunday Ticket.'));
  else if (card.inMarket?.airs === true && card.inMarket.confidence !== 'confirmed' && card.carriers.networks.length && ['SUN_EARLY', 'SUN_LATE'].includes(card.window)) notes.push(h('div', { class: 'note' }, badge(card.inMarket.confidence), ' ', card.inMarket.reason, '. Regional maps are published Wednesdays; we update when they are.'));
  if (!card.access.ok) notes.push(h('div', { class: 'note bad' }, h('b', {}, 'You may not be able to watch this. '), `It is on ${card.carriers.exclusive || card.carriers.networks.map((n) => n.label).join('/') || card.carriers.streams.map((s) => s.label).join('/')}. Options: ${card.access.missing.map((m) => m.label + (m.cost ? ` (${m.cost})` : '') + (m.hint ? ` — ${m.hint}` : '')).join('; ')}.`));
  for (const n of card.access.notes) notes.push(h('div', { class: 'note warn' }, n));
  if (!card.verified) notes.push(h('div', { class: 'note' }, badge('unknown', 'unconfirmed'), ' ', card.notes || 'Some details of this game are not confirmed yet.'));
  if (card.timeTbd) notes.push(h('div', { class: 'note' }, badge('unknown', 'time TBD'), ' Kickoff time not set yet by the league; we will alert you when it is.'));
  if (card.changes?.length) { const ch = card.changes.at(-1); notes.push(h('div', { class: 'note warn' }, h('b', {}, 'Changed: '), `${ch.type} updated ${new Date(ch.at).toLocaleString()}. Reminders were re-armed.`)); }

  const followBtn = h('button', { class: `btn ${card.followed ? 'secondary' : ''}`, onclick: () => toggleFollow(card) }, card.followed ? '✓ Reminding you' : 'Remind me');
  const el = h('div', { class: `card ${card.followed ? 'followed' : 'dim'}` },
    h('div', { class: 'head' }, h('div', {}, h('p', { class: 'title' }, card.title, card.label ? h('span', { class: 'hint', style: 'margin-left:8px;font-weight:400' }, card.label) : null), h('div', { class: 'sub' }, `${card.kickoff.day} · ${card.windowLabel}${card.venue ? ' · ' + card.venue : ''}`)), followBtn),
    h('div', { class: 'clocks' },
      h('div', { class: 'clock' }, h('div', { class: 'k' }, 'Coverage begins'), h('div', { class: 'v' }, card.coverage.local), h('div', { class: 'et' }, `${card.coverage.et} · ${card.coverage.show}`, card.coverage.confidence !== 'stable' && card.coverage.confidence !== 'confirmed' ? ' (typical)' : '')),
      h('div', { class: 'clock' }, h('div', { class: 'k' }, 'Kickoff'), h('div', { class: 'v' }, card.kickoff.local), h('div', { class: 'et' }, card.kickoff.et))),
    h('div', { class: 'watch' }, h('span', { class: 'hint', style: 'margin:0' }, 'Watch on:'), ...watchParts),
    ...notes,
    h('div', { class: 'actions' }, h('button', { class: 'btn secondary', onclick: () => { isOpen ? state.expanded.delete(card.id) : state.expanded.add(card.id); el.replaceWith(renderCard(card)); } }, isOpen ? 'Hide details' : 'Details & alerts'),
      card.followed ? h('span', { class: 'status' }, `${card.alerts.length} alert${card.alerts.length === 1 ? '' : 's'} planned`) : null),
    isOpen ? renderDetails(card) : null,
  );
  return el;
}

function renderDetails(card) {
  const rows = [];
  for (const n of card.carriers.networks) {
    const c = n.channel;
    rows.push(h('dt', {}, n.label), h('dd', {}, c.station ? `${c.station.call} · over-the-air ch. ${c.station.ota}` : 'national channel', c.number ? ` · ${c.source}: ch. ${c.number}` : c.hint ? ` · ${c.hint}` : ''));
  }
  for (const s of card.carriers.streams) rows.push(h('dt', {}, s.label), h('dd', {}, 'streaming'));
  rows.push(h('dt', {}, 'You can watch via'), h('dd', {}, card.access.ways.length ? card.access.ways.map((w) => w.label + (w.channel?.number ? ` ch. ${w.channel.number}` : '')).join(', ') : '— nothing in your services'));
  if (card.access.missing.length) rows.push(h('dt', {}, 'Would also need'), h('dd', {}, card.access.missing.map((m) => m.label + (m.cost ? ` (${m.cost})` : '')).join(', ')));
  rows.push(h('dt', {}, 'In your market'), h('dd', {}, badge(card.inMarket.confidence), ' ', card.inMarket.airs === null ? card.inMarket.reason : card.inMarket.airs ? `Yes. ${card.inMarket.reason}` : `No. ${card.inMarket.reason}`));
  rows.push(h('dt', {}, 'Coverage rule'), h('dd', {}, `${card.coverage.show} starts ${card.coverage.minutesBefore} min before kickoff (${card.coverage.confidence}).`));
  if (card.followReasons?.length) rows.push(h('dt', {}, 'Why you follow it'), h('dd', {}, card.followReasons.join(', ')));
  const alerts = card.alerts.length ? h('div', { class: 'alert-list' }, ...card.alerts.map((a) => h('div', { class: 'item' }, h('span', { class: 'when' }, a.fireAtLocal), h('span', {}, h('span', { class: 'type' }, alertName(a.type)), a.critical ? '' : h('span', { class: 'hint', style: 'margin-left:6px' }, '(held during quiet hours)'))))) : h('p', { class: 'hint' }, card.followed ? 'No alerts planned (all alert types are off in Settings, or the game already started).' : 'Turn on “Remind me” to plan alerts for this game.');
  const changes = card.changes?.length ? h('div', {}, h('h3', {}, 'Change log'), ...card.changes.map((c) => h('div', { class: 'hint' }, `${new Date(c.at).toLocaleString()}: ${c.type} — ${fmtVal(c.old)} → ${fmtVal(c.new)}`))) : null;
  return h('div', { class: 'details' }, h('dl', {}, ...rows), h('h3', {}, 'Planned alerts'), alerts, changes);
}
function fmtVal(v) { if (Array.isArray(v)) return v.join('/'); if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v)) return new Date(v).toLocaleString(); return String(v); }
function alertName(t) { if (t === 'coverage') return 'Coverage begins'; if (t === 'kickoff_0') return 'Kickoff'; if (t.startsWith('kickoff_')) { const m = Number(t.split('_')[1]); return `Kickoff in ${m >= 1440 ? m / 1440 + ' day' : m >= 60 ? m / 60 + ' h' : m + ' min'}`; } if (t === 'access') return 'Can you watch it? (only sent if there is a catch)'; if (t === 'weekly') return 'Weekly rundown'; if (t === 'change') return 'Schedule change'; return t; }

async function toggleFollow(card) {
  const f = { ...(state.user.follow || { mode: 'teams', teams: [], games: [], excludeGames: [] }) };
  f.games = f.games || []; f.excludeGames = f.excludeGames || [];
  if (card.followed) { f.games = f.games.filter((g) => g !== card.id); if (!f.excludeGames.includes(card.id)) f.excludeGames.push(card.id); }
  else { f.excludeGames = f.excludeGames.filter((g) => g !== card.id); if (!f.games.includes(card.id)) f.games.push(card.id); }
  state.user = await api(`/api/users/${state.user.id}`, { method: 'PUT', body: { follow: f } });
  state.weekData = null; render();
}

/* ---------- alerts view ---------- */
async function renderAlerts(main) {
  main.append(h('div', { class: 'empty' }, 'Loading…'));
  const d = await api(`/api/users/${state.user.id}/alerts`);
  main.innerHTML = '';
  const teams = Object.fromEntries(state.config.teams.map((t) => [t.id, t.short]));
  const gameName = (g, a) => (g ? `${teams[g.away] || g.away} at ${teams[g.home] || g.home}` : `Week ${a.week}`);
  main.append(h('div', { class: 'panel' }, h('h2', {}, `Coming up: ${d.planned.length} alert${d.planned.length === 1 ? '' : 's'}`), h('p', { class: 'hint' }, 'This is the complete list. Nothing outside it will ever be sent. Times are in your zone.'),
    d.planned.length ? h('div', { class: 'alert-list' }, ...d.planned.map((a) => h('div', { class: 'item' }, h('span', { class: 'when' }, a.fireAtLocal), h('span', {}, h('span', { class: 'type' }, alertName(a.type)), ' · ', gameName(a.game, a))))) : h('p', { class: 'empty' }, 'Nothing planned. Follow a game or turn on an alert type in Settings.')));
  const recent = d.inbox.length ? d.inbox : d.recent;
  main.append(h('div', { class: 'panel' }, h('h2', {}, 'Recently sent'), recent.length ? h('div', { class: 'alert-list' }, ...recent.map((r) => h('div', { class: 'item' }, h('span', { class: 'when' }, new Date(r.at).toLocaleString()), h('span', {}, r.title ? h('span', {}, h('span', { class: 'type' }, r.title), h('br'), h('span', { class: 'hint' }, r.body)) : h('span', { class: 'type' }, alertName(r.type || '')))))) : h('p', { class: 'hint' }, 'Nothing sent yet.')));
}

boot().catch((e) => { $('#main').innerHTML = ''; $('#main').append(h('div', { class: 'empty' }, 'Could not start: ' + e.message)); });
