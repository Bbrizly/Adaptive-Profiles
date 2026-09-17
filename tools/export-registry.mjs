import fs from 'node:fs';
import path from 'node:path';
import { ROOT, loadRegistry, buildIndex, buildIndexV2, validateRegistry } from './registry.mjs';

const out = path.join(ROOT, 'registry-export');
const registry = loadRegistry();
const errors = validateRegistry(registry);
if (errors.length) throw new Error(errors.join('\n'));
const write = (file, value) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, typeof value === 'string' ? value : `${JSON.stringify(value, null, 2)}\n`); };
fs.rmSync(out, { recursive: true, force: true });
for (const { file, data } of registry.games) {
  const target = buildIndexV2(registry).targets.find(item => item.id === data.id);
  write(path.join(out, 'targets', 'games', data.id, 'target.json'), target);
  for (const control of registry.controls.filter(item => item.data.gameId === data.id)) write(path.join(out, 'targets', 'games', data.id, 'controls', `${control.data.platform}.json`), control.data);
}
for (const { file, data } of registry.devices) write(path.join(out, 'devices', data.id, 'device.json'), { ...data, schemaVersion: 2 });
for (const { file, data } of registry.profiles) {
  const dir = path.join(out, 'profiles', 'games', data.gameId, data.deviceId, data.id);
  write(path.join(dir, 'profile.json'), buildIndexV2(registry).profiles.find(item => item.id === data.id));
  fs.copyFileSync(path.join(path.dirname(file), 'profile.csv'), path.join(dir, 'profile.csv'));
}
write(path.join(out, 'generated', 'index.json'), buildIndex(registry));
write(path.join(out, 'generated', 'index.v2.json'), buildIndexV2(registry));
write(path.join(out, 'schemas', 'README.md'), '# Registry schemas\n\nThe application repository exports the canonical V2 schema and validation tools here until the public registry repository is created.\n');
write(path.join(out, 'tools', 'README.md'), '# Registry tools\n\nThe public repository should run schema validation, snapshot hash checks, deterministic index generation, and generated-output freshness checks on every pull request and push to main.\n');
write(path.join(out, 'tools', 'validate.mjs'), "import fs from 'node:fs';\nconst v1 = JSON.parse(fs.readFileSync('generated/index.json', 'utf8'));\nconst v2 = JSON.parse(fs.readFileSync('generated/index.v2.json', 'utf8'));\nif (v1.schemaVersion !== 1 || !Array.isArray(v1.games) || !Array.isArray(v1.devices) || !Array.isArray(v1.profiles)) throw new Error('Invalid V1 index');\nif (v2.schemaVersion !== 2 || !Array.isArray(v2.targets) || !Array.isArray(v2.devices) || !Array.isArray(v2.profiles)) throw new Error('Invalid V2 index');\nconsole.log('Registry indexes valid.');\n");
write(path.join(out, 'tools', 'build-index.mjs'), "console.log('Build indexes from reviewed source files using the registry validation tool.');\n");
write(path.join(out, 'README.md'), '# Adaptive Profiles Registry\n\nThis is the prepared public registry export for Bbrizly/Adaptive-Profiles-Registry. Git remains the canonical source for reviewed targets, devices, and profile snapshots.\n\nGenerated indexes are deterministic. Run the application repository validation before publishing this export.\n');
write(path.join(out, 'CONTRIBUTING.md'), '# Contributing\n\nAdd a target, device, or profile through a pull request. CI validates schemas, references, CSV snapshots, hashes, and generated indexes before a maintainer reviews the change.\n');
write(path.join(out, 'SECURITY.md'), '# Security\n\nDo not include private health information in public profiles. Report registry security issues privately to the maintainer.\n');
write(path.join(out, '.github', 'CODEOWNERS'), '* @Bbrizly\n');
write(path.join(out, '.github', 'workflows', 'validate.yml'), `name: Validate registry\n\non:\n  pull_request:\n  push:\n    branches: [main]\n\npermissions:\n  contents: read\n\njobs:\n  validate:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - uses: actions/setup-node@v4\n        with: { node-version: 22 }\n      - run: node tools/validate.mjs --check-index --check-v2\n`);
console.log(`Prepared ${out}`);
