// Executor lab: direct attempts to bypass the guard. Each one must be refused.
import type { World } from './types';
import { execute } from './executor';
import { signToken } from './token';
import { postRefund } from './storeApi';
import { nextId } from './world';

export interface LabResult { name: string; expect: string; actual: string; pass: boolean; detail: string }

export async function runExecutorLab(w: World): Promise<LabResult[]> {
  const out: LabResult[] = [];
  const args = { order_id: 1057, amount: 100, reason: 'lab' };
  const uid = () => `lab-${nextId(w)}`;

  const direct = postRefund(w, 'lab', 'agent-guess', 1057, 100, uid());
  out.push({ name: 'Agent writes directly (guessed credential)', expect: 'HTTP 403', actual: `HTTP ${direct.status}`, pass: direct.status === 403,
    detail: 'The agent has no write credential. Only the Executor does.' });

  const r1 = await execute(w, uid(), 'issue_refund', args, null, { by: 'lab' });
  out.push({ name: 'Execute without a verdict token', expect: 'refused: no_token', actual: r1.refused ?? 'executed', pass: r1.refused === 'no_token',
    detail: 'No verdict, no write.' });

  const tok = await signToken(w, uid(), 'ALLOW', 'issue_refund', args);
  const r2 = await execute(w, tok.proposal_id, 'issue_refund', { ...args, amount: 250 }, tok, { by: 'lab' });
  out.push({ name: 'Verified ₹100, then execute ₹250 with the same token', expect: 'refused: args_mismatch', actual: r2.refused ?? 'executed', pass: r2.refused === 'args_mismatch',
    detail: 'The token is bound to hash(tool, args). A changed amount is a different hash.' });

  const r3 = await execute(w, tok.proposal_id, 'issue_refund', args, { ...tok, sig: 'f'.repeat(64) }, { by: 'lab' });
  out.push({ name: 'Forged signature', expect: 'refused: bad_signature', actual: r3.refused ?? 'executed', pass: r3.refused === 'bad_signature',
    detail: 'The HMAC key never leaves the verdict/executor code.' });

  const tok2 = await signToken(w, uid(), 'ALLOW', 'issue_refund', args);
  const before = w.refunds.length;
  const a1 = await execute(w, tok2.proposal_id, 'issue_refund', args, tok2, { by: 'lab' });
  const a2 = await execute(w, tok2.proposal_id, 'issue_refund', args, tok2, { by: 'lab' });
  const created = w.refunds.length - before;
  out.push({ name: 'Replay the same valid token twice', expect: 'one refund, same reference', actual: a1.ok ? `${created} refund(s), refs ${a1.ref} / ${a2.ref}` : `first call failed: ${a1.message}`,
    pass: a1.ok && a2.ok && a1.ref === a2.ref && created === 1, detail: 'Writes are idempotent: the proposal id is the idempotency key, so a retry cannot double-refund.' });
  return out;
}
