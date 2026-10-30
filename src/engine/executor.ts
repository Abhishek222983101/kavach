// The Executor is the only code path that holds the write credential.
// Writes run only with a valid verdict token bound to the exact (tool, args).
import type { Token, World, WriteTool } from './types';
import { checkToken } from './token';
import { patchAddress, postCancel, postRefund, postReturn } from './storeApi';
import { appendLog } from './log';

export interface ExecResult { ok: boolean; refused?: string; ref?: string; message: string; unguarded?: boolean }

function callStore(w: World, tool: WriteTool, args: Record<string, string | number>, idem: string, by: 'executor' | 'lab') {
  const id = Number(args.order_id);
  switch (tool) {
    case 'issue_refund': { const r = postRefund(w, by, w.writeCred, id, Number(args.amount), idem); return { status: r.status, ref: r.body.refund_id, err: r.body.error }; }
    case 'create_return_pickup': { const r = postReturn(w, by, w.writeCred, id, idem); return { status: r.status, ref: r.body.pickup_id, err: r.body.error }; }
    case 'update_address': { const r = patchAddress(w, by, w.writeCred, id, String(args.address)); return { status: r.status, ref: 'ok', err: r.body.error }; }
    case 'cancel_order': { const r = postCancel(w, by, w.writeCred, id); return { status: r.status, ref: 'ok', err: r.body.error }; }
  }
}

export async function execute(
  w: World, proposalId: string, tool: WriteTool, args: Record<string, string | number>, token: Token | null,
  opts: { unguarded?: boolean; by?: 'executor' | 'lab' } = {},
): Promise<ExecResult> {
  const by = opts.by ?? 'executor';
  if (!w.settings.writesEnabled) {
    await appendLog(w, 'execute', `REFUSED ${tool}: kill switch is on`, { tool, reason: 'kill_switch' });
    return { ok: false, refused: 'kill_switch', message: 'Kill switch is on: all writes are refused.' };
  }
  if (!opts.unguarded) {
    const c = await checkToken(w, token, tool, args);
    if (!c.ok) {
      await appendLog(w, 'execute', `REFUSED ${tool}: ${c.reason}`, { tool, reason: c.reason });
      return { ok: false, refused: c.reason, message: `Executor refused: ${c.reason}` };
    }
  }
  const idem = token?.proposal_id ?? proposalId;
  const r = callStore(w, tool, args, idem, by);
  if (r.status >= 400) {
    await appendLog(w, 'execute', `FAILED ${tool}: store returned ${r.status} ${r.err}`, { tool, status: r.status });
    return { ok: false, refused: 'store_error', message: `Store returned ${r.status}: ${r.err}` };
  }
  await appendLog(w, 'execute', `${opts.unguarded ? 'UNGUARDED ' : ''}EXECUTED ${tool} ${JSON.stringify(args)} → ${r.ref}`, { tool, args, ref: r.ref, unguarded: !!opts.unguarded });
  return { ok: true, ref: r.ref, unguarded: opts.unguarded, message: `${tool} executed (${r.ref})` };
}
