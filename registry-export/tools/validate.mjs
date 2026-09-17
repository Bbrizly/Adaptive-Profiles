import fs from 'node:fs';
const v1 = JSON.parse(fs.readFileSync('generated/index.json', 'utf8'));
const v2 = JSON.parse(fs.readFileSync('generated/index.v2.json', 'utf8'));
if (v1.schemaVersion !== 1 || !Array.isArray(v1.games) || !Array.isArray(v1.devices) || !Array.isArray(v1.profiles)) throw new Error('Invalid V1 index');
if (v2.schemaVersion !== 2 || !Array.isArray(v2.targets) || !Array.isArray(v2.devices) || !Array.isArray(v2.profiles)) throw new Error('Invalid V2 index');
console.log('Registry indexes valid.');
