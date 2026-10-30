// Append-only action log, hash-chained: each row includes the previous row's hash, so edits are detectable.
import type { World } from './types';
import { canonical, sha256Hex } from './crypto';
import { bump } from './world';

const rowHash = (prev: string, ts: string, event: string, summary: string, payload: Record<string, unknown>) =>
  sha256Hex([prev, ts, event, summary, canonical(payload)].join('|'));

export async function appendLog(w: World, event: string, summary: string, payload: Record<string, unknown> = {}) {
  const prev = w.log.length ? w.log[w.log.length - 1].hash : 'GENESIS';
  const ts = new Date().toISOString().slice(11, 19);
  const hash = await rowHash(prev, ts, event, summary, payload);
  w.log.push({ i: w.log.length, ts, event, summary, payload, prev, hash });
  bump(w);
}

export async function verifyChain(w: World): Promise<{ ok: boolean; brokenAt?: number; checked: number }> {
  let prev = 'GENESIS';
  for (const r of w.log) {
    const h = await rowHash(prev, r.ts, r.event, r.summary, r.payload);
    if (r.prev !== prev || r.hash !== h) return { ok: false, brokenAt: r.i, checked: r.i };
    prev = r.hash;
  }
  return { ok: true, checked: w.log.length };
}

// Demo only: edit a row in place to show that the chain detects it.
export function tamperRow(w: World, i: number) {
  const r = w.log[i];
  if (!r) return;
  r.summary = r.summary + ' [edited]';
  bump(w);
}
