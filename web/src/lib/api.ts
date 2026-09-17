import type { RegistryIndexV2, Target, AdaptiveDevice, AdaptiveProfile, SearchResults } from '@adaptive-profiles/registry-types';

const fallback = 'https://raw.githubusercontent.com/Bbrizly/Adaptive-Profiles/main/generated/index.v2.json';
async function get<T>(path: string): Promise<T> {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`Request failed (${response.status})`);
  const body = await response.json();
  return body.data as T;
}
export async function loadRegistry(): Promise<RegistryIndexV2> {
  try { return await get<RegistryIndexV2>('/api/v2/index'); }
  catch { const response = await fetch(fallback); if (!response.ok) throw new Error('The registry is temporarily unavailable.'); return response.json(); }
}
export const api = { get, search: (q: string) => get<SearchResults>(`/api/v2/search?q=${encodeURIComponent(q)}`) };
export function targetName(registry: RegistryIndexV2, id: string) { return registry.targets.find(item => item.id === id)?.name || id; }
export function deviceName(registry: RegistryIndexV2, id: string) { return registry.devices.find(item => item.id === id)?.name || id; }
export type { Target, AdaptiveDevice, AdaptiveProfile };
