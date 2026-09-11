const RAW_CACHE_SECONDS = 60;
const MAX_CSV_BYTES = 128 * 1024;
const MAX_DESCRIPTION = 500;
const API_PREFIX = '/api/v1';
const allowedPlatforms = new Set(['pc', 'xbox', 'playstation', 'switch']);

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders() });
    if (!url.pathname.startsWith(API_PREFIX)) return problem(404, 'Not found', 'Unknown API version.');

    try {
      if (request.method === 'GET') return await handleRead(request, env, url);
      if (request.method === 'POST' && url.pathname === `${API_PREFIX}/submissions/profile`) {
        return await submitProfile(request, env);
      }
      return problem(405, 'Method not allowed', 'This route does not support that method.');
    } catch (error) {
      console.error('request_failed', { path: url.pathname, message: error?.message });
      return problem(500, 'Internal server error', 'The request could not be completed.');
    }
  }
};

async function handleRead(request, env, url) {
  if (url.pathname === `${API_PREFIX}/health`) {
    return json({ data: { ok: true, source: `${env.GITHUB_OWNER}/${env.GITHUB_REPO}`, branch: env.GITHUB_BRANCH || 'main' } }, 200, 30);
  }
  if (url.pathname === `${API_PREFIX}/config`) {
    return json({ data: { repository: `${env.GITHUB_OWNER}/${env.GITHUB_REPO}`, turnstileSiteKey: env.TURNSTILE_SITE_KEY || '', submissionsEnabled: Boolean(env.GITHUB_TOKEN) } }, 200, 60);
  }

  const index = await fetchIndex(env);
  if (url.pathname === `${API_PREFIX}/index`) return json({ data: index }, 200, 60);
  if (url.pathname === `${API_PREFIX}/games`) return json({ data: index.games }, 200, 60);
  if (url.pathname === `${API_PREFIX}/devices`) return json({ data: index.devices }, 200, 60);
  if (url.pathname === `${API_PREFIX}/profiles`) {
    let profiles = index.profiles;
    for (const [param, field] of [['game','gameId'], ['device','deviceId'], ['platform','platform']]) {
      const value = url.searchParams.get(param);
      if (value) profiles = profiles.filter(profile => profile[field] === value);
    }
    return json({ data: profiles }, 200, 60);
  }
  if (url.pathname === `${API_PREFIX}/search`) {
    const query = (url.searchParams.get('q') || '').trim().toLowerCase().slice(0, 100);
    if (!query) return json({ data: { games: [], devices: [], profiles: [] } }, 200, 30);
    const contains = (...values) => values.flat().filter(Boolean).some(value => String(value).toLowerCase().includes(query));
    const games = index.games.filter(g => contains(g.name, g.id, g.aliases));
    const devices = index.devices.filter(d => contains(d.name, d.id, d.manufacturer));
    const profiles = index.profiles.filter(p => contains(p.title, p.description, p.id, p.gameId, p.deviceId, p.tags));
    return json({ data: { games, devices, profiles } }, 200, 30);
  }

  const gameMatch = url.pathname.match(/^\/api\/v1\/games\/([a-z0-9-]+)$/);
  if (gameMatch) {
    const game = index.games.find(item => item.id === gameMatch[1]);
    return game ? json({ data: { ...game, profiles: index.profiles.filter(p => p.gameId === game.id) } }, 200, 60) : problem(404, 'Game not found', 'No game has that id.');
  }
  const deviceMatch = url.pathname.match(/^\/api\/v1\/devices\/([a-z0-9-]+)$/);
  if (deviceMatch) {
    const device = index.devices.find(item => item.id === deviceMatch[1]);
    return device ? json({ data: { ...device, profiles: index.profiles.filter(p => p.deviceId === device.id) } }, 200, 60) : problem(404, 'Device not found', 'No device has that id.');
  }
  const profileCsvMatch = url.pathname.match(/^\/api\/v1\/profiles\/([a-z0-9-]+)\/csv$/);
  if (profileCsvMatch) {
    const profile = index.profiles.find(item => item.id === profileCsvMatch[1]);
    if (!profile) return problem(404, 'Profile not found', 'No profile has that id.');
    const raw = rawUrl(env, `data/profiles/${profile.gameId}/${profile.deviceId}/${profile.id}/profile.csv`);
    const response = await fetch(raw, { cf: { cacheEverything: true, cacheTtl: RAW_CACHE_SECONDS } });
    if (!response.ok) return problem(502, 'Profile snapshot unavailable', 'The CSV snapshot could not be read from the registry.');
    return new Response(response.body, { status: 200, headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `inline; filename="${profile.id}.csv"`, 'Cache-Control': 'public, max-age=60', ...corsHeaders(), ...securityHeaders() } });
  }
  const profileMatch = url.pathname.match(/^\/api\/v1\/profiles\/([a-z0-9-]+)$/);
  if (profileMatch) {
    const profile = index.profiles.find(item => item.id === profileMatch[1]);
    if (!profile) return problem(404, 'Profile not found', 'No profile has that id.');
    return json({ data: { ...profile, links: { csv: `${API_PREFIX}/profiles/${profile.id}/csv`, qcm: `qcm://profile/${profile.id}` } } }, 200, 60);
  }
  return problem(404, 'Not found', 'Unknown API route.');
}

async function submitProfile(request, env) {
  if (!env.GITHUB_TOKEN) return problem(503, 'Submissions unavailable', 'The submission bridge has not been configured yet.');
  if (!submissionOriginAllowed(request, env)) return problem(403, 'Forbidden', 'Profile submissions must originate from the Adaptive Profiles website.');
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('multipart/form-data')) return problem(415, 'Unsupported media type', 'Use multipart/form-data.');

  if (env.SUBMISSION_RATE_LIMITER) {
    const actor = request.headers.get('cf-connecting-ip') || 'anonymous';
    const { success } = await env.SUBMISSION_RATE_LIMITER.limit({ key: `profile:${actor}` });
    if (!success) return problem(429, 'Too many submissions', 'Please try again later.');
  }

  const form = await request.formData();
  if (!(await verifyTurnstile(String(form.get('turnstileToken') || ''), request, env))) return problem(403, 'Verification failed', 'Human verification failed.');

  const index = await fetchIndex(env, true);
  const gameId = field(form, 'gameId', 80); const deviceId = field(form, 'deviceId', 80); const platform = field(form, 'platform', 40);
  const title = field(form, 'title', 100); const description = optionalField(form, 'description', MAX_DESCRIPTION);
  const displayName = field(form, 'displayName', 60); const github = optionalField(form, 'github', 39);
  const sourceType = field(form, 'sourceType', 20);

  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(gameId) || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(deviceId)) return problem(422, 'Invalid profile', 'Game or device id is malformed.');
  if (!allowedPlatforms.has(platform)) return problem(422, 'Invalid profile', 'Unsupported platform.');
  if (github && !/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(github)) return problem(422, 'Invalid profile', 'GitHub username is malformed.');

  const game = index.games.find(g => g.id === gameId); const device = index.devices.find(d => d.id === deviceId);
  if (!game || !device) return problem(422, 'Invalid profile', 'Choose a known game and adaptive device.');
  if (!game.platforms.includes(platform)) return problem(422, 'Invalid profile', 'That game does not list the selected platform.');

  const tags = [...new Set(optionalField(form, 'tags', 200).split(',').map(slugify).filter(Boolean))].slice(0, 10);
  const id = [gameId, platform, deviceId, slugify(title).slice(0, 48), slugify(displayName).slice(0, 32)].filter(Boolean).join('--');
  if (!/^[a-z0-9]+(?:-+[a-z0-9]+)*$/.test(id) || id.length > 190) return problem(422, 'Invalid profile', 'The generated profile id is invalid.');
  if (index.profiles.some(p => p.id === id)) return problem(409, 'Profile already exists', 'A profile with the same game, platform, device, title and contributor already exists.');

  let csvText; let source;
  if (sourceType === 'google-sheet') {
    const parsed = parseGoogleSheet(optionalField(form, 'googleSheetUrl', 600));
    if (!parsed) return problem(422, 'Invalid Google Sheet', 'Paste a public docs.google.com spreadsheet URL.');
    const exportUrl = `https://docs.google.com/spreadsheets/d/${parsed.sheetId}/export?format=csv&gid=${encodeURIComponent(parsed.gid)}`;
    const response = await fetch(exportUrl, { redirect: 'follow' });
    if (!response.ok) return problem(422, 'Google Sheet unavailable', 'The spreadsheet could not be exported. Make sure it is public and the selected sheet exists.');
    csvText = await readTextLimited(response, MAX_CSV_BYTES);
    source = { type: 'google-sheet', url: `https://docs.google.com/spreadsheets/d/${parsed.sheetId}/edit#gid=${parsed.gid}` };
  } else if (sourceType === 'csv') {
    const file = form.get('csv');
    if (!file || typeof file.arrayBuffer !== 'function' || !String(file.name || '').toLowerCase().endsWith('.csv')) return problem(422, 'CSV required', 'Choose a .csv file.');
    if (file.size < 1 || file.size > MAX_CSV_BYTES) return problem(413, 'CSV size invalid', 'CSV files must be between 1 byte and 128 KiB.');
    csvText = decodeUtf8(await file.arrayBuffer());
    source = { type: 'csv' };
  } else return problem(422, 'Invalid source', 'Choose Google Sheet or CSV.');

  const csvError = validateCsvText(csvText);
  if (csvError) return problem(422, 'Invalid CSV', csvError);
  const sha256 = await sha256Hex(csvText);
  const createdAt = new Date().toISOString();
  const profile = {
    schemaVersion: 1,
    id,
    title,
    description,
    gameId,
    platform,
    deviceId,
    semanticStatus: 'unmapped',
    mappings: [],
    tags,
    contributor: { displayName, ...(github ? { github } : {}) },
    source,
    snapshot: { file: 'profile.csv', sha256 },
    createdAt
  };

  const result = await createSubmissionPullRequest(env, profile, csvText);
  return json({ data: { profileId: id, pullRequest: result.html_url, number: result.number } }, 201, 0, false);
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

function rawUrl(env, path) {
  const owner = encodeURIComponent(env.GITHUB_OWNER || 'Bbrizly');
  const repo = encodeURIComponent(env.GITHUB_REPO || 'Adaptive-Profiles');
  const branch = encodeURIComponent(env.GITHUB_BRANCH || 'main');
  return `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${path}`;
}

async function createSubmissionPullRequest(env, profile, csvText) {
  const owner = env.GITHUB_OWNER || 'Bbrizly'; const repo = env.GITHUB_REPO || 'Adaptive-Profiles'; const base = env.GITHUB_BRANCH || 'main';
  const ref = await githubApi(env, `/repos/${owner}/${repo}/git/ref/heads/${base}`);
  const headSha = ref.object.sha;
  const commit = await githubApi(env, `/repos/${owner}/${repo}/git/commits/${headSha}`);
  const profileBlob = await githubApi(env, `/repos/${owner}/${repo}/git/blobs`, { method: 'POST', body: { content: JSON.stringify(profile, null, 2) + '\n', encoding: 'utf-8' } });
  const csvBlob = await githubApi(env, `/repos/${owner}/${repo}/git/blobs`, { method: 'POST', body: { content: csvText, encoding: 'utf-8' } });
  const dir = `data/profiles/${profile.gameId}/${profile.deviceId}/${profile.id}`;
  const tree = await githubApi(env, `/repos/${owner}/${repo}/git/trees`, { method: 'POST', body: { base_tree: commit.tree.sha, tree: [
    { path: `${dir}/profile.json`, mode: '100644', type: 'blob', sha: profileBlob.sha },
    { path: `${dir}/profile.csv`, mode: '100644', type: 'blob', sha: csvBlob.sha }
  ] } });
  const newCommit = await githubApi(env, `/repos/${owner}/${repo}/git/commits`, { method: 'POST', body: { message: `Add ${profile.title} profile`, tree: tree.sha, parents: [headSha] } });
  const branch = `submission/${profile.id.slice(0, 120)}-${crypto.randomUUID().slice(0, 8)}`;
  await githubApi(env, `/repos/${owner}/${repo}/git/refs`, { method: 'POST', body: { ref: `refs/heads/${branch}`, sha: newCommit.sha } });
  const body = [
    '## Adaptive Profiles submission', '',
    `- **Game:** ${profile.gameId}`,
    `- **Platform:** ${profile.platform}`,
    `- **Device:** ${profile.deviceId}`,
    `- **Contributor:** ${profile.contributor.displayName}`,
    `- **Source:** ${profile.source.type}`,
    `- **Semantic mapping:** ${profile.semanticStatus}`,
    '', 'The website validated the structured metadata and CSV size/encoding before creating this pull request. CI remains authoritative.'
  ].join('\n');
  try {
    return await githubApi(env, `/repos/${owner}/${repo}/pulls`, { method: 'POST', body: { title: `Add ${profile.title} — ${profile.gameId} / ${profile.deviceId}`, head: branch, base, body } });
  } catch (error) {
    try { await githubApi(env, `/repos/${owner}/${repo}/git/refs/heads/${encodeURIComponent(branch)}`, { method: 'DELETE' }); } catch {}
    throw error;
  }
}

async function githubApi(env, path, options = {}) {
  const response = await fetch(`https://api.github.com${path}`, {
    method: options.method || 'GET',
    headers: { Authorization: `Bearer ${env.GITHUB_TOKEN}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'adaptive-profiles-worker', ...(options.body ? { 'Content-Type': 'application/json' } : {}) },
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const text = await response.text();
  let payload = null; try { payload = text ? JSON.parse(text) : null; } catch {}
  if (!response.ok) throw new Error(`GitHub ${response.status}: ${payload?.message || text.slice(0, 200)}`);
  return payload;
}

function parseGoogleSheet(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.hostname !== 'docs.google.com') return null;
    const match = url.pathname.match(/^\/spreadsheets\/d\/([A-Za-z0-9_-]{20,})(?:\/|$)/);
    if (!match) return null;
    const hashGid = url.hash.match(/(?:^#|[&#])gid=(\d+)/)?.[1];
    const gid = url.searchParams.get('gid') || hashGid || '0';
    if (!/^\d+$/.test(gid)) return null;
    return { sheetId: match[1], gid };
  } catch { return null; }
}

async function readTextLimited(response, maxBytes) {
  const declared = Number(response.headers.get('content-length') || 0);
  if (declared > maxBytes) throw new Error('CSV exceeds size limit');
  if (!response.body) return '';
  const reader = response.body.getReader(); const chunks = []; let total = 0;
  while (true) {
    const { done, value } = await reader.read(); if (done) break;
    total += value.byteLength;
    if (total > maxBytes) { await reader.cancel(); throw new Error('CSV exceeds size limit'); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return decodeUtf8(bytes.buffer);
}

function decodeUtf8(buffer) { try { return new TextDecoder('utf-8', { fatal: true }).decode(buffer).replace(/^\uFEFF/, ''); } catch { throw new Error('CSV must be valid UTF-8'); } }
function validateCsvText(text) {
  if (!text || new TextEncoder().encode(text).byteLength > MAX_CSV_BYTES) return 'CSV is empty or too large.';
  if (text.includes('\0')) return 'CSV contains NUL bytes.';
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return 'CSV must contain at least two non-empty rows.';
  if (!lines.some(line => line.includes(','))) return 'The file does not appear to be comma-separated CSV.';
  return '';
}
async function sha256Hex(text) { const bytes = new TextEncoder().encode(text); const digest = await crypto.subtle.digest('SHA-256', bytes); return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join(''); }
function slugify(value) { return String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').replace(/-{2,}/g, '-'); }
function field(form, name, max) { const value = optionalField(form, name, max); if (!value) throw new RequestError(422, 'Invalid profile', `${name} is required.`); return value; }
function optionalField(form, name, max) { const raw = form.get(name); const value = typeof raw === 'string' ? raw.trim().replace(/\s+/g, ' ') : ''; if (value.length > max) throw new RequestError(422, 'Invalid profile', `${name} is too long.`); return value; }

async function verifyTurnstile(token, request, env) {
  if (!env.TURNSTILE_SECRET) return true;
  if (!token) return false;
  const body = new FormData(); body.set('secret', env.TURNSTILE_SECRET); body.set('response', token);
  const ip = request.headers.get('cf-connecting-ip'); if (ip) body.set('remoteip', ip);
  const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body });
  if (!response.ok) return false;
  const result = await response.json(); return result.success === true;
}
function submissionOriginAllowed(request, env) {
  const origin = request.headers.get('Origin'); if (!origin) return false;
  const requestOrigin = new URL(request.url).origin;
  return origin === requestOrigin || (env.PUBLIC_ORIGIN && origin === env.PUBLIC_ORIGIN);
}

class RequestError extends Error { constructor(status, title, detail) { super(detail); this.status = status; this.title = title; this.detail = detail; } }

function json(value, status = 200, maxAge = 0, allowCors = true) {
  return new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': maxAge ? `public, max-age=${maxAge}` : 'no-store', ...(allowCors ? corsHeaders() : {}), ...securityHeaders() } });
}
function problem(status, title, detail) { return new Response(JSON.stringify({ type: `https://adaptive-profiles.dev/problems/${slugify(title)}`, title, status, detail }), { status, headers: { 'Content-Type': 'application/problem+json; charset=utf-8', 'Cache-Control': 'no-store', ...corsHeaders(), ...securityHeaders() } }); }
function corsHeaders() { return { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS', 'Access-Control-Allow-Headers': 'Accept, Content-Type' }; }
function securityHeaders() { return { 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin', 'Permissions-Policy': 'camera=(), microphone=(), geolocation=()' }; }
