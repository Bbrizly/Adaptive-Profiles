export type TargetKind = 'game' | 'software';
export type Platform = 'pc' | 'xbox' | 'playstation' | 'switch' | 'macos' | 'linux' | string;
export type MappingBehavior = 'normal' | 'tap' | 'hold' | 'toggle' | 'repeat';

export interface TargetAction { id: string; name: string; category: string; kind: string }
export interface Target {
  schemaVersion: 2; id: string; kind: TargetKind; name: string; aliases: string[];
  categories: string[]; platforms: Platform[]; actions: TargetAction[];
  source: { url: string; title: string };
  controls?: Array<{ platform: string; scheme: string; bindings: Array<{ action: string; control: string }>; source: Record<string, string> }>;
}
export interface AdaptiveDevice {
  schemaVersion: 2; id: string; name: string; manufacturer: string;
  inputs: Array<{ id: string; name: string; kind: 'digital' | 'axis-1d' | 'axis-2d' | 'pointer' }>;
}
export interface AdaptiveProfile {
  schemaVersion: 2; id: string; title: string; description: string;
  target: { kind: TargetKind; id: string }; platform: string; deviceId: string;
  semanticStatus: 'unmapped' | 'mapped'; mappings: Array<{ input: string; action: string; behavior: MappingBehavior }>;
  tags: string[]; contributor: { displayName: string; github?: string };
  source: { type: 'google-sheet' | 'csv'; url?: string };
  snapshot: { file: 'profile.csv'; sha256: string }; revision: number; createdAt: string; updatedAt: string;
  gameId?: string;
}
export interface RegistryIndexV2 { schemaVersion: 2; targets: Target[]; devices: AdaptiveDevice[]; profiles: AdaptiveProfile[] }
export interface RegistryIndexV1 { schemaVersion: 1; games: any[]; devices: any[]; profiles: any[] }
export interface SearchResults { targets: Target[]; devices: AdaptiveDevice[]; profiles: AdaptiveProfile[] }
