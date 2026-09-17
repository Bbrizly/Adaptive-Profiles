const RAW_CACHE_SECONDS = 60;
const MAX_CSV_BYTES = 128 * 1024;
const API = '/api/v1';
const API_V2 = '/api/v2';
const PLATFORMS = new Set(['pc', 'xbox', 'playstation', 'switch']);

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders() });
    if (!url.pathname.startsWith(API) && !url.pathname.startsWith(API_V2)) return problem(404, 'Not found', 'Unknown API version.');

    try {
      if (request.method === 'GET') return await handleRead(env, url);
      if (request.method === 'POST' && url.pathname === `${API}/submissions/profile`) return await submitProfile(request, env);
      if (request.method === 'POST' && url.pathname === `${API_V2}/submissions/profiles`) return await submitProfile(request, env, true);
      if (request.method === 'POST' && url.pathname.match(new RegExp(`^${API_V2}/profiles/[a-z0-9-]+/proposals$`))) return await proposeProfileUpdate(request, env);
      return problem(405, 'Method not allowed', 'This route does not support that method.');
    } catch (error) {
      if (error instanceof RequestError) return problem(error.status, error.title, error.detail);
      console.error('request_failed', { path: url.pathname, message: error?.message });
      return problem(500, 'Internal server error', 'The request could not be completed.');
    }
  }
};

async function handleRead(env, url) {
  if (url.pathname.startsWith(API_V2)) return handleReadV2(env, url);
  if (url.pathname === `${API}/health`) return json({ data: { ok: true, source: repoName(env), branch: env.GITHUB_BRANCH || 'main' } }, 200, 30);
  if (url.pathname === `${API}/config`) return json({ data: { repository: repoName(env), turnstileSiteKey: env.TURNSTILE_SITE_KEY || '', submissionsEnabled: Boolean(githubToken(env)) } }, 200, 60);

  const index = await fetchIndex(env);
  if (url.pathname === `${API}/index`) return json({ data: index }, 200, 60);
  if (url.pathname === `${API}/games`) return json({ data: index.games }, 200, 60);
  if (url.pathname === `${API}/devices`) return json({ data: index.devices }, 200, 60);
  if (url.pathname === `${API}/profiles`) {
    let profiles = index.profiles;
    for (const [query, field] of [['game','gameId'], ['device','deviceId'], ['platform','platform']]) {
      const value = url.searchParams.get(query);
      if (value) profiles = profiles.filter(profile => profile[field] === value);
    }
    return json({ data: profiles }, 200, 60);
  }
  if (url.pathname === `${API}/search`) {
    const q = (url.searchParams.get('q') || '').trim().toLowerCase().slice(0, 100);
    if (!q) return json({ data: { games: [], devices: [], profiles: [] } }, 200, 30);
    const contains = (...values) => values.flat().filter(Boolean).some(value => String(value).toLowerCase().includes(q));
    return json({ data: {
      games: index.games.filter(g => contains(g.name, g.id, g.aliases)),
      devices: index.devices.filter(d => contains(d.name, d.id, d.manufacturer)),
      profiles: index.profiles.filter(p => contains(p.title, p.description, p.id, p.gameId, p.deviceId, p.tags))
    } }, 200, 30);
  }

  const gameId = routeId(url.pathname, `${API}/games/`);
  if (gameId) {
    const game = index.games.find(item => item.id === gameId);
    return game ? json({ data: { ...game, profiles: index.profiles.filter(p => p.gameId === game.id) } }, 200, 60) : problem(404, 'Game not found', 'No game has that id.');
  }
  const deviceId = routeId(url.pathname, `${API}/devices/`);
  if (deviceId) {
    const device = index.devices.find(item => item.id === deviceId);
    return device ? json({ data: { ...device, profiles: index.profiles.filter(p => p.deviceId === device.id) } }, 200, 60) : problem(404, 'Device not found', 'No device has that id.');
  }

  const csvMatch = url.pathname.match(/^\/api\/v1\/profiles\/([a-z0-9-]+)\/csv$/);
  if (csvMatch) {
    const profile = index.profiles.find(item => item.id === csvMatch[1]);
    if (!profile) return problem(404, 'Profile not found', 'No profile has that id.');
    const response = await fetch(rawUrl(env, profilePath(profile, 'profile.csv')), { cf: { cacheEverything: true, cacheTtl: RAW_CACHE_SECONDS } });
    if (!response.ok) return problem(502, 'Profile snapshot unavailable', 'The CSV snapshot could not be read from the registry.');
    return new Response(response.body, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `inline; filename="${profile.id}.csv"`, 'Cache-Control': 'public, max-age=60', ...corsHeaders(), ...securityHeaders() } });
  }
  const profileId = routeId(url.pathname, `${API}/profiles/`);
  if (profileId) {
    const profile = index.profiles.find(item => item.id === profileId);
    return profile ? json({ data: { ...profile, links: { csv: `${API}/profiles/${profile.id}/csv`, qcm: `qcm://profile/${profile.id}` } } }, 200, 60) : problem(404, 'Profile not found', 'No profile has that id.');
  }
  return problem(404, 'Not found', 'Unknown API route.');
}

async function handleReadV2(env, url) {
  const index = await fetchIndexV2(env);
  if (url.pathname === `${API_V2}/index`) return json({ data: index }, 200, 60);
  if (url.pathname === `${API_V2}/targets`) return json({ data: index.targets }, 200, 60);
  if (url.pathname === `${API_V2}/games`) return json({ data: index.targets.filter(target => target.kind === 'game') }, 200, 60);
  if (url.pathname === `${API_V2}/software`) return json({ data: index.targets.filter(target => target.kind === 'software') }, 200, 60);
  if (url.pathname === `${API_V2}/devices`) return json({ data: index.devices }, 200, 60);
  if (url.pathname === `${API_V2}/profiles`) {
    let profiles = index.profiles;
    for (const [query, getter] of [['target', p => p.target.id], ['device', p => p.deviceId], ['platform', p => p.platform], ['kind', p => p.target.kind]]) { const value = url.searchParams.get(query); if (value) profiles = profiles.filter(getter && value ? p => getter(p) === value : () => true); }
    return json({ data: profiles }, 200, 60);
  }
  if (url.pathname === `${API_V2}/search`) {
    const q = (url.searchParams.get('q') || '').trim().toLowerCase().slice(0, 100);
    const contains = (...values) => values.flat().filter(Boolean).some(value => String(value).toLowerCase().includes(q));
    return json({ data: q ? { targets: index.targets.filter(t => contains(t.name, t.id, t.aliases, t.categories)), devices: index.devices.filter(d => contains(d.name, d.id, d.manufacturer)), profiles: index.profiles.filter(p => contains(p.title, p.description, p.id, p.tags, p.contributor?.displayName, p.target.id, p.deviceId)) } : { targets: [], devices: [], profiles: [] } }, 200, 30);
  }
  const targetId = routeId(url.pathname, `${API_V2}/targets/`);
  if (targetId) { const target = index.targets.find(item => item.id === targetId); return target ? json({ data: { ...target, profiles: index.profiles.filter(p => p.target.id === target.id) } }, 200, 60) : problem(404, 'Target not found', 'No target has that id.'); }
  const gameId = routeId(url.pathname, `${API_V2}/games/`);
  if (gameId) { const target = index.targets.find(item => item.id === gameId && item.kind === 'game'); return target ? json({ data: { ...target, profiles: index.profiles.filter(p => p.target.id === target.id) } }, 200, 60) : problem(404, 'Game not found', 'No game has that id.'); }
  const softwareId = routeId(url.pathname, `${API_V2}/software/`);
  if (softwareId) { const target = index.targets.find(item => item.id === softwareId && item.kind === 'software'); return target ? json({ data: { ...target, profiles: index.profiles.filter(p => p.target.id === target.id) } }, 200, 60) : problem(404, 'Software not found', 'No software target has that id.'); }
  const deviceId = routeId(url.pathname, `${API_V2}/devices/`);
  if (deviceId) { const device = index.devices.find(item => item.id === deviceId); return device ? json({ data: { ...device, profiles: index.profiles.filter(p => p.deviceId === device.id) } }, 200, 60) : problem(404, 'Device not found', 'No device has that id.'); }
  const csvMatch = url.pathname.match(/^\/api\/v2\/profiles\/([a-z0-9-]+)\/csv$/);
  if (csvMatch) { const profile = index.profiles.find(item => item.id === csvMatch[1]); if (!profile) return problem(404, 'Profile not found', 'No profile has that id.'); const response = await fetch(rawUrl(env, profilePath(profile, 'profile.csv')), { cf: { cacheEverything: true, cacheTtl: RAW_CACHE_SECONDS } }); if (!response.ok) return problem(502, 'Profile snapshot unavailable', 'The CSV snapshot could not be read from the registry.'); return new Response(response.body, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `inline; filename="${profile.id}.csv"`, 'Cache-Control': 'public, max-age=60', ...corsHeaders(), ...securityHeaders() } }); }
  const profileId = routeId(url.pathname, `${API_V2}/profiles/`); if (profileId) { const profile = index.profiles.find(item => item.id === profileId); return profile ? json({ data: { ...profile, links: { csv: `${API_V2}/profiles/${profile.id}/csv`, qcm: `qcm://profile/${profile.id}` } } }, 200, 60) : problem(404, 'Profile not found', 'No profile has that id.'); }
  return problem(404, 'Not found', 'Unknown API route.');
}

async function submitProfile(request, env, v2 = false) {
  if (!githubToken(env)) throw new RequestError(503, 'Submissions unavailable', 'The submission bridge has not been configured yet.');
  if (!submissionOriginAllowed(request, env)) throw new RequestError(403, 'Forbidden', 'Profile submissions must originate from the Adaptive Profiles website.');
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('multipart/form-data')) throw new RequestError(415, 'Unsupported media type', 'Use multipart/form-data.');

  if (env.SUBMISSION_RATE_LIMITER) {
    const actor = request.headers.get('cf-connecting-ip') || 'anonymous';
    const { success } = await env.SUBMISSION_RATE_LIMITER.limit({ key: `profile:${actor}` });
    if (!success) throw new RequestError(429, 'Too many submissions', 'Please try again later.');
  }

  const form = await request.formData();
  if (!(await verifyTurnstile(String(form.get('turnstileToken') || ''), request, env))) throw new RequestError(403, 'Verification failed', 'Human verification failed.');

  const gameId = requiredField(form, v2 ? 'targetId' : 'gameId', 80);
  const deviceId = requiredField(form, 'deviceId', 80);
  const platform = requiredField(form, 'platform', 40);
  const title = requiredField(form, 'title', 100);
  const description = optionalField(form, 'description', 500);
  const displayName = requiredField(form, 'displayName', 60);
  const github = optionalField(form, 'github', 39);
  const sourceType = requiredField(form, 'sourceType', 20);

  if (!slugOk(gameId) || !slugOk(deviceId)) throw new RequestError(422, 'Invalid profile', 'Game or device id is malformed.');
  if (!PLATFORMS.has(platform)) throw new RequestError(422, 'Invalid profile', 'Unsupported platform.');
  if (github && !/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(github)) throw new RequestError(422, 'Invalid profile', 'GitHub username is malformed.');

  const index = v2 ? await fetchIndexV2(env, true) : await fetchIndex(env, true);
  const target = v2 ? index.targets.find(item => item.id === gameId) : index.games.find(item => item.id === gameId);
  const device = index.devices.find(d => d.id === deviceId);
  if (!target || !device) throw new RequestError(422, 'Invalid profile', 'Choose a known game/software target and adaptive device.');
  if (!target.platforms.includes(platform)) throw new RequestError(422, 'Invalid profile', 'That target does not list the selected platform.');

  const tags = [...new Set(optionalField(form, 'tags', 200).split(',').map(slugify).filter(Boolean))].slice(0, 10);
  const id = [gameId, platform, deviceId, slugify(title).slice(0, 48), crypto.randomUUID().replaceAll('-', '').slice(0, 8)].filter(Boolean).join('--');
  if (!slugOk(id) || id.length > 190) throw new RequestError(422, 'Invalid profile', 'The generated profile id is invalid.');
  if (index.profiles.some(p => p.id === id)) throw new RequestError(409, 'Profile already exists', 'A profile with the same target, platform, device and title already exists.');

  const imported = await importSource(form, sourceType);
  const csvError = validateCsvText(imported.csvText);
  if (csvError) throw new RequestError(422, 'Invalid CSV', csvError);

  const profile = {
    schemaVersion: v2 ? 2 : 1,
    id,
    title,
    description,
    ...(v2 ? { target: { kind: target.kind, id: gameId } } : { gameId }),
    platform,
    deviceId,
    semanticStatus: 'unmapped',
    mappings: [],
    tags,
    contributor: { displayName, ...(github ? { github } : {}) },
    source: imported.source,
    snapshot: { file: 'profile.csv', sha256: await sha256Hex(imported.csvText) },
    revision: v2 ? 1 : undefined,
    createdAt: new Date().toISOString(),
    ...(v2 ? { updatedAt: new Date().toISOString() } : {})
  };

  const pull = await createSubmissionPullRequest(env, profile, imported.csvText);
  return json({ data: { profileId: id, pullRequest: pull.html_url, number: pull.number } }, 201, 0, false);
}

async function proposeProfileUpdate(request, env) {
  if (!githubToken(env)) throw new RequestError(503, 'Submissions unavailable', 'The submission bridge has not been configured yet.');
  if (!submissionOriginAllowed(request, env)) throw new RequestError(403, 'Forbidden', 'Profile proposals must originate from the Adaptive Profiles website.');
  const proposalPath = new URL(request.url).pathname.match(/^\/api\/v2\/profiles\/([a-z0-9-]+)\/proposals$/); const profileId = proposalPath?.[1] || ''; const body = await request.json().catch(() => null);
  if (!profileId || !body || body.profileId !== profileId || !Number.isInteger(body.expectedRevision) || !/^[a-f0-9]{64}$/.test(body.expectedSnapshotSha256 || '') || !String(body.reason || '').trim()) throw new RequestError(422, 'Invalid proposal', 'A profile id, expected revision, snapshot hash, and reason are required.');
  const index = await fetchIndexV2(env, true); const profile = index.profiles.find(item => item.id === profileId); if (!profile) throw new RequestError(404, 'Profile not found', 'No profile has that id.');
  if (profile.revision !== body.expectedRevision || profile.snapshot.sha256 !== body.expectedSnapshotSha256) throw new RequestError(409, 'Stale profile', 'This profile changed while the proposal form was open. Reload and try again.');
  const allowed = ['title', 'description', 'tags', 'mappings', 'source', 'platform']; const changes = body.changes && typeof body.changes === 'object' ? Object.fromEntries(Object.entries(body.changes).filter(([key]) => allowed.includes(key))) : {};
  const pull = await createProposalPullRequest(env, profile, { ...body, changes }); return json({ data: { profileId, pullRequest: pull.html_url, number: pull.number } }, 201, 0, false);
}

async function importSource(form, sourceType) {
  if (sourceType === 'google-sheet') {
    const parsed = parseGoogleSheet(optionalField(form, 'googleSheetUrl', 600));
    if (!parsed) throw new RequestError(422, 'Invalid Google Sheet', 'Paste a public docs.google.com spreadsheet URL.');
    const exportUrl = `https://docs.google.com/spreadsheets/d/${parsed.sheetId}/export?format=csv&gid=${encodeURIComponent(parsed.gid)}`;
    const response = await fetch(exportUrl, { redirect: 'follow' });
    if (!response.ok) throw new RequestError(422, 'Google Sheet unavailable', 'The spreadsheet could not be exported. Make sure it is public and the selected sheet exists.');
    let csvText;
    try { csvText = await readTextLimited(response, MAX_CSV_BYTES); }
    catch { throw new RequestError(413, 'Google Sheet too large', 'The exported sheet must be 128 KiB or smaller.'); }
    return { csvText, source: { type: 'google-sheet', url: `https://docs.google.com/spreadsheets/d/${parsed.sheetId}/edit#gid=${parsed.gid}` } };
  }
  if (sourceType === 'csv') {
    const file = form.get('csv');
    if (!file || typeof file.arrayBuffer !== 'function' || !String(file.name || '').toLowerCase().endsWith('.csv')) throw new RequestError(422, 'CSV required', 'Choose a .csv file.');
    if (file.size < 1 || file.size > MAX_CSV_BYTES) throw new RequestError(413, 'CSV size invalid', 'CSV files must be between 1 byte and 128 KiB.');
    return { csvText: decodeUtf8(await file.arrayBuffer()), source: { type: 'csv' } };
  }
  throw new RequestError(422, 'Invalid source', 'Choose Google Sheet or CSV.');
}

async function fetchIndex(env, bypassCache = false) {
  const response = await fetch(rawUrl(env, 'generated/index.json'), {
    headers: { Accept: 'application/json' },
    cf: bypassCache ? { cacheTtl: 0, cacheEverything: false } : { cacheTtl: RAW_CACHE_SECONDS, cacheEverything: true }
  });
  if (!response.ok) throw new Error(`registry index fetch failed: ${response.status}`);
  const data = await response.json();
  if (data?.schemaVersion !== 1 || !Array.isArray(data.games) || !Array.isArray(data.devices) || !Array.isArray(data.profiles)) throw new Error('registry index shape invalid');
  return data;
}

async function fetchIndexV2(env, bypassCache = false) {
  try {
    const response = await fetch(rawUrl(env, 'generated/index.v2.json'), { headers: { Accept: 'application/json' }, cf: bypassCache ? { cacheTtl: 0, cacheEverything: false } : { cacheTtl: RAW_CACHE_SECONDS, cacheEverything: true } });
    if (response.ok) { const data = await response.json(); if (data?.schemaVersion === 2 && Array.isArray(data.targets) && Array.isArray(data.devices) && Array.isArray(data.profiles)) return data; }
  } catch {}
  const legacy = await fetchIndex(env, bypassCache);
  return { schemaVersion: 2, targets: legacy.games.map(game => ({ schemaVersion: 2, ...game, kind: 'game', categories: ['gaming'] })), devices: legacy.devices.map(device => ({ schemaVersion: 2, ...device })), profiles: legacy.profiles.map(profile => ({ schemaVersion: 2, ...profile, target: { kind: 'game', id: profile.gameId }, revision: profile.revision || 1, updatedAt: profile.updatedAt || profile.createdAt })) };
}

async function createSubmissionPullRequest(env, profile, csvText) {
  const { owner, repo, base } = registryConfig(env);
  const ref = await githubApi(env, `/repos/${owner}/${repo}/git/ref/heads/${base}`);
  const parentSha = ref.object.sha;
  const parent = await githubApi(env, `/repos/${owner}/${repo}/git/commits/${parentSha}`);
  const profileBlob = await githubApi(env, `/repos/${owner}/${repo}/git/blobs`, { method: 'POST', body: { content: JSON.stringify(profile, null, 2) + '\n', encoding: 'utf-8' } });
  const csvBlob = await githubApi(env, `/repos/${owner}/${repo}/git/blobs`, { method: 'POST', body: { content: csvText, encoding: 'utf-8' } });
  const dir = profile.schemaVersion === 2 && !profile.gameId
    ? `profiles/${profile.target.kind === 'game' ? 'games' : 'software'}/${profile.target.id}/${profile.deviceId}/${profile.id}`
    : `data/profiles/${profile.gameId}/${profile.deviceId}/${profile.id}`;
  const tree = await githubApi(env, `/repos/${owner}/${repo}/git/trees`, { method: 'POST', body: { base_tree: parent.tree.sha, tree: [
    { path: `${dir}/profile.json`, mode: '100644', type: 'blob', sha: profileBlob.sha },
    { path: `${dir}/profile.csv`, mode: '100644', type: 'blob', sha: csvBlob.sha }
  ] } });
  const commit = await githubApi(env, `/repos/${owner}/${repo}/git/commits`, { method: 'POST', body: { message: `Add ${profile.title} profile`, tree: tree.sha, parents: [parentSha] } });
  const branch = `submission/${profile.id.slice(0, 120)}-${crypto.randomUUID().slice(0, 8)}`;
  await githubApi(env, `/repos/${owner}/${repo}/git/refs`, { method: 'POST', body: { ref: `refs/heads/${branch}`, sha: commit.sha } });
  const prBody = [
    '## Adaptive Profiles submission', '',
    `- **Target:** ${profile.target?.id || profile.gameId}`,
    `- **Platform:** ${profile.platform}`,
    `- **Device:** ${profile.deviceId}`,
    `- **Contributor:** ${profile.contributor.displayName}`,
    `- **Source:** ${profile.source.type}`,
    `- **Semantic mapping:** ${profile.semanticStatus}`,
    '', 'The website validated the structured metadata and CSV size/encoding before creating this pull request. CI remains authoritative.'
  ].join('\n');
  return githubApi(env, `/repos/${owner}/${repo}/pulls`, { method: 'POST', body: { title: `Add ${profile.title} — ${profile.target?.id || profile.gameId} / ${profile.deviceId}`, head: branch, base, body: prBody } });
}

async function createProposalPullRequest(env, profile, proposal) {
  const { owner, repo, base } = registryConfig(env); const ref = await githubApi(env, `/repos/${owner}/${repo}/git/ref/heads/${base}`); const parentSha = ref.object.sha; const parent = await githubApi(env, `/repos/${owner}/${repo}/git/commits/${parentSha}`); const branch = `proposal/${profile.id}-${crypto.randomUUID().replaceAll('-', '').slice(0, 8)}`;
  const updated = { ...profile, ...proposal.changes, revision: profile.revision + 1, updatedAt: new Date().toISOString() };
  const blob = await githubApi(env, `/repos/${owner}/${repo}/git/blobs`, { method: 'POST', body: { content: JSON.stringify(updated, null, 2) + '\n', encoding: 'utf-8' } });
  const tree = await githubApi(env, `/repos/${owner}/${repo}/git/trees`, { method: 'POST', body: { base_tree: parent.tree.sha, tree: [{ path: profilePath(profile, 'profile.json'), mode: '100644', type: 'blob', sha: blob.sha }] } });
  const commit = await githubApi(env, `/repos/${owner}/${repo}/git/commits`, { method: 'POST', body: { message: `Suggest update — ${profile.title}`, tree: tree.sha, parents: [parentSha] } }); await githubApi(env, `/repos/${owner}/${repo}/git/refs`, { method: 'POST', body: { ref: `refs/heads/${branch}`, sha: commit.sha } });
  const changed = Object.keys(proposal.changes || {}); const body = ['## Adaptive Profiles update proposal', '', `- **Profile:** ${profile.id}`, `- **Current revision:** ${profile.revision}`, `- **Proposer:** ${String(proposal.proposer || 'Anonymous').slice(0, 80)}`, `- **Reason:** ${String(proposal.reason).slice(0, 1000)}`, `- **Fields changed:** ${changed.length ? changed.join(', ') : 'none supplied'}`, `- **Snapshot changed?:** ${changed.includes('source') ? 'review required' : 'No'}`, `- **Old SHA:** ${profile.snapshot.sha256}`, `- **New SHA:** ${updated.snapshot.sha256}`, '', 'The website validated the expected revision and snapshot hash. Maintainers must review the generated diff before merging.'].join('\n');
  return githubApi(env, `/repos/${owner}/${repo}/pulls`, { method: 'POST', body: { title: `Suggest update — ${profile.title}`, head: branch, base, body } });
}

async function githubApi(env, path, options = {}) {
  const response = await fetch(`https://api.github.com${path}`, {
    method: options.method || 'GET',
    headers: { Authorization: `Bearer ${githubToken(env)}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'adaptive-profiles-worker', ...(options.body ? { 'Content-Type': 'application/json' } : {}) },
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const text = await response.text();
  let payload = null; try { payload = text ? JSON.parse(text) : null; } catch {}
  if (!response.ok) throw new Error(`GitHub ${response.status}: ${payload?.message || text.slice(0, 200)}`);
  return payload;
}

export function parseGoogleSheet(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.hostname !== 'docs.google.com') return null;
    const match = url.pathname.match(/^\/spreadsheets\/d\/([A-Za-z0-9_-]{20,})(?:\/|$)/);
    if (!match) return null;
    const gid = url.searchParams.get('gid') || url.hash.match(/(?:^#|[&#])gid=(\d+)/)?.[1] || '0';
    return /^\d+$/.test(gid) ? { sheetId: match[1], gid } : null;
  } catch { return null; }
}

export function validateCsvText(text) {
  if (!text || new TextEncoder().encode(text).byteLength > MAX_CSV_BYTES) return 'CSV is empty or too large.';
  if (text.includes('\0')) return 'CSV contains NUL bytes.';
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return 'CSV must contain at least two non-empty rows.';
  if (!lines.some(line => line.includes(','))) return 'The file does not appear to be comma-separated CSV.';
  return '';
}

export function slugify(value) {
  return String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').replace(/-{2,}/g, '-');
}

export function submissionOriginAllowed(request, env) {
  const origin = request.headers.get('Origin');
  if (!origin) return false;
  const requestOrigin = new URL(request.url).origin;
  return origin === requestOrigin || Boolean(env.PUBLIC_ORIGIN && origin === env.PUBLIC_ORIGIN);
}

function routeId(pathname, prefix) {
  if (!pathname.startsWith(prefix)) return '';
  const candidate = pathname.slice(prefix.length);
  return slugOk(candidate) ? candidate : '';
}
function registryConfig(env) { return { owner: env.REGISTRY_GITHUB_OWNER || env.GITHUB_OWNER || 'Bbrizly', repo: env.REGISTRY_GITHUB_REPO || env.GITHUB_REPO || 'Adaptive-Profiles', base: env.REGISTRY_GITHUB_BRANCH || env.GITHUB_BRANCH || 'main' }; }
function githubToken(env) { return env.REGISTRY_GITHUB_TOKEN || env.GITHUB_TOKEN || ''; }
function repoName(env) { const { owner, repo } = registryConfig(env); return `${owner}/${repo}`; }
function profilePath(profile, filename) { return `data/profiles/${profile.gameId || profile.target?.id}/${profile.deviceId}/${profile.id}/${filename}`; }
function rawUrl(env, path) { const { owner, repo, base } = registryConfig(env); return `https://raw.githubusercontent.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/${encodeURIComponent(base)}/${path}`; }
function slugOk(value) { return /^[a-z0-9]+(?:-+[a-z0-9]+)*$/.test(value); }
function requiredField(form, name, max) { const value = optionalField(form, name, max); if (!value) throw new RequestError(422, 'Invalid profile', `${name} is required.`); return value; }
function optionalField(form, name, max) { const raw = form.get(name); const value = typeof raw === 'string' ? raw.trim().replace(/\s+/g, ' ') : ''; if (value.length > max) throw new RequestError(422, 'Invalid profile', `${name} is too long.`); return value; }
function decodeUtf8(buffer) { try { return new TextDecoder('utf-8', { fatal: true }).decode(buffer).replace(/^\uFEFF/, ''); } catch { throw new RequestError(422, 'Invalid CSV', 'CSV must be valid UTF-8.'); } }
async function sha256Hex(text) { const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)); return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join(''); }
async function readTextLimited(response, maxBytes) {
  const declared = Number(response.headers.get('content-length') || 0); if (declared > maxBytes) throw new Error('too large');
  if (!response.body) return '';
  const reader = response.body.getReader(); const chunks = []; let total = 0;
  while (true) { const { done, value } = await reader.read(); if (done) break; total += value.byteLength; if (total > maxBytes) { await reader.cancel(); throw new Error('too large'); } chunks.push(value); }
  const bytes = new Uint8Array(total); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return decodeUtf8(bytes.buffer);
}
async function verifyTurnstile(token, request, env) {
  if (!env.TURNSTILE_SECRET) return true;
  if (!token) return false;
  const body = new FormData(); body.set('secret', env.TURNSTILE_SECRET); body.set('response', token);
  const ip = request.headers.get('cf-connecting-ip'); if (ip) body.set('remoteip', ip);
  const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body });
  return response.ok && (await response.json()).success === true;
}

class RequestError extends Error { constructor(status, title, detail) { super(detail); this.status = status; this.title = title; this.detail = detail; } }
function json(value, status = 200, maxAge = 0, allowCors = true) { return new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': maxAge ? `public, max-age=${maxAge}` : 'no-store', ...(allowCors ? corsHeaders() : {}), ...securityHeaders() } }); }
function problem(status, title, detail) { return new Response(JSON.stringify({ type: `https://adaptive-profiles.dev/problems/${slugify(title)}`, title, status, detail }), { status, headers: { 'Content-Type': 'application/problem+json; charset=utf-8', 'Cache-Control': 'no-store', ...corsHeaders(), ...securityHeaders() } }); }
function corsHeaders() { return { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS', 'Access-Control-Allow-Headers': 'Accept, Content-Type' }; }
function securityHeaders() { return { 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin', 'Permissions-Policy': 'camera=(), microphone=(), geolocation=()' }; }
