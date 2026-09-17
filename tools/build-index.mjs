import fs from 'node:fs';
import path from 'node:path';
import { INDEX_PATH, INDEX_V2_PATH, loadRegistry, stableIndexText, stableIndexV2Text, validateRegistry } from './registry.mjs';

const registry = loadRegistry();
const errors = validateRegistry(registry);
if (errors.length) {
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}
fs.mkdirSync(path.dirname(INDEX_PATH), { recursive: true });
fs.writeFileSync(INDEX_PATH, stableIndexText(registry));
console.log('Wrote generated/index.json');
if (process.argv.includes('--v2')) {
  fs.writeFileSync(INDEX_V2_PATH, stableIndexV2Text(registry));
  console.log('Wrote generated/index.v2.json');
}
