import assert from 'node:assert/strict';
import worker, { parseGoogleSheet, slugify, submissionOriginAllowed, validateCsvText } from '../worker/index.js';

const goodSheet = parseGoogleSheet('https://docs.google.com/spreadsheets/d/1234567890_abcdefghijk/edit#gid=42');
assert.deepEqual(goodSheet, { sheetId: '1234567890_abcdefghijk', gid: '42' });
assert.equal(parseGoogleSheet('https://evil.example/spreadsheets/d/1234567890_abcdefghijk/edit#gid=42'), null);
assert.equal(parseGoogleSheet('https://docs.google.com.evil.example/spreadsheets/d/1234567890_abcdefghijk/edit'), null);
assert.equal(parseGoogleSheet('http://docs.google.com/spreadsheets/d/1234567890_abcdefghijk/edit'), null);
assert.equal(parseGoogleSheet('https://docs.google.com/drive/u/0/folders/1234567890_abcdefghijk'), null);

assert.equal(slugify(' Low Fatigue / Beginner '), 'low-fatigue-beginner');
assert.equal(validateCsvText('a,b\n1,2\n'), '');
assert.match(validateCsvText('not csv\nstill not csv\n'), /comma-separated/);
assert.match(validateCsvText('a,b\0\n1,2\n'), /NUL/);

const sameOrigin = new Request('https://profiles.example/api/v1/submissions/profile', { headers: { Origin: 'https://profiles.example' } });
const foreignOrigin = new Request('https://profiles.example/api/v1/submissions/profile', { headers: { Origin: 'https://evil.example' } });
assert.equal(submissionOriginAllowed(sameOrigin, { PUBLIC_ORIGIN: '' }), true);
assert.equal(submissionOriginAllowed(foreignOrigin, { PUBLIC_ORIGIN: '' }), false);

const form = new FormData();
form.set('deviceId', 'quadstick-fps');
form.set('platform', 'pc');
form.set('title', 'Test');
form.set('displayName', 'Tester');
form.set('sourceType', 'csv');
const request = new Request('https://profiles.example/api/v1/submissions/profile', {
  method: 'POST',
  headers: { Origin: 'https://profiles.example' },
  body: form
});
const response = await worker.fetch(request, { GITHUB_TOKEN: 'test-token' });
assert.equal(response.status, 422);
const body = await response.json();
assert.equal(body.title, 'Invalid profile');
assert.match(body.detail, /gameId is required/);

console.log('Worker security tests passed.');

const previousFetch = globalThis.fetch;
const legacyIndex = { schemaVersion: 1, games: [{ id: 'minecraft', name: 'Minecraft', aliases: [], platforms: ['pc'], actions: [], source: { url: 'https://example.com', title: 'Minecraft' }, controls: [] }], devices: [{ id: 'quadstick-fps', name: 'QuadStick FPS', manufacturer: 'QuadStick', inputs: [] }], profiles: [] };
globalThis.fetch = async () => new Response(JSON.stringify(legacyIndex), { status: 200, headers: { 'content-type': 'application/json' } });
const readEnv = { GITHUB_OWNER: 'Bbrizly', GITHUB_REPO: 'Adaptive-Profiles', GITHUB_BRANCH: 'main' };
const v1 = await worker.fetch(new Request('https://profiles.example/api/v1/index'), readEnv);
assert.equal(v1.status, 200);
assert.deepEqual(Object.keys((await v1.json()).data).sort(), ['devices', 'games', 'profiles', 'schemaVersion']);
const v2 = await worker.fetch(new Request('https://profiles.example/api/v2/targets'), readEnv);
assert.equal(v2.status, 200);
assert.equal((await v2.json()).data[0].kind, 'game');
const missing = await worker.fetch(new Request('https://profiles.example/api/v2/profiles/does-not-exist'), readEnv);
assert.equal(missing.status, 404);
globalThis.fetch = previousFetch;
console.log('Worker V1/V2 read compatibility tests passed.');
