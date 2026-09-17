import type { AdaptiveDevice } from '@adaptive-profiles/registry-types';
import type { ReactNode } from 'react';

export function GenericInputList({ device }: { device: AdaptiveDevice }): ReactNode {
  return <ul className="input-list">{device.inputs.map(input => <li key={input.id}><span className={`input-kind kind-${input.kind}`}>{input.kind}</span><strong>{input.name}</strong></li>)}</ul>;
}
