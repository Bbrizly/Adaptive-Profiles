import type { AdaptiveProfile, AdaptiveDevice, Target } from '@adaptive-profiles/registry-types';
import type { ReactNode } from 'react';

export interface ProfileVisualizationModel { modes: Array<{ id: string; name: string }>; mappings: Array<{ input: string; action: string; behavior: string }>; warnings: string[] }
export interface ProfileEngineAdapter { parseSnapshot(input: Uint8Array | string): Promise<ProfileVisualizationModel>; validateSnapshot(input: Uint8Array | string): Promise<{ valid: boolean; errors: string[] }> }
export const semanticProfileAdapter: ProfileEngineAdapter = {
  async parseSnapshot() { return { modes: [], mappings: [], warnings: ['Detailed CSV visualization is not available yet.'] }; },
  async validateSnapshot() { return { valid: true, errors: [] }; }
};

export function MappingTable({ profile, target, device }: { profile: AdaptiveProfile; target?: Target; device?: AdaptiveDevice }): ReactNode {
  if (!profile.mappings.length) return <div className="viewer-empty">Detailed visualization is not available for this profile yet.<br /><a href={`/api/v2/profiles/${profile.id}/csv`}>Download CSV</a> or <a href={`qcm://profile/${profile.id}`}>open in QCM</a>.</div>;
  const actions = new Map(target?.actions.map(action => [action.id, action.name]));
  const inputs = new Map(device?.inputs.map(input => [input.id, input.name]));
  return <div className="mapping-table" role="table" aria-label="Profile mappings"><div className="mapping-row mapping-head" role="row"><span>Input</span><span>Action</span><span>Behavior</span></div>{profile.mappings.map((mapping) => <div className="mapping-row" role="row" key={`${mapping.input}-${mapping.action}`}><span>{inputs.get(mapping.input) || mapping.input}</span><span>{actions.get(mapping.action) || mapping.action}</span><span>{mapping.behavior}</span></div>)}</div>;
}

export function SnapshotInfo({ profile }: { profile: AdaptiveProfile }): ReactNode {
  return <dl className="snapshot-info"><div><dt>Revision</dt><dd>{profile.revision}</dd></div><div><dt>SHA-256</dt><dd><code>{profile.snapshot.sha256 || 'Not available'}</code></dd></div><div><dt>Updated</dt><dd>{new Date(profile.updatedAt || profile.createdAt).toLocaleDateString()}</dd></div></dl>;
}
