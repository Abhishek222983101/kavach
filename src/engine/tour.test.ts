import { describe, expect, it } from 'vitest';
import { createWorld } from './world';
import { resolveApproval, sendMessage } from './pipeline';
import { TOUR } from '../content/tour';

const run = async (n: number) => {
  const s = TOUR[n - 1];
  const w = createWorld(); w.settings.speed = 0;
  const turn = await sendMessage(w, s.customer!, s.text!, { photo: s.photo, override: { mode: s.mode, guard: s.guard, courierDown: false } });
  return { w, turn };
};

describe('the guided tour promises what the pages say', () => {
  it('step 1: a small clean refund is allowed and executes', async () => {
    const { turn, w } = await run(1);
    expect(turn.verdict).toBe('ALLOW'); expect(turn.executed).toBe(true);
    expect(w.refunds.find(r => r.order === 1043)?.amount).toBe(399);
  });
  it('step 2: a big refund pauses, and only runs after the seller approves', async () => {
    const { turn, w } = await run(2);
    expect(turn.verdict).toBe('ESCALATE'); expect(turn.status).toBe('pending'); expect(turn.executed).toBe(false);
    expect(w.refunds.some(r => r.order === 1042)).toBe(false);
    await resolveApproval(w, w.approvals[0].id, 'approve');
    expect(w.refunds.find(r => r.order === 1042)?.amount).toBe(1299);
  });
  it('step 3: the made-up 30-day policy is blocked (quote not found + outside window)', async () => {
    const { turn, w } = await run(3);
    expect(turn.verdict).toBe('BLOCK'); expect([...turn.reasons].sort()).toEqual(['policy', 'temporal']);
    expect(w.refunds.some(r => r.order === 1045)).toBe(false);
  });
  it('step 4: the instruction hidden in the note is blocked on the amount', async () => {
    const { turn, w } = await run(4);
    expect(turn.verdict).toBe('BLOCK'); expect(turn.reasons).toEqual(['monetary']);
    expect(w.refunds.some(r => r.order === 1051)).toBe(false);
    expect(turn.steps.some(s => s.title.includes('Untrusted text in the order note'))).toBe(true);
  });
  it('step 5: with Kavach off the same kind of attack pays out', async () => {
    const { turn, w } = await run(5);
    expect(turn.unguarded).toBe(true); expect(turn.executed).toBe(true);
    expect(w.refunds.find(r => r.order === 1056)?.amount).toBe(1000);
  });
});
