const RAW_FALLBACK = 'https://raw.githubusercontent.com/Bbrizly/Adaptive-Profiles/main/generated/index.json';
const state = { registry: null, config: null, filters: {}, turnstileWidget: null };
const main = document.querySelector('#content');
const dialog = document.querySelector('#submitDialog');
const form = document.querySelector('#submitForm');
const statusEl = document.querySelector('#submitStatus');

boot();

async function boot() {
  bindGlobalEvents();
  try {
    const [registry, config] = await Promise.all([loadRegistry(), safeJson('/api/v1/config')]);
    state.registry = registry; state.config = config?.data || { submissionsEnabled: false, turnstileSiteKey: '' };
    populateSubmitForm(); await initTurnstile(); render();
  } catch (error) {
    main.innerHTML = `<div class="error-box"><h2>Registry unavailable</h2><p>${esc(error.message)}</p><p>The canonical data is still stored publicly on GitHub.</p></div>`;
  }
}

async function loadRegistry() {
  try { const result = await safeJson('/api/v1/index'); if (result?.data) return result.data; } catch {}
  const response = await fetch(RAW_FALLBACK, { cache: 'no-store' });
  if (!response.ok) throw new Error('Could not load the registry API or GitHub fallback.');
  return response.json();
}
async function safeJson(url, options) { const response = await fetch(url, options); const body = await response.json().catch(() => ({})); if (!response.ok) throw new Error(body.detail || `Request failed (${response.status})`); return body; }

function bindGlobalEvents() {
  document.addEventListener('click', event => {
    const link = event.target.closest('a[data-nav]');
    if (link && link.origin === location.origin) { event.preventDefault(); navigate(link.pathname + link.search); }
  });
  addEventListener('popstate', render);
  document.querySelector('#openSubmit').addEventListener('click', () => { statusEl.textContent = ''; statusEl.className = 'form-status'; dialog.showModal(); });
  dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
  form.addEventListener('submit', submitProfile);
  form.addEventListener('change', event => { if (event.target.name === 'sourceType') syncSourcePicker(); if (event.target.name === 'gameId') syncPlatforms(); });
  const drop = document.querySelector('#dropZone'); const file = document.querySelector('#csvInput');
  for (const type of ['dragenter','dragover']) drop.addEventListener(type, e => { e.preventDefault(); drop.classList.add('dragover'); });
  for (const type of ['dragleave','drop']) drop.addEventListener(type, e => { e.preventDefault(); drop.classList.remove('dragover'); });
  drop.addEventListener('drop', event => { const item = event.dataTransfer.files?.[0]; if (item) { const dt = new DataTransfer(); dt.items.add(item); file.files = dt.files; document.querySelector('#csvName').textContent = item.name; } });
  file.addEventListener('change', () => { document.querySelector('#csvName').textContent = file.files?.[0]?.name || 'or choose a file'; });
}
function navigate(path) { history.pushState({}, '', path); render(); scrollTo({ top: 0, behavior: 'instant' }); }

function render() {
  if (!state.registry) return;
  document.querySelectorAll('.nav a').forEach(a => a.classList.toggle('active', location.pathname.startsWith(a.getAttribute('href'))));
  const path = location.pathname.replace(/\/+$/, '') || '/';
  if (path === '/') return renderHome();
  if (path === '/games') return renderGames();
  if (path === '/profiles') return renderProfiles();
  if (path === '/devices') return renderDevices();
  if (path === '/developers') return renderDevelopers();
  let match = path.match(/^\/games\/([a-z0-9-]+)$/); if (match) return renderGame(match[1]);
  match = path.match(/^\/profiles\/([a-z0-9-]+)$/); if (match) return renderProfile(match[1]);
  match = path.match(/^\/devices\/([a-z0-9-]+)$/); if (match) return renderDevice(match[1]);
  main.innerHTML = `<div class="empty"><h2>Page not found</h2><p>That route does not exist.</p><a class="button" href="/" data-nav>Back home</a></div>`;
}

function renderHome() {
  const { games, devices, profiles } = state.registry;
  main.innerHTML = `
    <section class="hero">
      <div class="hero-main"><div class="eyebrow">Adaptive gaming, organized</div><h1>Find controls that work for you.</h1><p>Browse versioned adaptive profiles without digging through forum posts and mystery spreadsheets. Game controls stay separate from adaptive layouts, so the data remains useful across devices and platforms.</p><form class="hero-search" id="homeSearch"><input name="q" aria-label="Search games and profiles" placeholder="Search a game, profile or device…"><button class="button button-primary">Search</button></form></div>
      <aside class="stats-panel" aria-label="Registry stats"><div class="stat"><strong>${games.length}</strong><span>games</span></div><div class="stat"><strong>${profiles.length}</strong><span>profiles</span></div><div class="stat"><strong>${devices.length}</strong><span>devices</span></div><div class="stat"><strong>Git</strong><span>versioned source</span></div></aside>
    </section>
    ${section('Games', 'Default controls and adaptive profiles are kept as separate layers.', games.map(gameCard).join(''), '/games')}
    ${section('Latest profiles', 'Community layouts accepted into the public registry.', profiles.length ? profiles.slice(-8).reverse().map(profileCard).join('') : `<div class="empty">No community profiles yet. Use <strong>Add profile</strong> to create the first reviewable submission.</div>`, '/profiles')}
    ${section('Adaptive devices', 'Device inputs are defined once and reused across every game.', devices.map(deviceCard).join(''), '/devices')}`;
  document.querySelector('#homeSearch').addEventListener('submit', event => { event.preventDefault(); const q = new FormData(event.currentTarget).get('q'); navigate(`/profiles?search=${encodeURIComponent(String(q || ''))}`); });
}
function section(title, subtitle, body, href) { return `<section class="section"><div class="section-head"><div><h2>${esc(title)}</h2><p>${esc(subtitle)}</p></div><a class="link" href="${href}" data-nav>View all →</a></div><div class="grid">${body}</div></section>`; }
function gameCard(game) { const count = state.registry.profiles.filter(p => p.gameId === game.id).length; return `<a class="card" href="/games/${game.id}" data-nav><div class="card-kicker">${count} profile${count===1?'':'s'}</div><h3>${esc(game.name)}</h3><p>${game.actions.length} semantic actions · ${game.controls.length} verified control scheme${game.controls.length===1?'':'s'}</p><div class="chips">${game.platforms.map(p=>chip(p)).join('')}</div></a>`; }
function deviceCard(device) { const count = state.registry.profiles.filter(p => p.deviceId === device.id).length; return `<a class="card" href="/devices/${device.id}" data-nav><div class="card-kicker">${esc(device.manufacturer)}</div><h3>${esc(device.name)}</h3><p>${device.inputs.length} defined inputs · ${count} community profile${count===1?'':'s'}</p></a>`; }
function profileCard(profile) { const game = gameById(profile.gameId); const device = deviceById(profile.deviceId); return `<a class="card" href="/profiles/${profile.id}" data-nav><div class="card-kicker">${esc(game?.name || profile.gameId)} · ${esc(pretty(profile.platform))}</div><h3>${esc(profile.title)}</h3><p>${esc(device?.name || profile.deviceId)} · ${profile.semanticStatus === 'mapped' ? 'Semantic mapping' : 'CSV snapshot'}</p><div class="chips">${profile.tags.map(chip).join('')}</div></a>`; }

function renderGames() { main.innerHTML = `<div class="page-head"><div><div class="eyebrow">Registry</div><h1>Games</h1><p>Game actions and default controls exist independently from community profiles.</p></div></div><div class="grid">${state.registry.games.map(gameCard).join('')}</div>`; }
function renderDevices() { main.innerHTML = `<div class="page-head"><div><div class="eyebrow">Hardware layer</div><h1>Adaptive devices</h1><p>Inputs and capabilities are reusable across the entire game catalog.</p></div></div><div class="grid">${state.registry.devices.map(deviceCard).join('')}</div>`; }

function renderProfiles() {
  const params = new URLSearchParams(location.search); const query = (params.get('search') || '').toLowerCase();
  main.innerHTML = `<div class="page-head"><div><div class="eyebrow">Community registry</div><h1>Profiles</h1><p>Accepted layouts are permanently versioned through Git.</p></div><button class="button button-primary" id="pageSubmit">Add profile</button></div>
  <div class="toolbar"><input class="search-input" id="profileSearch" placeholder="Search profiles…" value="${attr(params.get('search') || '')}"><select id="gameFilter"><option value="">All games</option>${state.registry.games.map(g=>`<option value="${g.id}">${esc(g.name)}</option>`).join('')}</select><select id="deviceFilter"><option value="">All devices</option>${state.registry.devices.map(d=>`<option value="${d.id}">${esc(d.name)}</option>`).join('')}</select><select id="platformFilter"><option value="">All platforms</option>${['pc','xbox','playstation','switch'].map(p=>`<option value="${p}">${pretty(p)}</option>`).join('')}</select></div><div id="profileResults"></div>`;
  document.querySelector('#pageSubmit').addEventListener('click',()=>dialog.showModal());
  const search = document.querySelector('#profileSearch'), gf=document.querySelector('#gameFilter'), df=document.querySelector('#deviceFilter'), pf=document.querySelector('#platformFilter');
  const apply = () => { const q=search.value.trim().toLowerCase(); const rows=state.registry.profiles.filter(p=>(!q||[p.title,p.description,p.gameId,p.deviceId,...p.tags].some(x=>String(x).toLowerCase().includes(q)))&&(!gf.value||p.gameId===gf.value)&&(!df.value||p.deviceId===df.value)&&(!pf.value||p.platform===pf.value)); document.querySelector('#profileResults').innerHTML = rows.length ? `<div class="list">${rows.map(profileRow).join('')}</div>` : `<div class="empty">No profiles match those filters.</div>`; };
  [search,gf,df,pf].forEach(el=>el.addEventListener('input',apply)); search.value=query; apply();
}
function profileRow(p){return `<a class="list-row" href="/profiles/${p.id}" data-nav><div><div class="list-title">${esc(p.title)}</div><div class="subtle">${esc(gameById(p.gameId)?.name||p.gameId)} · ${esc(p.description||'No description')}</div></div><div>${esc(deviceById(p.deviceId)?.name||p.deviceId)}</div><div>${pretty(p.platform)}</div><div class="subtle">${p.semanticStatus}</div></a>`}

function renderGame(id) {
  const game = gameById(id); if (!game) return notFound('Game'); const profiles = state.registry.profiles.filter(p=>p.gameId===id);
  const platforms = game.controls.map(c=>c.platform); const primary = game.controls.find(c=>c.platform==='pc') || game.controls[0];
  main.innerHTML = `<div class="page-head"><div><div class="eyebrow">Game</div><h1>${esc(game.name)}</h1><p>${game.actions.length} semantic actions · ${profiles.length} adaptive profile${profiles.length===1?'':'s'}</p><div class="chips">${game.platforms.map(chip).join('')}</div></div><button class="button button-primary" id="gameSubmit">Add profile</button></div>
  <div class="game-layout"><section class="panel"><div class="panel-head"><h2>Default controls</h2><select id="controlPlatform">${platforms.map(p=>`<option value="${p}" ${p===primary?.platform?'selected':''}>${pretty(p)}</option>`).join('')}</select></div><div id="controlsTable"></div></section><aside class="panel"><div class="panel-head"><h2>Profiles</h2><span class="subtle">${profiles.length}</span></div>${profiles.length?profiles.map(p=>`<a class="list-row" style="grid-template-columns:1fr" href="/profiles/${p.id}" data-nav><div><div class="list-title">${esc(p.title)}</div><div class="subtle">${esc(deviceById(p.deviceId)?.name||p.deviceId)} · ${pretty(p.platform)}</div></div></a>`).join(''):`<div class="empty" style="border:0;border-radius:0">No profiles yet for this game.</div>`}</aside></div>`;
  const renderControls=()=>{const c=game.controls.find(c=>c.platform===document.querySelector('#controlPlatform').value);document.querySelector('#controlsTable').innerHTML=c?`<table class="control-table"><thead><tr><th>Game action</th><th>Default control</th></tr></thead><tbody>${c.bindings.map(b=>`<tr><td>${esc(actionName(game,b.action))}</td><td>${esc(b.control)}</td></tr>`).join('')}</tbody></table><div class="subtle" style="padding:12px 16px">Verified source: <a class="link" href="${attr(c.source.url)}" rel="noreferrer">${esc(c.source.title)}</a> · ${esc(c.source.verifiedAt)}</div>`:`<div class="empty" style="border:0">No verified default control scheme for this platform yet.</div>`};
  document.querySelector('#controlPlatform').addEventListener('change',renderControls); renderControls(); document.querySelector('#gameSubmit').addEventListener('click',()=>{document.querySelector('#submitGame').value=id;syncPlatforms();dialog.showModal()});
}

function renderProfile(id) {
  const p = state.registry.profiles.find(x=>x.id===id); if(!p)return notFound('Profile'); const game=gameById(p.gameId), device=deviceById(p.deviceId), controls=game?.controls.find(c=>c.platform===p.platform); const controlByAction=new Map((controls?.bindings||[]).map(x=>[x.action,x.control]));
  main.innerHTML=`<section class="profile-hero"><div><div class="eyebrow">${esc(game?.name||p.gameId)} · ${pretty(p.platform)}</div><h1>${esc(p.title)}</h1><div class="profile-meta">${esc(device?.name||p.deviceId)} · by ${esc(p.contributor.displayName)} · added ${esc(new Date(p.createdAt).toLocaleDateString())}</div><div class="chips">${p.tags.map(chip).join('')}</div></div><div class="profile-actions"><a class="button button-primary" href="qcm://profile/${p.id}">Open in QCM</a><a class="button" href="/api/v1/profiles/${p.id}/csv">CSV snapshot</a></div></section><p>${esc(p.description||'No description provided.')}</p>${p.semanticStatus==='unmapped'?`<div class="notice"><strong>Legacy/raw profile.</strong> The CSV is preserved and installable, but semantic action mappings have not been curated yet. We do not guess them from arbitrary CSV data.</div>`:mappingTable(p,game,device,controlByAction)}<section class="section panel"><div class="panel-head"><h2>Provenance</h2></div><table class="control-table"><tbody><tr><td>Source</td><td>${p.source.type==='google-sheet'?`<a class="link" href="${attr(p.source.url)}" rel="noreferrer">Google Sheet</a>`:'Uploaded CSV'}</td></tr><tr><td>Snapshot SHA-256</td><td><code>${esc(p.snapshot.sha256)}</code></td></tr><tr><td>Registry ID</td><td><code>${esc(p.id)}</code></td></tr></tbody></table></section>`;
}
function mappingTable(p,game,device,controlByAction){const inputs=new Map(device.inputs.map(i=>[i.id,i.name]));return `<section class="panel"><div class="panel-head"><h2>Control mapping</h2></div><table class="control-table"><thead><tr><th>Game action</th><th>Default control</th><th>Adaptive input</th></tr></thead><tbody>${p.mappings.map(m=>`<tr><td>${esc(actionName(game,m.action))}</td><td>${esc(controlByAction.get(m.action)||'—')}</td><td><span class="mapping-arrow">→</span> ${esc(inputs.get(m.input)||m.input)}</td></tr>`).join('')}</tbody></table></section>`}
function renderDevice(id){const d=deviceById(id);if(!d)return notFound('Device');const profiles=state.registry.profiles.filter(p=>p.deviceId===id);main.innerHTML=`<div class="page-head"><div><div class="eyebrow">${esc(d.manufacturer)}</div><h1>${esc(d.name)}</h1><p>${d.inputs.length} inputs · ${profiles.length} profile${profiles.length===1?'':'s'}</p></div></div><div class="game-layout"><section class="panel"><div class="panel-head"><h2>Defined inputs</h2></div><table class="control-table"><thead><tr><th>Input</th><th>Type</th></tr></thead><tbody>${d.inputs.map(i=>`<tr><td>${esc(i.name)}</td><td>${esc(i.kind)}</td></tr>`).join('')}</tbody></table></section><aside><div class="grid" style="grid-template-columns:1fr">${profiles.length?profiles.map(profileCard).join(''):`<div class="empty">No accepted profiles for this device yet.</div>`}</div></aside></div>`}
function renderDevelopers(){main.innerHTML=`<div class="page-head"><div><div class="eyebrow">Public API</div><h1>Build on Adaptive Profiles</h1><p>The website and QCM use the same versioned registry. Read access is public.</p></div></div><section class="panel"><div class="panel-head"><h2>Quick start</h2></div><div style="padding:16px"><pre class="developer-code">GET ${location.origin}/api/v1/games
GET ${location.origin}/api/v1/profiles?game=minecraft
GET ${location.origin}/api/v1/devices
GET ${location.origin}/api/v1/search?q=minecraft</pre><p class="subtle">Canonical fallback: ${RAW_FALLBACK}</p></div></section><section class="section panel"><div class="panel-head"><h2>Contract</h2></div><table class="control-table"><tbody><tr><td>Read API</td><td>Public, cacheable JSON</td></tr><tr><td>Write path</td><td>Structured website submission → GitHub pull request</td></tr><tr><td>Version boundary</td><td><code>/api/v1</code></td></tr><tr><td>Canonical data</td><td>Public Git repository</td></tr></tbody></table></section>`}

function populateSubmitForm(){document.querySelector('#submitGame').innerHTML=state.registry.games.map(g=>`<option value="${g.id}">${esc(g.name)}</option>`).join('');document.querySelector('#submitDevice').innerHTML=state.registry.devices.map(d=>`<option value="${d.id}">${esc(d.name)}</option>`).join('');syncPlatforms();syncSourcePicker()}
function syncPlatforms(){const game=gameById(document.querySelector('#submitGame').value)||state.registry.games[0];document.querySelector('#submitPlatform').innerHTML=(game?.platforms||[]).map(p=>`<option value="${p}">${pretty(p)}</option>`).join('')}
function syncSourcePicker(){const source=form.elements.sourceType.value;document.querySelector('#googleSource').hidden=source!=='google-sheet';document.querySelector('#csvSource').hidden=source!=='csv';form.elements.googleSheetUrl.required=source==='google-sheet';form.elements.csv.required=source==='csv'}
async function initTurnstile(){const key=state.config?.turnstileSiteKey;if(!key)return;await new Promise((resolve,reject)=>{if(window.turnstile)return resolve();const script=document.createElement('script');script.src='https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';script.async=true;script.defer=true;script.onload=resolve;script.onerror=reject;document.head.append(script)});state.turnstileWidget=window.turnstile.render('#turnstileMount',{sitekey:key,theme:'dark'})}
async function submitProfile(event){event.preventDefault();statusEl.textContent='';statusEl.className='form-status';const button=document.querySelector('#submitButton');if(!state.config?.submissionsEnabled){statusEl.textContent='Submission bridge is not configured yet.';statusEl.classList.add('error');return}const data=new FormData(form);if(state.turnstileWidget!==null&&window.turnstile)data.set('turnstileToken',window.turnstile.getResponse(state.turnstileWidget));button.disabled=true;button.textContent='Creating pull request…';try{const result=await safeJson('/api/v1/submissions/profile',{method:'POST',body:data});statusEl.innerHTML=`Submission created: <a class="link" href="${attr(result.data.pullRequest)}" rel="noreferrer">pull request #${Number(result.data.number)}</a>`;statusEl.classList.add('success');form.reset();syncPlatforms();syncSourcePicker();if(state.turnstileWidget!==null&&window.turnstile)window.turnstile.reset(state.turnstileWidget)}catch(error){statusEl.textContent=error.message;statusEl.classList.add('error');if(state.turnstileWidget!==null&&window.turnstile)window.turnstile.reset(state.turnstileWidget)}finally{button.disabled=false;button.textContent='Create submission PR'}}

function gameById(id){return state.registry.games.find(g=>g.id===id)}function deviceById(id){return state.registry.devices.find(d=>d.id===id)}function actionName(game,id){return game?.actions.find(a=>a.id===id)?.name||id}function chip(text){return `<span class="chip">${esc(pretty(text))}</span>`}function pretty(value){return String(value||'').replace(/-/g,' ').replace(/\b\w/g,c=>c.toUpperCase()).replace(/^Pc$/,'PC').replace(/^Xbox$/,'Xbox').replace(/^Playstation$/,'PlayStation')}
function notFound(kind){main.innerHTML=`<div class="empty"><h2>${esc(kind)} not found</h2><p>The registry does not contain that identifier.</p></div>`}
function esc(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}function attr(value){return esc(value)}
