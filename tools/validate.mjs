import fs from 'node:fs';
import { INDEX_PATH, loadRegistry, stableIndexText, validateRegistry } from './registry.mjs';

const registry = loadRegistry();
const errors = validateRegistry(registry);
if (errors.length) {
  console.error(`Registry validation failed with ${errors.length} error(s):`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

if (process.argv.includes('--check-index')) {
  const expected = stableIndexText(registry);
  const actual = fs.existsSync(INDEX_PATH) ? fs.readFileSync(INDEX_PATH, 'utf8') : '';
  if (actual !== expected) {
    console.error('generated/index.json is stale. Run: node tools/build-index.mjs');
    process.exit(1);
  }
}

console.log(`Registry valid: ${registry.games.length} game(s), ${registry.devices.length} device(s), ${registry.profiles.length} profile(s).`);
