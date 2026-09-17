import { describe, expect, it } from 'vitest';
import { targetName } from '../lib/api';
describe('registry helpers', () => { it('resolves target names', () => expect(targetName({ schemaVersion: 2, targets: [{ schemaVersion: 2, id: 'minecraft', kind: 'game', name: 'Minecraft', aliases: [], categories: [], platforms: [], actions: [], source: { url: 'https://example.com', title: 'Example' } }], devices: [], profiles: [] }, 'minecraft')).toBe('Minecraft')); });
