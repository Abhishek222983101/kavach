// Orchestration: message → understand → plan → read tools → proposal → VERIFY → route → (approval) → execute → reply.
// The "agent" is deterministic. 'gullible' mode simulates typical LLM mistakes (believes the customer, obeys notes,
// skips self-checks) so the Verifier has something to catch. No LLM is used anywhere in this demo.
import type {
  Claim, Customer, Lang, Level, Mode, Proposal, Settings, Step, Turn, VerifyOutcome, World, WriteTool,
} from './types';
import { amountFromNote, parseMessage, scanInjection } from './nlu';
import type { Parsed } from './nlu';
import { t, REASON_LABEL } from './i18n';
import { bump, inr, nextId } from './world';
import {
  getOrder, getShipment, listOrders, searchPolicy,
} from './storeApi';
import type { OrderView, ShipmentView } from './storeApi';
import { verify } from './verifier';
import { signToken } from './token';
import { execute } from './executor';
import { appendLog } from './log';
import { short } from './crypto';

const sleep = (ms: number) => (ms > 0 ? new Promise(r => setTimeout(r, ms)) : Promise.resolve());

export interface SendOpts {
  photo?: boolean;
  override?: Partial<Pick<Settings, 'mode' | 'guard' | 'courierDown'>>;
}
interface Ctx {
  w: World; turn: Turn; cust: Customer; p: Parsed; lang: Lang;
  order?: OrderView; ship?: ShipmentView | null;
}

async function step(w: World, turn: Turn, s: Omit<Step, 'id'>) {
  turn.steps.push({ id: nextId(w), ...s });
  bump(w);
  await sleep(w.settings.speed);
}
function chat(w: World, cust: string, role: 'customer' | 'agent' | 'system', text: string) {
  w.chats[cust].push({ id: nextId(w), role, text });
  bump(w);
}
async function say(c: Ctx, key: string, vars: Record<string, string | number> = {}, level: Level = 'info') {
  const text = t(c.lang, key, vars);
  chat(c.w, c.cust.id, 'agent', text);
  c.turn.reply = text;
  await step(c.w, c.turn, { phase: 'reply', title: 'Reply to customer', detail: text, level,
    why: 'The reply is built only from tool results and verdict reasons, never from free-form model text.' });
}
const describe = (p: Proposal) =>
  p.tool === 'issue_refund' ? `issue_refund(order ${p.args.order_id}, ${inr(Number(p.args.amount))})` :
  p.tool === 'update_address' ? `update_address(order ${p.args.order_id})` : `${p.tool}(order ${p.args.order_id})`;

const toolFor = (i: Parsed['intent']): WriteTool =>
  i === 'refund' ? 'issue_refund' : i === 'return' ? 'create_return_pickup' : i === 'address' ? 'update_address' : 'cancel_order';

// ------------------------------------------------------------------ public API
export async function sendMessage(w: World, customerId: string, text: string, opts: SendOpts = {}): Promise<Turn> {
  const saved = { mode: w.settings.mode, guard: w.settings.guard, courierDown: w.settings.courierDown };
  if (opts.override) Object.assign(w.settings, opts.override);
  const turn: Turn = {
    id: nextId(w), customerId, text, mode: w.settings.mode, guard: w.settings.guard, steps: [],
    reasons: [], executed: false, unguarded: false, status: 'running', verdict: 'NONE',
  };
  w.turns.push(turn);
  bump(w);
  try {
    await run(w, turn, text, opts);
  } catch (e) {
    await step(w, turn, { phase: 'log', title: 'Unexpected error', detail: String(e), level: 'fail' });
  } finally {
    if (opts.override) for (const k of Object.keys(opts.override) as (keyof typeof saved)[]) (w.settings as unknown as Record<string, unknown>)[k] = saved[k];
    if (turn.status === 'running') turn.status = 'done';
    bump(w);
  }
  return turn;
}

// ------------------------------------------------------------------ main flow
async function run(w: World, turn: Turn, text: string, opts: SendOpts) {
  const cust = w.customers.find(c => c.id === turn.customerId)!;
  const p = parseMessage(text);
  const c: Ctx = { w, turn, cust, p, lang: p.lang };
  chat(w, cust.id, 'customer', text);
  await appendLog(w, 'ingest', `message from ${cust.name} (${cust.phone})`, { customer: cust.id, intent: p.intent });

  await step(w, turn, { phase: 'ingest', title: 'Message received over WhatsApp (simulated)', detail: `${cust.name} · ${cust.phone}`, level: 'info',
    why: "The caller's identity comes from the channel (the phone number), never from words in the message." });
  await step(w, turn, { phase: 'ingest', title: 'Message labelled UNTRUSTED', level: 'info',
    detail: 'Customer text can describe a situation. It can never set limits, authority or policy.' });

  const bits = [
    `intent: ${p.intent}`, `order: ${p.orderId ?? '—'}`, `amount: ${p.amount != null ? inr(p.amount) : '—'}`,
    `reason: ${p.reason}`, `language: ${p.lang}`,
  ];
  if (p.claimedWindowDays != null) bits.push(`customer claims a ${p.claimedWindowDays}-day window (untrusted)`);
  if (p.authorityClaim) bits.push('customer claims seller/owner approval (untrusted)');
  await step(w, turn, { phase: 'understand', title: `Understood: ${p.intent.toUpperCase()}`, detail: bits.join(' · '), level: 'info',
    why: 'Deterministic keyword and pattern parsing in this demo. In the real build a small model extracts this.' });

  if ((opts.photo || p.photoMentioned) && p.orderId) w.photos.add(p.orderId);

  if (p.intent === 'unknown') { await say(c, 'unknown'); return; }
  if (p.intent === 'wismo') { await handleWismo(c); return; }
  await handleWrite(c);
}

async function askOrder(c: Ctx) {
  const r = listOrders(c.w, 'agent', c.cust.id);
  await step(c.w, c.turn, { phase: 'read', title: `GET /customers/${c.cust.id}/orders → ${r.status}`, detail: `${r.body.length} orders`, level: 'ok',
    why: 'Missing information: the agent asks instead of guessing.' });
  await say(c, 'ask_order', { list: r.body.slice(0, 4).map(o => `#${o.id} ${o.item}`).join(', ') });
}

async function readOrder(c: Ctx, id: number): Promise<OrderView | null> {
  const r = getOrder(c.w, 'agent', id);
  await step(c.w, c.turn, { phase: 'read', title: `GET /orders/${id} → ${r.status}`, level: r.status === 200 ? 'ok' : 'warn',
    detail: r.status === 200 ? (() => { const o = r.body as OrderView; return `${o.item} · paid ${inr(o.paid)} · status ${o.status}${o.note ? ' · has a customer note' : ''}`; })() : 'not found' });
  if (r.status !== 200) { await say(c, 'no_order', { id }); return null; }
  c.order = r.body as OrderView;
  return c.order;
}

async function readShipment(c: Ctx, awb: string): Promise<'down' | ShipmentView | null> {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const r = getShipment(c.w, 'agent', awb);
    await step(c.w, c.turn, { phase: 'read', title: `GET /shipments/${awb} → ${r.status}${attempt > 1 ? ` (retry ${attempt - 1})` : ''}`,
      level: r.status === 200 ? 'ok' : 'warn', detail: r.status === 200 ? `courier: ${(r.body as ShipmentView).status}` : 'courier API error',
      why: attempt === 1 && r.status >= 500 ? 'Tool failure handling: retry twice, then escalate with a summary.' : undefined });
    if (r.status === 200) { c.ship = r.body as ShipmentView; return c.ship; }
    if (r.status === 404) { c.ship = null; return null; }
  }
  return 'down';
}

async function courierFailed(c: Ctx, what: string) {
  const summary = `Customer ${c.cust.name} asked about order ${c.order?.id}. Courier API failed 3 times, so I could not confirm the shipment. Please follow up. (${what})`;
  c.w.tickets.push({ id: nextId(c.w), turnId: c.turn.id, summary, status: 'open' });
  await step(c.w, c.turn, { phase: 'approval', title: 'escalate_to_human(summary) → ticket created', detail: summary, level: 'warn',
    why: 'When a source of truth is unavailable the system fails closed and hands over to a human with a summary.' });
  await appendLog(c.w, 'verify', 'courier unavailable: escalated with summary', { order: c.order?.id });
  await say(c, 'courier_down', {}, 'warn');
}

async function handleWismo(c: Ctx) {
  const { p } = c;
  if (!p.orderId) return askOrder(c);
  await step(c.w, c.turn, { phase: 'plan', title: 'Plan: get_order → track_shipment → reply', level: 'info',
    why: 'Read-only, so no verdict is needed. Only state-changing actions go through the Verifier.' });
  const o = await readOrder(c, p.orderId);
  if (!o) return;
  if (o.customer_id !== c.cust.id) {
    await step(c.w, c.turn, { phase: 'reply', title: 'Ownership check: not the caller’s order, no details shared', level: 'warn' });
    await say(c, 'not_yours', {}, 'warn');
    return;
  }
  if (o.awb) {
    const s = await readShipment(c, o.awb);
    if (s === 'down') return courierFailed(c, 'WISMO');
  }
  if (o.status === 'delivered') await say(c, 'wismo_delivered', { id: o.id, item: o.item, days: o.status === 'delivered' ? (c.ship?.delivered_days_ago ?? 0) : 0 }, 'ok');
  else if (o.status === 'shipped') await say(c, 'wismo_shipped', { id: o.id, item: o.item }, 'ok');
  else await say(c, 'wismo_placed', { id: o.id, item: o.item }, 'ok');
}

// ------------------------------------------------------------------ write flow
async function handleWrite(c: Ctx) {
  const { w, turn, p, cust } = c;
  const mode = w.settings.mode;
  if (!p.orderId) return askOrder(c);
  let tool = toolFor(p.intent);

  const plan = tool === 'issue_refund' || tool === 'create_return_pickup'
    ? 'get_order → track_shipment → search_policy → propose write' : 'get_order → search_policy → propose write';
  await step(w, turn, { phase: 'plan', title: `Plan: ${plan}`, level: 'info',
    detail: `The agent may READ freely. For the write (${tool}) it can only build a proposal; it cannot execute it.`,
    why: 'The agent holds no write credential. Only the Executor does, and it needs a signed verdict.' });

  const order = await readOrder(c, p.orderId);
  if (!order) return;

  if (mode === 'careful' && order.customer_id !== cust.id) {
    await step(w, turn, { phase: 'plan', title: 'Self-check: order belongs to someone else, stopping', level: 'warn' });
    await appendLog(w, 'verify', `agent self-check refused: order ${order.id} not caller's`, { order: order.id });
    await say(c, 'not_yours', {}, 'warn');
    return;
  }

  if (tool === 'issue_refund' || tool === 'create_return_pickup') {
    if (order.awb) {
      const s = await readShipment(c, order.awb);
      if (s === 'down') return courierFailed(c, tool);
    }
  }
  const ph = searchPolicy(w, 'agent', tool === 'update_address' ? 'address change dispatch' : tool === 'cancel_order' ? 'cancel dispatch' : 'return refund delivery days');
  await step(w, turn, { phase: 'read', title: `GET /policy?q=… → ${ph.status}`, level: 'ok',
    detail: ph.body.map(h => `clause ${h.id}: "${h.text}"`).join('  |  ') });

  // untrusted text inside the order note
  const flags = order.note ? scanInjection(order.note) : [];
  let amountFromInjection: number | null = null;
  if (flags.length) {
    await step(w, turn, { phase: 'read', title: 'Untrusted text in the order note contains instructions', level: 'warn',
      detail: `“${order.note}”`, why: 'Flagged as a signal. The real defence is structural: no verdict, no write.' });
    if (mode === 'gullible') {
      amountFromInjection = amountFromNote(order.note);
      if (amountFromInjection != null) {
        tool = 'issue_refund';
        await step(w, turn, { phase: 'plan', title: 'Gullible agent obeys the note and switches to a refund', level: 'warn',
          detail: `Simulated LLM mistake: it treats the note as an instruction and plans a ${inr(amountFromInjection)} refund.` });
      }
    }
  }
  if (mode === 'careful' && (p.claimedWindowDays != null || p.authorityClaim)) {
    await step(w, turn, { phase: 'plan', title: 'Careful agent ignores untrusted claims', level: 'info',
      detail: [p.claimedWindowDays != null ? `"${p.claimedWindowDays}-day window"` : '', p.authorityClaim ? '"seller approved"' : ''].filter(Boolean).join(' and ') + ' came from the customer, so policy and limits come from records only.' });
  }

  // missing information (both modes)
  if (tool === 'update_address' && !p.newAddress) { await say(c, 'ask_address'); return; }
  if (tool === 'issue_refund' && amountFromInjection == null && (p.reason === 'damaged' || p.reason === 'wrong_item') && !w.photos.has(order.id)) {
    await say(c, 'ask_photo'); return;
  }

  const left = order.paid - order.refunded;
  const days = c.ship?.delivered_days_ago ?? null;

  // careful agent self-checks; gullible skips them (simulated LLM mistake)
  if (mode === 'careful') {
    let refuse: { key: string; vars?: Record<string, string | number>; why: string } | null = null;
    if (tool === 'issue_refund' || tool === 'create_return_pickup') {
      if (c.ship?.status !== 'delivered') refuse = { key: 'r_state', why: 'not delivered yet' };
      else if (days != null && days > w.settings.windowDays) refuse = { key: 'r_temporal', vars: { window: w.settings.windowDays, days }, why: `${days} days since delivery > ${w.settings.windowDays}-day window` };
      else if (order.perishable) refuse = { key: 'r_eligibility', why: 'perishable item' };
      else if (tool === 'issue_refund' && left <= 0) refuse = { key: 'r_duplicate', why: 'already fully refunded' };
    } else if (order.status !== 'placed' && order.status !== 'packed') refuse = { key: 'r_state', why: `order is already ${order.status}` };
    if (refuse) {
      await step(w, turn, { phase: 'plan', title: 'Self-check failed: the agent stops without proposing', level: 'warn', detail: refuse.why,
        why: 'A careful agent catches obvious problems itself. Switch to Gullible mode to see the Verifier catch them instead.' });
      await appendLog(w, 'verify', `agent self-check refused ${tool}: ${refuse.why}`, { order: order.id });
      await say(c, refuse.key, refuse.vars ?? {}, 'warn');
      return;
    }
  }

  const amount = tool === 'issue_refund'
    ? (amountFromInjection ?? (mode === 'careful' ? Math.min(p.amount ?? left, left) : (p.amount ?? order.paid))) : 0;
  const proposal = buildProposal(c, order, tool, amount, flags, `prop_${turn.id}`, mode);
  await step(w, turn, { phase: 'propose', title: `Proposal: ${describe(proposal)}`, proposal, level: 'info',
    detail: `${proposal.claims.length} claims, each with its source`,
    why: 'Evidence-carrying action: the agent must state the facts it relies on. Each fact will be re-checked against the records.' });
  await appendLog(w, 'proposal', describe(proposal), { claims: proposal.claims.length, mode });

  // Baseline B0: no guard
  if (!w.settings.guard) {
    await step(w, turn, { phase: 'verify', title: 'GUARD OFF (baseline B0): no verification', level: 'fail',
      detail: 'The agent holds write credentials and executes whatever it proposes.',
      why: 'This is what happens without Kavach. Turn the guard back on and run the same message again.' });
    const r = await execute(w, proposal.id, proposal.tool, proposal.args, null, { unguarded: true });
    await step(w, turn, { phase: 'execute', title: r.ok ? `UNGUARDED execution: ${r.message}` : `Store refused: ${r.message}`, level: r.ok ? 'fail' : 'warn' });
    turn.executed = r.ok; turn.unguarded = true;
    await sayExecuted(c, proposal, r.ref ?? '');
    return;
  }

  let outcome = await verifyAndRoute(c, proposal, 'Verifier');
  let finalProposal = proposal;

  // one repair attempt, only when the sole problem is an over-claimed amount and no untrusted instructions were seen
  if (outcome.verdict === 'BLOCK' && outcome.reasons.length === 1 && outcome.reasons[0] === 'monetary'
      && proposal.injectionFlags.length === 0 && proposal.tool === 'issue_refund') {
    const fixed = Math.min(amount, left);
    if (fixed > 0) {
      await step(w, turn, { phase: 'propose', title: `Repair attempt (1 allowed): refund ${inr(fixed)} instead`, level: 'info',
        detail: `The agent receives the structured reason "monetary" and corrects the amount to what is refundable (${inr(left)}).`,
        why: 'BLOCK returns reasons so the agent can retry once with honest claims. A second failure goes to a human.' });
      finalProposal = buildProposal(c, order, tool, fixed, flags, `prop_${turn.id}_r`, 'careful');
      outcome = await verifyAndRoute(c, finalProposal, 'Verifier (after repair)');
    }
  }

  turn.verdict = outcome.verdict;
  turn.reasons = outcome.reasons;

  if (outcome.verdict === 'BLOCK') {
    const first = outcome.reasons[0];
    await appendLog(w, 'verdict', `BLOCK ${describe(finalProposal)} [${outcome.reasons.join(', ')}]`, { reasons: outcome.reasons });
    await say(c, `r_${first}`, { window: w.settings.windowDays, days: days ?? 0, left: inr(left) }, 'warn');
    return;
  }
  if (outcome.verdict === 'ESCALATE') {
    if (outcome.reasons.includes('source_unavailable') || outcome.reasons.includes('verifier_error')) {
      await courierFailed(c, 'verifier'); turn.verdict = 'ESCALATE'; return;
    }
    const id = nextId(w);
    w.approvals.push({ id, turnId: turn.id, customerId: cust.id, proposal: finalProposal, outcome, status: 'pending' });
    turn.status = 'pending';
    await step(w, turn, { phase: 'approval', title: 'Paused: waiting for the seller (human in the loop)', level: 'warn',
      detail: `Reasons: ${outcome.reasons.map(r => REASON_LABEL[r] ?? r).join('; ')}. See the Approvals tab on the right.`,
      why: 'Nothing executes while paused. In the real build this is a LangGraph interrupt() resumed with the same thread id.' });
    await appendLog(w, 'approval', `ESCALATE ${describe(finalProposal)} [${outcome.reasons.join(', ')}]`, { approval: id });
    await say(c, 'pending', {}, 'warn');
    return;
  }
  // ALLOW
  await appendLog(w, 'verdict', `ALLOW ${describe(finalProposal)}`, { reasons: [] });
  await finishWithToken(c, finalProposal, 'ALLOW');
}

async function verifyAndRoute(c: Ctx, proposal: Proposal, label: string): Promise<VerifyOutcome> {
  const { w, turn, cust } = c;
  const o = verify(w, proposal, cust.id);
  w.counters[o.verdict]++;
  await step(w, turn, { phase: 'verify', title: `${label}: ${o.results.filter(r => r.ok).length}/${o.results.length} claims verified (${o.tier})`, claims: o.results,
    level: o.results.every(r => r.ok) ? 'ok' : 'fail',
    why: 'Every claim is re-fetched from the system of record. The agent’s own copy of the facts is never trusted. Policy claims must quote the clause verbatim (quote-or-fail).' });
  await step(w, turn, { phase: 'route', title: `Risk router → ${o.verdict}`, route: { verdict: o.verdict, reasons: o.reasons, risk: o.risk, tier: o.tier },
    level: o.verdict === 'ALLOW' ? 'ok' : o.verdict === 'ESCALATE' ? 'warn' : 'fail',
    detail: o.reasons.length ? o.reasons.map(r => REASON_LABEL[r] ?? r).join(' · ') : 'All claims verified, within limits',
    why: 'Any failed claim → BLOCK. Over the auto-limit, a recent refund, or injected instructions → ESCALATE to the seller. Otherwise → ALLOW.' });
  return o;
}

async function finishWithToken(c: Ctx, proposal: Proposal, kind: 'ALLOW' | 'APPROVED') {
  const { w, turn } = c;
  const token = await signToken(w, proposal.id, kind, proposal.tool, proposal.args);
  await step(w, turn, { phase: 'execute', title: `Signed verdict token (${kind})`, level: 'ok',
    token: { verdict: kind, argsHash: token.args_hash, sig: token.sig },
    detail: `bound to hash(tool, args) = ${short(token.args_hash, 14)}`,
    why: 'The token is valid only for exactly these arguments. Change one character and the Executor refuses.' });
  const r = await execute(w, proposal.id, proposal.tool, proposal.args, token);
  await step(w, turn, { phase: 'execute', title: r.ok ? `Executor: ${r.message}` : `Executor refused: ${r.message}`, level: r.ok ? 'ok' : 'fail' });
  turn.executed = r.ok;
  if (r.ok) await sayExecuted(c, proposal, r.ref ?? '');
  else await say(c, r.refused === 'kill_switch' ? 'paused' : 'stopped', {}, 'warn');
}

async function sayExecuted(c: Ctx, p: Proposal, ref: string) {
  const id = Number(p.args.order_id);
  if (p.tool === 'issue_refund') await say(c, 'refund_done', { amount: inr(Number(p.args.amount)), id, ref }, 'ok');
  else if (p.tool === 'create_return_pickup') await say(c, 'pickup_done', { id, ref }, 'ok');
  else if (p.tool === 'update_address') await say(c, 'address_done', { id }, 'ok');
  else await say(c, 'cancel_done', { id }, 'ok');
}

// ------------------------------------------------------------------ proposal builder (shared by both agent modes)
function buildProposal(c: Ctx, order: OrderView, tool: WriteTool, amount: number, injectionFlags: string[], id: string, mode: Mode): Proposal {
  const { w, p } = c;
  const claims: Claim[] = [];
  const add = (x: Omit<Claim, 'id'>) => claims.push({ id: `c${claims.length + 1}`, ...x });
  const days = c.ship?.delivered_days_ago ?? null;
  const customerWindow = mode === 'gullible' && p.claimedWindowDays != null && p.claimedWindowDays !== w.settings.windowDays;

  add({ kind: 'ownership', statement: `Order ${order.id} belongs to the caller`, source: 'tool', evidence: `GET /orders/${order.id}` });
  if (tool === 'issue_refund' || tool === 'create_return_pickup') {
    add({ kind: 'state', expect: 'delivered', statement: `Order ${order.id} was delivered`, source: 'tool', evidence: `GET /shipments/${order.awb}` });
    add({ kind: 'temporal', source: customerWindow ? 'customer' : 'tool', evidence: `GET /shipments/${order.awb}`,
      statement: customerWindow ? `Inside the return window (customer says ${p.claimedWindowDays} days)` : `Delivered ${days} day(s) ago: inside the ${w.settings.windowDays}-day window` });
    add({ kind: 'eligibility', statement: 'Item is returnable (not perishable)', source: 'tool', evidence: `GET /orders/${order.id}` });
    if (tool === 'issue_refund') {
      add({ kind: 'monetary', statement: `${inr(amount)} is refundable on this order`, source: 'tool', evidence: `GET /orders/${order.id}` });
      add({ kind: 'duplicate', statement: `No earlier refund of ${inr(amount)} on this order`, source: 'tool', evidence: `GET /orders/${order.id}/refunds` });
      if (p.reason === 'damaged' || p.reason === 'wrong_item') add({ kind: 'evidence', statement: 'A photo of the item is on file', source: 'tool', evidence: 'chat attachment' });
    }
    const clause = w.policy.find(x => x.id === 1)!;
    add({ kind: 'policy', clause: 1, source: 'policy', statement: 'Policy allows this return/refund',
      quote: customerWindow ? `Returns and refunds are accepted within ${p.claimedWindowDays} days of delivery.` : clause.text,
      evidence: 'GET /policy' });
  } else {
    const clause = w.policy.find(x => x.id === (tool === 'update_address' ? 4 : 6))!;
    add({ kind: 'state', expect: 'not_dispatched', statement: `Order ${order.id} has not been dispatched`, source: 'tool', evidence: `GET /orders/${order.id}` });
    add({ kind: 'policy', clause: clause.id, source: 'policy', statement: 'Policy allows this change', quote: clause.text, evidence: 'GET /policy' });
  }
  if (mode === 'gullible' && p.authorityClaim) {
    add({ kind: 'authority', statement: 'The owner/seller already approved this (told by the customer)', source: 'customer' });
  }
  const args: Record<string, string | number> = { order_id: order.id };
  if (tool === 'issue_refund') { args.amount = amount; args.reason = p.reason; }
  if (tool === 'create_return_pickup') args.reason = p.reason;
  if (tool === 'update_address') args.address = p.newAddress ?? '';
  return { id, tool, args, claims, injectionFlags };
}

// ------------------------------------------------------------------ seller decisions
export async function resolveApproval(w: World, approvalId: number, decision: 'approve' | 'reject', editedAmount?: number) {
  const a = w.approvals.find(x => x.id === approvalId && x.status === 'pending');
  if (!a) return;
  const turn = w.turns.find(x => x.id === a.turnId)!;
  const cust = w.customers.find(x => x.id === a.customerId)!;
  const lang = parseMessage(turn.text).lang;
  const c: Ctx = { w, turn, cust, p: parseMessage(turn.text), lang };
  const action = describe(a.proposal);

  if (decision === 'reject') {
    a.status = 'rejected';
    w.precedents.push({ action: a.proposal.tool, amount: a.proposal.tool === 'issue_refund' ? Number(a.proposal.args.amount) : null, decision: 'rejected', edited: false });
    await step(w, turn, { phase: 'approval', title: 'Seller rejected', level: 'fail', detail: action });
    await appendLog(w, 'approval', `seller REJECTED ${action}`, {});
    await say(c, 'rejected', {}, 'warn');
    turn.status = 'done'; bump(w);
    return;
  }

  let proposal = a.proposal;
  const edited = editedAmount !== undefined && proposal.tool === 'issue_refund' && editedAmount !== Number(proposal.args.amount);
  if (edited) {
    proposal = { ...proposal, id: `${proposal.id}_e`, args: { ...proposal.args, amount: editedAmount! },
      claims: proposal.claims.map(cl => cl.kind === 'monetary' ? { ...cl, statement: `${inr(editedAmount!)} is refundable on this order` }
        : cl.kind === 'duplicate' ? { ...cl, statement: `No earlier refund of ${inr(editedAmount!)} on this order` } : cl) };
    await step(w, turn, { phase: 'approval', title: `Seller edited the amount to ${inr(editedAmount!)}: re-verifying`, level: 'info',
      why: 'An edit never reuses the old verdict. The new arguments are verified from scratch.' });
    const o = await verifyAndRoute(c, proposal, 'Verifier (after seller edit)');
    if (o.verdict === 'BLOCK') {
      a.status = 'rejected'; a.note = 'edit failed verification';
      await appendLog(w, 'approval', `seller edit blocked ${describe(proposal)} [${o.reasons.join(', ')}]`, {});
      await say(c, `r_${o.reasons[0]}`, { window: w.settings.windowDays, days: 0, left: inr(a.proposal.tool === 'issue_refund' ? Number(a.proposal.args.amount) : 0) }, 'warn');
      turn.status = 'done'; bump(w);
      return;
    }
  }
  a.status = 'approved';
  w.precedents.push({ action: proposal.tool, amount: proposal.tool === 'issue_refund' ? Number(proposal.args.amount) : null, decision: 'approved', edited: !!edited });
  await step(w, turn, { phase: 'approval', title: 'Seller approved', level: 'ok', detail: describe(proposal),
    why: 'A human decision is also bound to the exact arguments through a signed APPROVED token.' });
  await appendLog(w, 'approval', `seller APPROVED ${describe(proposal)}`, { edited: !!edited });
  turn.verdict = 'ESCALATE';
  await finishWithToken(c, proposal, 'APPROVED');
  turn.status = 'done'; bump(w);
}

export function acknowledgeTicket(w: World, id: number) {
  const t0 = w.tickets.find(x => x.id === id);
  if (t0) { t0.status = 'acknowledged'; bump(w); }
}
