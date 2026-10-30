// Signed verdict token bound to hash(tool, args). The executor recomputes the hash and refuses any mismatch.
import type { Token, World, WriteTool } from './types';
import { canonical, hmacHex, sha256Hex } from './crypto';

export const argsHash = (tool: WriteTool | string, args: Record<string, string | number>) =>
  sha256Hex(canonical({ tool, args }));

const payloadOf = (t: Pick<Token, 'proposal_id' | 'verdict' | 'args_hash' | 'exp'>) =>
  canonical({ proposal_id: t.proposal_id, verdict: t.verdict, args_hash: t.args_hash, exp: t.exp });

export async function signToken(
  w: World, proposalId: string, verdict: 'ALLOW' | 'APPROVED',
  tool: WriteTool, args: Record<string, string | number>, ttlMs = 10 * 60 * 1000,
): Promise<Token> {
  const base = { proposal_id: proposalId, verdict, args_hash: await argsHash(tool, args), exp: Date.now() + ttlMs };
  return { ...base, sig: await hmacHex(w, payloadOf(base)) };
}

export type TokenCheck = { ok: true } | { ok: false; reason: 'no_token' | 'bad_signature' | 'args_mismatch' | 'expired' | 'not_approved' };
export async function checkToken(
  w: World, token: Token | null, tool: WriteTool, args: Record<string, string | number>,
): Promise<TokenCheck> {
  if (!token) return { ok: false, reason: 'no_token' };
  const expected = await hmacHex(w, payloadOf(token));
  if (expected !== token.sig) return { ok: false, reason: 'bad_signature' };
  if (Date.now() > token.exp) return { ok: false, reason: 'expired' };
  if (token.args_hash !== await argsHash(tool, args)) return { ok: false, reason: 'args_mismatch' };
  if (token.verdict !== 'ALLOW' && token.verdict !== 'APPROVED') return { ok: false, reason: 'not_approved' };
  return { ok: true };
}
