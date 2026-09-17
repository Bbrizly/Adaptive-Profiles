import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const ROOT = path.resolve(import.meta.dirname, '..');
const GAMES_ROOT = path.join(ROOT, 'data', 'games');
const DEVICES_ROOT = path.join(ROOT, 'data', 'devices');
const PROFILES_ROOT = path.join(ROOT, 'data', 'profiles');
export const INDEX_PATH = path.join(ROOT, 'generated', 'index.json');
export const INDEX_V2_PATH = path.join(ROOT, 'generated', 'index.v2.json');

const slugRe = /^[a-z0-9]+(?:-+[a-z0-9]+)*$/;
const platforms = new Set(['pc', 'xbox', 'playstation', 'switch']);
const actionKinds = new Set(['digital', 'axis-1d', 'axis-2d', 'pointer', 'menu', 'system']);
const inputKinds = new Set(['digital', 'axis-1d', 'axis-2d', 'pointer']);
const behaviors = new Set(['normal', 'tap', 'hold', 'toggle', 'repeat']);

function fail(message) { throw new Error(message); }
function assert(condition, message) { if (!condition) fail(message); }
function jsonFile(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }
function listFiles(root, predicate) {
  if (!fs.existsSync(root)) return [];
  const out = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) out.push(...listFiles(full, predicate));
    else if (predicate(full)) out.push(full);
  }
  return out.sort();
}
function unique(values, label) { assert(new Set(values).size === values.length, `Duplicate ${label}`); }
function allowedKeys(value, keys, label) {
  for (const key of Object.keys(value)) assert(keys.includes(key), `${label}: unexpected field '${key}'`);
}
function requireString(value, label, max = 500) { assert(typeof value === 'string' && value.length > 0 && value.length <= max, `${label}: invalid string`); }
function requireSlug(value, label) { requireString(value, label, 160); assert(slugRe.test(value), `${label}: invalid slug '${value}'`); }

export function loadRegistry() {
  const games = listFiles(GAMES_ROOT, f => f.endsWith(`${path.sep}game.json`)).map(file => ({ file, data: jsonFile(file) }));
  const controls = listFiles(GAMES_ROOT, f => f.includes(`${path.sep}controls${path.sep}`) && f.endsWith('.json')).map(file => ({ file, data: jsonFile(file) }));
  const devices = listFiles(DEVICES_ROOT, f => f.endsWith('.json')).map(file => ({ file, data: jsonFile(file) }));
  const profiles = listFiles(PROFILES_ROOT, f => f.endsWith(`${path.sep}profile.json`)).map(file => ({ file, data: jsonFile(file) }));
  return { games, controls, devices, profiles };
}

export function validateRegistry(registry = loadRegistry()) {
  const errors = [];
  const run = (fn) => { try { fn(); } catch (error) { errors.push(error.message); } };
  const gameById = new Map();
  const deviceById = new Map();
  const profileIds = [];

  for (const { file, data: game } of registry.games) run(() => {
    const label = path.relative(ROOT, file);
    allowedKeys(game, ['schemaVersion','id','name','aliases','platforms','actions','source'], label);
    assert(game.schemaVersion === 1, `${label}: unsupported schemaVersion`);
    requireSlug(game.id, `${label}.id`); requireString(game.name, `${label}.name`, 120);
    assert(Array.isArray(game.platforms) && game.platforms.length, `${label}: platforms required`);
    unique(game.platforms, `${label} platforms`);
    for (const p of game.platforms) assert(platforms.has(p), `${label}: unknown platform ${p}`);
    assert(Array.isArray(game.actions) && game.actions.length, `${label}: actions required`);
    unique(game.actions.map(a => a.id), `${label} action ids`);
    for (const action of game.actions) {
      allowedKeys(action, ['id','name','category','kind'], `${label}.action`);
      requireSlug(action.id, `${label}.action.id`); requireString(action.name, `${label}.action.name`, 120);
      requireSlug(action.category, `${label}.action.category`); assert(actionKinds.has(action.kind), `${label}: invalid action kind`);
    }
    assert(game.source && typeof game.source === 'object', `${label}: source required`);
    allowedKeys(game.source, ['url','title'], `${label}.source`);
    requireString(game.source.url, `${label}.source.url`); new URL(game.source.url);
    requireString(game.source.title, `${label}.source.title`);
    assert(!gameById.has(game.id), `${label}: duplicate game id ${game.id}`);
    gameById.set(game.id, game);
  });

  for (const { file, data: device } of registry.devices) run(() => {
    const label = path.relative(ROOT, file);
    allowedKeys(device, ['schemaVersion','id','name','manufacturer','inputs'], label);
    assert(device.schemaVersion === 1, `${label}: unsupported schemaVersion`);
    requireSlug(device.id, `${label}.id`); requireString(device.name, `${label}.name`, 120); requireString(device.manufacturer, `${label}.manufacturer`, 120);
    assert(Array.isArray(device.inputs) && device.inputs.length, `${label}: inputs required`);
    unique(device.inputs.map(i => i.id), `${label} input ids`);
    for (const input of device.inputs) {
      allowedKeys(input, ['id','name','kind'], `${label}.input`);
      requireSlug(input.id, `${label}.input.id`); requireString(input.name, `${label}.input.name`, 120);
      assert(inputKinds.has(input.kind), `${label}: invalid input kind`);
    }
    assert(!deviceById.has(device.id), `${label}: duplicate device id ${device.id}`);
    deviceById.set(device.id, device);
  });

  for (const { file, data: control } of registry.controls) run(() => {
    const label = path.relative(ROOT, file);
    allowedKeys(control, ['schemaVersion','gameId','platform','scheme','bindings','source'], label);
    assert(control.schemaVersion === 1, `${label}: unsupported schemaVersion`);
    const game = gameById.get(control.gameId); assert(game, `${label}: unknown game ${control.gameId}`);
    assert(platforms.has(control.platform) && game.platforms.includes(control.platform), `${label}: unsupported platform`);
    requireSlug(control.scheme, `${label}.scheme`);
    assert(Array.isArray(control.bindings), `${label}: bindings must be an array`);
    unique(control.bindings.map(b => b.action), `${label} action bindings`);
    const actions = new Set(game.actions.map(a => a.id));
    for (const binding of control.bindings) {
      allowedKeys(binding, ['action','control'], `${label}.binding`);
      assert(actions.has(binding.action), `${label}: unknown action ${binding.action}`);
      requireString(binding.control, `${label}.binding.control`, 120);
    }
    assert(control.source && typeof control.source === 'object', `${label}: source required`);
    allowedKeys(control.source, ['url','title','verifiedAt'], `${label}.source`);
    new URL(control.source.url); requireString(control.source.title, `${label}.source.title`); requireString(control.source.verifiedAt, `${label}.source.verifiedAt`, 40);
  });

  for (const { file, data: profile } of registry.profiles) run(() => {
    const label = path.relative(ROOT, file);
    allowedKeys(profile, ['schemaVersion','id','title','description','gameId','platform','deviceId','semanticStatus','mappings','tags','contributor','source','snapshot','createdAt'], label);
    assert(profile.schemaVersion === 1, `${label}: unsupported schemaVersion`);
    requireSlug(profile.id, `${label}.id`); requireString(profile.title, `${label}.title`, 100);
    assert(typeof profile.description === 'string' && profile.description.length <= 500, `${label}: invalid description`);
    const game = gameById.get(profile.gameId); const device = deviceById.get(profile.deviceId);
    assert(game, `${label}: unknown game ${profile.gameId}`); assert(device, `${label}: unknown device ${profile.deviceId}`);
    assert(game.platforms.includes(profile.platform), `${label}: unsupported platform ${profile.platform}`);
    assert(['unmapped','mapped'].includes(profile.semanticStatus), `${label}: invalid semanticStatus`);
    assert(Array.isArray(profile.mappings), `${label}: mappings must be array`);
    const actionIds = new Set(game.actions.map(a => a.id)); const inputIds = new Set(device.inputs.map(i => i.id));
    for (const mapping of profile.mappings) {
      allowedKeys(mapping, ['input','action','behavior'], `${label}.mapping`);
      assert(inputIds.has(mapping.input), `${label}: unknown input ${mapping.input}`);
      assert(actionIds.has(mapping.action), `${label}: unknown action ${mapping.action}`);
      assert(behaviors.has(mapping.behavior), `${label}: invalid behavior`);
    }
    if (profile.semanticStatus === 'mapped') assert(profile.mappings.length > 0, `${label}: mapped profile needs mappings`);
    assert(Array.isArray(profile.tags) && profile.tags.length <= 10, `${label}: invalid tags`); for (const tag of profile.tags) requireSlug(tag, `${label}.tag`);
    assert(profile.contributor && typeof profile.contributor === 'object', `${label}: contributor required`); allowedKeys(profile.contributor, ['displayName','github'], `${label}.contributor`); requireString(profile.contributor.displayName, `${label}.contributor.displayName`, 60);
    assert(profile.source && ['google-sheet','csv'].includes(profile.source.type), `${label}: invalid source`); allowedKeys(profile.source, ['type','url'], `${label}.source`);
    if (profile.source.type === 'google-sheet') { requireString(profile.source.url, `${label}.source.url`); const u = new URL(profile.source.url); assert(u.hostname === 'docs.google.com' && /^\/spreadsheets\/d\/[A-Za-z0-9_-]+/.test(u.pathname), `${label}: invalid Google Sheet URL`); }
    assert(profile.snapshot?.file === 'profile.csv', `${label}: snapshot.file must be profile.csv`);
    assert(/^[a-f0-9]{64}$/.test(profile.snapshot?.sha256 || ''), `${label}: invalid snapshot sha256`);
    const csvPath = path.join(path.dirname(file), 'profile.csv'); assert(fs.existsSync(csvPath), `${label}: profile.csv missing`);
    const csv = fs.readFileSync(csvPath); assert(csv.length > 0 && csv.length <= 131072, `${label}: CSV must be 1..131072 bytes`);
    assert(crypto.createHash('sha256').update(csv).digest('hex') === profile.snapshot.sha256, `${label}: snapshot hash mismatch`);
    assert(path.basename(path.dirname(file)) === profile.id, `${label}: directory must equal profile id`);
    profileIds.push(profile.id);
  });
  run(() => unique(profileIds, 'profile ids'));

  return errors;
}

export function buildIndex(registry = loadRegistry()) {
  const controlsByGame = new Map();
  for (const { data } of registry.controls) {
    if (!controlsByGame.has(data.gameId)) controlsByGame.set(data.gameId, []);
    controlsByGame.get(data.gameId).push({ platform: data.platform, scheme: data.scheme, bindings: data.bindings, source: data.source });
  }
  return {
    schemaVersion: 1,
    games: registry.games.map(({data:g}) => ({ id:g.id, name:g.name, aliases:g.aliases || [], platforms:g.platforms, actions:g.actions, source:g.source, controls:(controlsByGame.get(g.id)||[]).sort((a,b)=>`${a.platform}:${a.scheme}`.localeCompare(`${b.platform}:${b.scheme}`)) })).sort((a,b)=>a.name.localeCompare(b.name)),
    devices: registry.devices.map(({data:d}) => ({ id:d.id, name:d.name, manufacturer:d.manufacturer, inputs:d.inputs })).sort((a,b)=>a.name.localeCompare(b.name)),
    profiles: registry.profiles.map(({data:p}) => p).sort((a,b)=>a.title.localeCompare(b.title) || a.id.localeCompare(b.id))
  };
}

export function stableIndexText(registry = loadRegistry()) { return JSON.stringify(buildIndex(registry), null, 2) + '\n'; }

export function buildIndexV2(registry = loadRegistry()) {
  const v1 = buildIndex(registry);
  const targets = v1.games.map(game => ({
    schemaVersion: 2,
    id: game.id,
    kind: 'game',
    name: game.name,
    aliases: game.aliases || [],
    categories: ['gaming'],
    platforms: game.platforms,
    actions: game.actions,
    source: game.source,
    controls: game.controls || []
  }));
  const devices = v1.devices.map(device => ({ ...device, schemaVersion: 2 }));
  const profiles = v1.profiles.map(profile => ({
    schemaVersion: 2,
    id: profile.id,
    title: profile.title,
    description: profile.description,
    target: { kind: 'game', id: profile.gameId },
    gameId: profile.gameId,
    platform: profile.platform,
    deviceId: profile.deviceId,
    semanticStatus: profile.semanticStatus,
    mappings: profile.mappings,
    tags: profile.tags,
    contributor: profile.contributor,
    source: profile.source,
    snapshot: profile.snapshot,
    revision: profile.revision || 1,
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt || profile.createdAt
  }));
  return { schemaVersion: 2, targets: targets.sort((a, b) => a.name.localeCompare(b.name)), devices, profiles: profiles.sort((a, b) => a.title.localeCompare(b.title) || a.id.localeCompare(b.id)) };
}

export function stableIndexV2Text(registry = loadRegistry()) { return JSON.stringify(buildIndexV2(registry), null, 2) + '\n'; }
