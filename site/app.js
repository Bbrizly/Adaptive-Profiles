const RAW_FALLBACK = 'https://raw.githubusercontent.com/Bbrizly/Adaptive-Profiles/main/generated/index.json';
const RAW_ROOT = 'https://raw.githubusercontent.com/Bbrizly/Adaptive-Profiles/main';
const QCM_RELEASES = 'https://github.com/Bbrizly/Quadstick-Config-Manager/releases/latest';
const IS_GITHUB_PAGES = location.hostname.endsWith('github.io');
const PAGES_BASE = '/Adaptive-Profiles';
const PROFILE_ID = /^[a-z0-9]+(?:-+[a-z0-9]+)*$/;

const state = {
  registry: null,
  config: null,
  turnstileWidget: null,
  qcmProfileId: '',
  qcmTimer: null,
  qcmLeftPage: false,
};

const main = document.querySelector('#content');
const submitDialog = document.querySelector('#submitDialog');
const form = document.querySelector('#submitForm');
const statusEl = document.querySelector('#submitStatus');
const qcmDialog = document.querySelector('#qcmDialog');
const qcmFallback = document.querySelector('#qcmFallback');
const qcmProgress = document.querySelector('#qcmProgress');
const toast = document.querySelector('#toast');

boot();

async function boot() {
  bindGlobalEvents();
  syncStaticRouteLinks();
  try {
    const [registry, config] = await Promise.all([loadRegistry(), safeJson('/api/v1/config').catch(() => null)]);
    state.registry = registry;
    state.config = config?.data || { submissionsEnabled: false, turnstileSiteKey: '' };
    populateSubmitForm();
    await initTurnstile().catch(() => {});
    render();
  } catch (error) {
    main.innerHTML = `<div class="error-box"><h2>Registry unavailable</h2><p>${esc(error.message)}</p><p>The canonical data remains public on GitHub. Try the repository directly while the read path recovers.</p><a class="button" href="https://github.com/Bbrizly/Adaptive-Profiles" rel="noreferrer">Open GitHub registry</a></div>`;
  }
}

async function loadRegistry() {
  if (!IS_GITHUB_PAGES) {
    try {
      const result = await safeJson('/api/v1/index');
      if (result?.data) return result.data;
    } catch {}
  }
  const response = await fetch(RAW_FALLBACK, { cache: 'no-store' });
  if (!response.ok) throw new Error('Could not load the registry API or GitHub fallback.');
  return response.json();
}

async function safeJson(url, options) {
  const response = await fetch(url, options);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.detail || `Request failed (${response.status})`);
  return body;
}

function bindGlobalEvents() {
  document.addEventListener('click', event => {
    const qcm = event.target.closest('[data-qcm-id]');
    if (qcm) {
      event.preventDefault();
      openInQcm(qcm.dataset.qcmId);
      return;
    }
    const route = event.target.closest('[data-route]');
    if (route) {
      event.preventDefault();
      navigate(route.dataset.route || '/');
    }
  });

  if (IS_GITHUB_PAGES) addEventListener('hashchange', render);
  else addEventListener('popstate', render);

  document.querySelector('#openSubmit').addEventListener('click', openSubmitDialog);
  submitDialog.addEventListener('click', event => { if (event.target === submitDialog) submitDialog.close(); });
  form.addEventListener('submit', submitProfile);
  form.addEventListener('change', event => {
    if (event.target.name === 'sourceType') syncSourcePicker();
    if (event.target.name === 'gameId') syncPlatforms();
  });

  const drop = document.querySelector('#dropZone');
  const file = document.querySelector('#csvInput');
  for (const type of ['dragenter', 'dragover']) drop.addEventListener(type, event => {
    event.preventDefault();
    drop.classList.add('dragover');
  });
  for (const type of ['dragleave', 'drop']) drop.addEventListener(type, event => {
    event.preventDefault();
    drop.classList.remove('dragover');
  });
  drop.addEventListener('drop', event => {
    const item = event.dataTransfer.files?.[0];
    if (!item) return;
    const dt = new DataTransfer();
    dt.items.add(item);
    file.files = dt.files;
    document.querySelector('#csvName').textContent = item.name;
  });
  file.addEventListener('change', () => {
    document.querySelector('#csvName').textContent = file.files?.[0]?.name || 'or choose a file';
  });

  document.querySelector('#qcmRetry').addEventListener('click', () => attemptQcmLaunch());
  document.querySelector('#qcmCopy').addEventListener('click', copyQcmLink);
  document.querySelector('.qcm-close').addEventListener('click', closeQcmDialog);
  qcmDialog.addEventListener('click', event => { if (event.target === qcmDialog) closeQcmDialog(); });
  addEventListener('blur', noteQcmHandoff);
  document.addEventListener('visibilitychange', () => { if (document.hidden) noteQcmHandoff(); });
}

function routeLocation() {
  const raw = IS_GITHUB_PAGES ? (location.hash.startsWith('#/') ? location.hash.slice(1) : '/') : `${location.pathname}${location.search}`;
  const q = raw.indexOf('?');
  const path = (q >= 0 ? raw.slice(0, q) : raw).replace(/\/+$/, '') || '/';
  return { path, search: new URLSearchParams(q >= 0 ? raw.slice(q + 1) : '') };
}

function routeUrl(path) {
  return IS_GITHUB_PAGES ? `${PAGES_BASE}/#${path}` : path;
}

function routeAnchor(path, label, className = '') {
  return `<a${className ? ` class="${className}"` : ''} href="${attr(routeUrl(path))}" data-route="${attr(path)}">${label}</a>`;
}

function syncStaticRouteLinks() {
  document.querySelectorAll('[data-route]').forEach(link => {
    link.setAttribute('href', routeUrl(link.dataset.route || '/'));
  });
}

function navigate(path) {
  if (IS_GITHUB_PAGES) {
    if (`#${path}` === location.hash) render();
    else location.hash = path;
  } else {
    history.pushState({}, '', path);
    render();
  }
  scrollTo({ top: 0, behavior: 'instant' });
}

function render() {
  if (!state.registry) return;
  const { path, search } = routeLocation();
  document.querySelectorAll('.nav a').forEach(a => a.classList.toggle('active', path === a.dataset.route || path.startsWith(`${a.dataset.route}/`)));
  if (path === '/') return renderHome();
  if (path === '/games') return renderGames();
  if (path === '/profiles') return renderProfiles(search);
  if (path === '/devices') return renderDevices();
  if (path === '/developers') return renderDevelopers();
  let match = path.match(/^\/games\/([a-z0-9-]+)$/); if (match) return renderGame(match[1]);
  match = path.match(/^\/profiles\/([a-z0-9-]+)$/); if (match) return renderProfile(match[1]);
  match = path.match(/^\/devices\/([a-z0-9-]+)$/); if (match) return renderDevice(match[1]);
  main.innerHTML = `<div class="empty"><h2>Page not found</h2><p>That route does not exist in Adaptive Profiles.</p>${routeAnchor('/', 'Back home', 'button')}</div>`;
}

function renderHome() {
  const { games, devices, profiles } = state.registry;
  main.innerHTML = `
    <section class="hero">
      <div class="hero-main">
        <div class="eyebrow">Open adaptive gaming infrastructure</div>
        <h1>Find a setup that already works.</h1>
        <p>Adaptive Profiles turns scattered spreadsheets and forum links into a versioned registry of games, devices, and control layouts. Browse the public data, understand what each layout does, then open the reviewed snapshot directly in QCM.</p>
        <form class="hero-search" id="homeSearch"><input name="q" aria-label="Search games, devices and profiles" autocomplete="off" placeholder="Search Minecraft, QuadStick, low-fatigue…"><button class="button button-primary">Search registry <span aria-hidden="true">→</span></button></form>
      </div>
      <aside class="hero-side" aria-label="How Adaptive Profiles works">
        <div class="hero-side-head"><div><div class="eyebrow">One public layer</div><h2>Game → device → profile</h2></div><span class="live-pill">Git-backed</span></div>
        <div class="workflow-mini">
          <div class="workflow-mini-row"><b>01</b><div><strong>Game knowledge</strong><small>Semantic actions + verified defaults</small></div><em>→</em></div>
          <div class="workflow-mini-row"><b>02</b><div><strong>Adaptive device</strong><small>Inputs defined once, reused everywhere</small></div><em>→</em></div>
          <div class="workflow-mini-row"><b>03</b><div><strong>Community profile</strong><small>Reviewed CSV + provenance</small></div><em>✓</em></div>
        </div>
        <div class="hero-stat-grid"><div class="hero-stat"><strong>${games.length}</strong><span>Games</span></div><div class="hero-stat"><strong>${profiles.length}</strong><span>Profiles</span></div><div class="hero-stat"><strong>${devices.length}</strong><span>Devices</span></div></div>
      </aside>
    </section>
    ${section('Games', 'Understand the game first: actions and default controls are independent from adaptive layouts.', games.map(gameCard).join(''), '/games')}
    ${section('Community profiles', profiles.length ? 'Accepted layouts with immutable reviewed snapshots and source provenance.' : 'The registry is ready for its first reviewed community profile.', profiles.length ? profiles.slice(-8).reverse().map(profileCard).join('') : emptyContribution(), '/profiles')}
    ${section('Adaptive devices', 'A reusable hardware layer means one device definition can support every game.', devices.map(deviceCard).join(''), '/devices')}`;
  document.querySelector('#homeSearch').addEventListener('submit', event => {
    event.preventDefault();
    const q = String(new FormData(event.currentTarget).get('q') || '').trim();
    navigate(`/profiles?search=${encodeURIComponent(q)}`);
  });
}

function section(title, subtitle, body, href) {
  return `<section class="section"><div class="section-head"><div><h2>${esc(title)}</h2><p>${esc(subtitle)}</p></div>${routeAnchor(href, 'View all →', 'link')}</div><div class="grid">${body}</div></section>`;
}

function gameCard(game) {
  const count = state.registry.profiles.filter(p => p.gameId === game.id).length;
  return routeAnchor(`/games/${game.id}`, `<div class="card-top"><div class="card-kicker">Game knowledge</div><span class="count-badge">${count} profile${count === 1 ? '' : 's'}</span></div><h3>${esc(game.name)}</h3><p>${game.actions.length} semantic actions · ${game.controls.length} verified control scheme${game.controls.length === 1 ? '' : 's'}</p><div class="chips">${game.platforms.slice(0, 4).map(chip).join('')}</div><div class="card-footer"><span class="subtle">Explore controls</span><span class="card-arrow">→</span></div>`, 'card');
}

function deviceCard(device) {
  const count = state.registry.profiles.filter(p => p.deviceId === device.id).length;
  return routeAnchor(`/devices/${device.id}`, `<div class="card-top"><div class="card-kicker">${esc(device.manufacturer)}</div><span class="count-badge">${count} profile${count === 1 ? '' : 's'}</span></div><h3>${esc(device.name)}</h3><p>${device.inputs.length} defined adaptive inputs, reusable across the game registry.</p><div class="card-footer"><span class="subtle">View device layer</span><span class="card-arrow">→</span></div>`, 'card');
}

function profileCard(profile) {
  const game = gameById(profile.gameId);
  const device = deviceById(profile.deviceId);
  const status = profile.semanticStatus === 'mapped' ? 'Mapped' : 'Reviewed CSV';
  return routeAnchor(`/profiles/${profile.id}`, `<div class="card-top"><div class="card-kicker">${esc(game?.name || profile.gameId)} · ${esc(pretty(profile.platform))}</div><span class="chip ${profile.semanticStatus === 'mapped' ? 'chip-success' : 'chip-accent'}">${status}</span></div><h3>${esc(profile.title)}</h3><p>${esc(device?.name || profile.deviceId)} · by ${esc(profile.contributor?.displayName || 'Community')}</p><div class="chips">${(profile.tags || []).slice(0, 4).map(chip).join('')}</div><div class="card-footer"><span class="subtle">Open profile</span><span class="card-arrow">→</span></div>`, 'card');
}

function emptyContribution() {
  return `<div class="empty" style="grid-column:1/-1"><h2>No accepted profiles yet</h2><p>The registry structure is live. Add the first public Google Sheet or CSV and it will enter through the same review workflow every future profile uses.</p><button class="button button-primary" type="button" onclick="document.querySelector('#openSubmit').click()">Add the first profile</button></div>`;
}

function renderGames() {
  main.innerHTML = `<div class="page-head"><div class="page-head-copy"><div class="eyebrow">Registry · game layer</div><h1>Games</h1><p>Semantic actions and verified default controls give adaptive profiles a stable meaning beyond raw button names.</p></div></div><div class="grid">${state.registry.games.map(gameCard).join('')}</div>`;
}

function renderDevices() {
  main.innerHTML = `<div class="page-head"><div class="page-head-copy"><div class="eyebrow">Registry · hardware layer</div><h1>Adaptive devices</h1><p>Each device defines its usable inputs once. Profiles can then map game actions onto that shared input vocabulary.</p></div></div><div class="grid">${state.registry.devices.map(deviceCard).join('')}</div>`;
}

function renderProfiles(params = new URLSearchParams()) {
  const query = (params.get('search') || '').toLowerCase();
  main.innerHTML = `<div class="page-head"><div class="page-head-copy"><div class="eyebrow">Registry · community layer</div><h1>Profiles</h1><p>Every accepted layout is reviewable in Git and keeps the exact CSV snapshot QCM will open.</p></div><button class="button button-primary" id="pageSubmit">+ Add profile</button></div>
    <div class="toolbar"><input class="search-input" id="profileSearch" placeholder="Search title, game, device or tag…" value="${attr(params.get('search') || '')}"><select id="gameFilter"><option value="">All games</option>${state.registry.games.map(g => `<option value="${g.id}">${esc(g.name)}</option>`).join('')}</select><select id="deviceFilter"><option value="">All devices</option>${state.registry.devices.map(d => `<option value="${d.id}">${esc(d.name)}</option>`).join('')}</select><select id="platformFilter"><option value="">All platforms</option>${['pc', 'xbox', 'playstation', 'switch'].map(p => `<option value="${p}">${pretty(p)}</option>`).join('')}</select></div>
    <div class="result-summary"><span id="resultCount"></span><span>Public, reviewed registry data</span></div><div id="profileResults"></div>`;
  document.querySelector('#pageSubmit').addEventListener('click', openSubmitDialog);
  const search = document.querySelector('#profileSearch');
  const gf = document.querySelector('#gameFilter');
  const df = document.querySelector('#deviceFilter');
  const pf = document.querySelector('#platformFilter');
  const apply = () => {
    const q = search.value.trim().toLowerCase();
    const rows = state.registry.profiles.filter(p =>
      (!q || [p.title, p.description, p.gameId, p.deviceId, ...(p.tags || [])].some(x => String(x || '').toLowerCase().includes(q))) &&
      (!gf.value || p.gameId === gf.value) && (!df.value || p.deviceId === df.value) && (!pf.value || p.platform === pf.value));
    document.querySelector('#resultCount').textContent = `${rows.length} profile${rows.length === 1 ? '' : 's'}`;
    document.querySelector('#profileResults').innerHTML = rows.length ? `<div class="list">${rows.map(profileRow).join('')}</div>` : `<div class="empty"><h2>No matching profiles</h2><p>Try clearing a filter, or contribute the layout you were looking for.</p><button class="button button-primary" id="emptySubmit">Add profile</button></div>`;
    document.querySelector('#emptySubmit')?.addEventListener('click', openSubmitDialog);
  };
  [search, gf, df, pf].forEach(el => el.addEventListener('input', apply));
  search.value = query;
  apply();
}

function profileRow(p) {
  const status = p.semanticStatus === 'mapped' ? '<span class="chip chip-success">Mapped</span>' : '<span class="chip chip-accent">Reviewed CSV</span>';
  return routeAnchor(`/profiles/${p.id}`, `<div><div class="list-title">${esc(p.title)}</div><div class="list-meta"><span class="subtle">${esc(gameById(p.gameId)?.name || p.gameId)} · ${esc(p.description || 'No description')}</span></div></div><div>${esc(deviceById(p.deviceId)?.name || p.deviceId)}</div><div>${pretty(p.platform)}</div><div>${status}</div>`, 'list-row');
}

function renderGame(id) {
  const game = gameById(id);
  if (!game) return notFound('Game');
  const profiles = state.registry.profiles.filter(p => p.gameId === id);
  const platforms = game.controls.map(c => c.platform);
  const primary = game.controls.find(c => c.platform === 'pc') || game.controls[0];
  main.innerHTML = `<div class="page-head"><div class="page-head-copy"><div class="eyebrow">Game knowledge</div><h1>${esc(game.name)}</h1><p>${game.actions.length} semantic actions · ${profiles.length} adaptive profile${profiles.length === 1 ? '' : 's'} · controls kept separate from community layouts.</p><div class="chips">${game.platforms.map(chip).join('')}</div></div><button class="button button-primary" id="gameSubmit">+ Add profile</button></div>
    <div class="game-layout"><section class="panel"><div class="panel-head"><div><h2>Verified default controls</h2><p>Reference layer for understanding what the game expects.</p></div><select id="controlPlatform">${platforms.map(p => `<option value="${p}" ${p === primary?.platform ? 'selected' : ''}>${pretty(p)}</option>`).join('')}</select></div><div id="controlsTable"></div></section><aside class="panel"><div class="panel-head"><div><h2>Adaptive profiles</h2><p>Community layouts for this game.</p></div><span class="count-badge">${profiles.length}</span></div>${profiles.length ? profiles.map(p => routeAnchor(`/profiles/${p.id}`, `<div><div class="list-title">${esc(p.title)}</div><div class="subtle">${esc(deviceById(p.deviceId)?.name || p.deviceId)} · ${pretty(p.platform)}</div></div>`, 'list-row')).join('') : `<div class="empty" style="border:0;border-radius:0"><p>No profiles yet for this game.</p></div>`}</aside></div>`;
  const renderControls = () => {
    const c = game.controls.find(item => item.platform === document.querySelector('#controlPlatform').value);
    document.querySelector('#controlsTable').innerHTML = c ? `<table class="control-table"><thead><tr><th>Game action</th><th>Default control</th></tr></thead><tbody>${c.bindings.map(b => `<tr><td>${esc(actionName(game, b.action))}</td><td>${esc(b.control)}</td></tr>`).join('')}</tbody></table><div class="subtle" style="padding:13px 16px">Verified source: <a class="link" href="${attr(c.source.url)}" target="_blank" rel="noreferrer">${esc(c.source.title)}</a> · checked ${esc(c.source.verifiedAt)}</div>` : `<div class="empty" style="border:0">No verified default control scheme for this platform yet.</div>`;
  };
  document.querySelector('#controlPlatform').addEventListener('change', renderControls);
  renderControls();
  document.querySelector('#gameSubmit').addEventListener('click', () => {
    document.querySelector('#submitGame').value = id;
    syncPlatforms();
    openSubmitDialog();
  });
}

function renderProfile(id) {
  const p = state.registry.profiles.find(x => x.id === id);
  if (!p) return notFound('Profile');
  const game = gameById(p.gameId);
  const device = deviceById(p.deviceId);
  const controls = game?.controls.find(c => c.platform === p.platform);
  const controlByAction = new Map((controls?.bindings || []).map(x => [x.action, x.control]));
  const sourceCell = p.source.type === 'google-sheet' ? `<a class="link" href="${attr(p.source.url)}" target="_blank" rel="noreferrer">Original Google Sheet ↗</a>` : 'Uploaded CSV';
  main.innerHTML = `
    <section class="profile-hero">
      <div><div class="eyebrow">${esc(game?.name || p.gameId)} · ${pretty(p.platform)}</div><h1>${esc(p.title)}</h1><div class="profile-meta">${esc(device?.name || p.deviceId)} · contributed by ${esc(p.contributor?.displayName || 'Community')} · added ${esc(new Date(p.createdAt).toLocaleDateString())}</div><div class="chips">${(p.tags || []).map(chip).join('')}<span class="chip ${p.semanticStatus === 'mapped' ? 'chip-success' : 'chip-accent'}">${p.semanticStatus === 'mapped' ? 'Semantic mapping' : 'Reviewed CSV'}</span></div></div>
      <div><div class="profile-actions"><button class="button button-primary open-qcm-button" type="button" data-qcm-id="${attr(p.id)}">Open in QCM <span aria-hidden="true">↗</span></button><a class="button" href="${attr(csvHref(p))}" target="_blank" rel="noreferrer">View CSV</a></div><div class="qcm-safe-note"><span class="shield-dot"></span> Opens editor first · never auto-installs</div></div>
    </section>
    <p class="profile-description">${esc(p.description || 'No description was provided for this layout.')}</p>
    <div class="workflow-panel" aria-label="Safe QCM handoff"><div class="workflow-step"><b>STEP 01</b><strong>Resolve registry ID</strong><span>QCM loads the accepted registry entry.</span></div><div class="workflow-step"><b>STEP 02</b><strong>Verify reviewed CSV</strong><span>The downloaded snapshot must match its SHA-256.</span></div><div class="workflow-step"><b>STEP 03</b><strong>Review in QCM</strong><span>You decide whether to save or install it.</span></div></div>
    ${p.semanticStatus === 'unmapped' ? `<div class="notice"><strong>Raw / legacy profile.</strong> This profile's CSV is preserved and can be opened in QCM, but its semantic action mappings have not been curated yet. Adaptive Profiles deliberately does not invent mappings from arbitrary CSV data.</div>` : mappingTable(p, game, device, controlByAction)}
    <section class="section panel"><div class="panel-head"><div><h2>Provenance & integrity</h2><p>Everything QCM needs to prove what it opened.</p></div></div><table class="control-table"><tbody><tr><td>Source</td><td>${sourceCell}</td></tr><tr><td>Reviewed snapshot</td><td><a class="link" href="${attr(csvHref(p))}" target="_blank" rel="noreferrer">profile.csv ↗</a></td></tr><tr><td>SHA-256</td><td><code>${esc(p.snapshot.sha256)}</code></td></tr><tr><td>Registry ID</td><td><code>${esc(p.id)}</code></td></tr><tr><td>QCM link</td><td><code>qcm://profile/${esc(p.id)}</code></td></tr></tbody></table></section>`;
}

function mappingTable(p, game, device, controlByAction) {
  const inputs = new Map((device?.inputs || []).map(i => [i.id, i.name]));
  return `<section class="panel"><div class="panel-head"><div><h2>Control mapping</h2><p>Game meaning → default control → adaptive input.</p></div></div><table class="control-table"><thead><tr><th>Game action</th><th>Default control</th><th>Adaptive input</th></tr></thead><tbody>${p.mappings.map(m => `<tr><td>${esc(actionName(game, m.action))}</td><td>${esc(controlByAction.get(m.action) || '—')}</td><td><span class="mapping-arrow">→</span> ${esc(inputs.get(m.input) || m.input)}</td></tr>`).join('')}</tbody></table></section>`;
}

function renderDevice(id) {
  const d = deviceById(id);
  if (!d) return notFound('Device');
  const profiles = state.registry.profiles.filter(p => p.deviceId === id);
  main.innerHTML = `<div class="page-head"><div class="page-head-copy"><div class="eyebrow">${esc(d.manufacturer)} · adaptive device</div><h1>${esc(d.name)}</h1><p>${d.inputs.length} defined inputs · ${profiles.length} accepted profile${profiles.length === 1 ? '' : 's'} using this device layer.</p></div></div><div class="game-layout"><section class="panel"><div class="panel-head"><div><h2>Defined inputs</h2><p>Stable names profiles can map onto.</p></div></div><table class="control-table"><thead><tr><th>Input</th><th>Type</th></tr></thead><tbody>${d.inputs.map(i => `<tr><td>${esc(i.name)}</td><td>${esc(i.kind)}</td></tr>`).join('')}</tbody></table></section><aside><div class="grid" style="grid-template-columns:1fr">${profiles.length ? profiles.map(profileCard).join('') : `<div class="empty">No accepted profiles for this device yet.</div>`}</div></aside></div>`;
}

function renderDevelopers() {
  main.innerHTML = `<div class="page-head"><div class="page-head-copy"><div class="eyebrow">Public data contract</div><h1>Build on Adaptive Profiles</h1><p>The website and QCM consume the same Git-versioned registry. Read access is public and the canonical data is portable.</p></div><a class="button" href="https://github.com/Bbrizly/Adaptive-Profiles/tree/main/openapi" rel="noreferrer">OpenAPI on GitHub ↗</a></div>
    <div class="game-layout"><section class="panel"><div class="panel-head"><div><h2>Read API</h2><p>Cacheable JSON from the Cloudflare edge.</p></div></div><div style="padding:16px"><pre class="developer-code">GET /api/v1/games
GET /api/v1/profiles?game=minecraft
GET /api/v1/devices
GET /api/v1/search?q=minecraft
GET /api/v1/profiles/:id/csv</pre><p class="subtle">Canonical raw fallback: <a class="link" href="${RAW_FALLBACK}" target="_blank" rel="noreferrer">generated/index.json ↗</a></p></div></section><aside class="panel"><div class="panel-head"><div><h2>Client handoff</h2><p>QCM protocol contract.</p></div></div><div style="padding:16px"><pre class="developer-code">qcm://profile/&lt;registry-id&gt;</pre><p class="subtle">QCM resolves the ID against the public index, downloads the reviewed CSV, checks SHA-256, then opens its normal editor.</p><a class="link" href="${QCM_RELEASES}" rel="noreferrer">QuadStick Config Manager releases →</a></div></aside></div>
    <section class="section panel"><div class="panel-head"><div><h2>Contribution contract</h2><p>Writes are review workflows, not API mutations to canonical data.</p></div></div><table class="control-table"><tbody><tr><td>Read path</td><td>Public API → generated index → canonical Git data</td></tr><tr><td>Profile write path</td><td>Website → validation → GitHub submission branch → pull request → CI → human merge</td></tr><tr><td>After merge</td><td>GitHub Actions deterministically rebuilds <code>generated/index.json</code></td></tr><tr><td>Version boundary</td><td><code>/api/v1</code></td></tr><tr><td>Health data</td><td>Explicitly out of scope for this public repository</td></tr></tbody></table></section>`;
}

function openSubmitDialog() {
  statusEl.textContent = '';
  statusEl.className = 'form-status';
  if (!submitDialog.open) submitDialog.showModal();
}

function populateSubmitForm() {
  document.querySelector('#submitGame').innerHTML = state.registry.games.map(g => `<option value="${g.id}">${esc(g.name)}</option>`).join('');
  document.querySelector('#submitDevice').innerHTML = state.registry.devices.map(d => `<option value="${d.id}">${esc(d.name)}</option>`).join('');
  syncPlatforms();
  syncSourcePicker();
}

function syncPlatforms() {
  const game = gameById(document.querySelector('#submitGame').value) || state.registry.games[0];
  document.querySelector('#submitPlatform').innerHTML = (game?.platforms || []).map(p => `<option value="${p}">${pretty(p)}</option>`).join('');
}

function syncSourcePicker() {
  const source = form.elements.sourceType.value;
  document.querySelector('#googleSource').hidden = source !== 'google-sheet';
  document.querySelector('#csvSource').hidden = source !== 'csv';
  form.elements.googleSheetUrl.required = source === 'google-sheet';
  form.elements.csv.required = source === 'csv';
}

async function initTurnstile() {
  const key = state.config?.turnstileSiteKey;
  if (!key) return;
  await new Promise((resolve, reject) => {
    if (window.turnstile) return resolve();
    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async = true;
    script.defer = true;
    script.onload = resolve;
    script.onerror = reject;
    document.head.append(script);
  });
  state.turnstileWidget = window.turnstile.render('#turnstileMount', { sitekey: key, theme: 'dark' });
}

async function submitProfile(event) {
  event.preventDefault();
  statusEl.textContent = '';
  statusEl.className = 'form-status';
  const button = document.querySelector('#submitButton');
  if (!state.config?.submissionsEnabled) {
    statusEl.innerHTML = IS_GITHUB_PAGES ? 'This is the read-only GitHub Pages preview. Deploy the included Cloudflare Worker to enable one-click submissions.' : 'The submission bridge is not configured yet.';
    statusEl.classList.add('error');
    return;
  }
  const data = new FormData(form);
  if (state.turnstileWidget !== null && window.turnstile) data.set('turnstileToken', window.turnstile.getResponse(state.turnstileWidget));
  button.disabled = true;
  button.textContent = 'Creating review PR…';
  try {
    const result = await safeJson('/api/v1/submissions/profile', { method: 'POST', body: data });
    statusEl.innerHTML = `Created <a class="link" href="${attr(result.data.pullRequest)}" target="_blank" rel="noreferrer">pull request #${Number(result.data.number)} ↗</a>. It is not public registry data until review and merge.`;
    statusEl.classList.add('success');
    form.reset();
    syncPlatforms();
    syncSourcePicker();
    if (state.turnstileWidget !== null && window.turnstile) window.turnstile.reset(state.turnstileWidget);
  } catch (error) {
    statusEl.textContent = error.message;
    statusEl.classList.add('error');
    if (state.turnstileWidget !== null && window.turnstile) window.turnstile.reset(state.turnstileWidget);
  } finally {
    button.disabled = false;
    button.innerHTML = 'Create review PR <span aria-hidden="true">→</span>';
  }
}

function openInQcm(profileId) {
  if (!PROFILE_ID.test(profileId)) return showToast('That profile ID is not valid.');
  state.qcmProfileId = profileId;
  state.qcmLeftPage = false;
  clearTimeout(state.qcmTimer);
  qcmFallback.hidden = true;
  qcmProgress.classList.remove('done');
  document.querySelector('#qcmTitle').textContent = 'Opening QuadStick Config Manager…';
  document.querySelector('#qcmBody').textContent = 'Your browser is handing this profile to QCM. QCM will fetch the exact reviewed CSV snapshot, verify it, and open it in the editor. It will not install anything automatically.';
  if (!qcmDialog.open) qcmDialog.showModal();
  setTimeout(attemptQcmLaunch, 120);
}

function attemptQcmLaunch() {
  if (!state.qcmProfileId) return;
  state.qcmLeftPage = false;
  qcmFallback.hidden = true;
  qcmProgress.classList.remove('done');
  document.querySelector('#qcmTitle').textContent = 'Opening QuadStick Config Manager…';
  document.querySelector('#qcmBody').textContent = 'Waiting for QCM to receive the profile handoff. You remain in control: QCM opens the editor first and never auto-installs from a web link.';
  const deepLink = `qcm://profile/${state.qcmProfileId}`;
  try { location.href = deepLink; } catch {}
  clearTimeout(state.qcmTimer);
  state.qcmTimer = setTimeout(() => {
    if (state.qcmLeftPage) {
      qcmProgress.classList.add('done');
      document.querySelector('#qcmTitle').textContent = 'Profile handed to QCM';
      document.querySelector('#qcmBody').textContent = 'If QCM opened, review the profile there before saving or installing it.';
      setTimeout(() => { if (qcmDialog.open) closeQcmDialog(); }, 900);
      return;
    }
    document.querySelector('#qcmTitle').textContent = 'QCM did not open automatically';
    document.querySelector('#qcmBody').textContent = 'That usually means QCM is not installed, the installed release predates Adaptive Profiles support, or the browser blocked the custom protocol.';
    qcmFallback.hidden = false;
  }, 1450);
}

function noteQcmHandoff() {
  if (!state.qcmProfileId || !qcmDialog.open) return;
  state.qcmLeftPage = true;
}

function closeQcmDialog() {
  clearTimeout(state.qcmTimer);
  state.qcmProfileId = '';
  state.qcmLeftPage = false;
  if (qcmDialog.open) qcmDialog.close();
}

async function copyQcmLink() {
  if (!state.qcmProfileId) return;
  const link = `qcm://profile/${state.qcmProfileId}`;
  try {
    await navigator.clipboard.writeText(link);
    showToast('QCM link copied.');
  } catch {
    showToast(link);
  }
}

function showToast(message) {
  toast.textContent = message;
  toast.hidden = false;
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => { toast.hidden = true; }, 2600);
}

function csvHref(profile) {
  if (IS_GITHUB_PAGES) return `${RAW_ROOT}/data/profiles/${encodeURIComponent(profile.gameId)}/${encodeURIComponent(profile.deviceId)}/${encodeURIComponent(profile.id)}/profile.csv`;
  return `/api/v1/profiles/${encodeURIComponent(profile.id)}/csv`;
}

function gameById(id) { return state.registry.games.find(g => g.id === id); }
function deviceById(id) { return state.registry.devices.find(d => d.id === id); }
function actionName(game, id) { return game?.actions.find(a => a.id === id)?.name || id; }
function chip(text) { return `<span class="chip">${esc(pretty(text))}</span>`; }
function pretty(value) { return String(value || '').replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()).replace(/^Pc$/, 'PC').replace(/^Xbox$/, 'Xbox').replace(/^Playstation$/, 'PlayStation'); }
function notFound(kind) { main.innerHTML = `<div class="empty"><h2>${esc(kind)} not found</h2><p>The registry does not contain that identifier.</p>${routeAnchor('/', 'Back home', 'button')}</div>`; }
function esc(value) { return String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function attr(value) { return esc(value); }
