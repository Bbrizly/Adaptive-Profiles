import fs from 'node:fs';
import path from 'node:path';
import { INDEX_PATH, loadRegistry, stableIndexText, validateRegistry } from './registry.mjs';

const registry = loadRegistry();
const errors = validateRegistry(registry);
if (errors.length) {
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}
fs.mkdirSync(path.dirname(INDEX_PATH), { recursive: true });
fs.writeFileSync(INDEX_PATH, stableIndexText(registry));
console.log('Wrote generated/index.json');
