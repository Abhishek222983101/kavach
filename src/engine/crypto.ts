// Canonical JSON + SHA-256 + HMAC-SHA256 using WebCrypto (browser and Node 22).
import type { World } from './types';

export function canonical(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']';
  const o = v as Record<string, unknown>;
  return '{' + Object.keys(o).sort().map(k => JSON.stringify(k) + ':' + canonical(o[k])).join(',') + '}';
}

const enc = new TextEncoder();
const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');

export async function sha256Hex(s: string): Promise<string> {
  return hex(await crypto.subtle.digest('SHA-256', enc.encode(s)));
}

// One signing key per world, held outside the world object (only the verdict/executor code touches it).
const keys = new WeakMap<World, Promise<CryptoKey>>();
function keyFor(w: World): Promise<CryptoKey> {
  let k = keys.get(w);
  if (!k) {
    const raw = crypto.getRandomValues(new Uint8Array(32));
    k = crypto.subtle.importKey('raw', raw, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    keys.set(w, k);
  }
  return k;
}
export async function hmacHex(w: World, s: string): Promise<string> {
  return hex(await crypto.subtle.sign('HMAC', await keyFor(w), enc.encode(s)));
}
export function rotateKey(w: World) { keys.delete(w); }

export function randomHex(n: number): string {
  return [...crypto.getRandomValues(new Uint8Array(n))].map(x => x.toString(16).padStart(2, '0')).join('');
}
export const short = (h: string, n = 10) => h.slice(0, n) + '…';
