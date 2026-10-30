import { useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import { world } from '../engine/singleton';
import { subscribe } from '../engine/world';
import type { World } from '../engine/types';

export function useWorld(): World {
  useSyncExternalStore(cb => subscribe(world, cb), () => world.version);
  return world;
}

export function Badge({ kind, children, title }: { kind: string; children: ReactNode; title?: string }) {
  return <span className={`badge b-${kind}`} title={title}>{children}</span>;
}

export function Seg<T extends string>({ value, options, onChange, label }: {
  value: T; options: { v: T; label: string; tone?: string }[]; onChange: (v: T) => void; label?: string;
}) {
  return (
    <div className="seg-wrap">
      {label && <span className="seg-label">{label}</span>}
      <div className="seg" role="group" aria-label={label}>
        {options.map(o => (
          <button key={o.v} className={`seg-btn ${value === o.v ? 'on' : ''} ${o.tone ?? ''}`} onClick={() => onChange(o.v)}>{o.label}</button>
        ))}
      </div>
    </div>
  );
}

export function Toggle({ on, onChange, label, hint }: { on: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <label className="toggle" title={hint}>
      <input type="checkbox" checked={on} onChange={e => onChange(e.target.checked)} />
      <span className="track"><span className="thumb" /></span>
      <span className="toggle-label">{label}</span>
    </label>
  );
}

export const verdictKind = (v: string) => (v === 'ALLOW' ? 'allow' : v === 'ESCALATE' ? 'escalate' : v === 'BLOCK' ? 'block' : 'info');
