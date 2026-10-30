// The Verifier. Re-fetches every fact from the system of record (never trusts the agent's copy).
//   T0: deterministic checks.   T1: policy grounding with quote-or-fail.   (T2 careful consensus: not in this demo.)
// Fail-closed: any error or unavailable source means ESCALATE, never ALLOW.
import type { Claim, ClaimResult, Proposal, RiskFeatures, VerifyOutcome, World } from './types';
import { getCustomerRefunds, getOrder, getRefunds, getShipment } from './storeApi';
import type { OrderView, ShipmentView } from './storeApi';
import { inr } from './world';

class SourceUnavailable extends Error {}
const norm = (s: string) => s.replace(/\s+/g, ' ').trim();

function checkClaim(
  w: World, c: Claim, p: Proposal, caller: string,
  order: OrderView | null, ship: ShipmentView | null, priorRefunds: { amount: number }[],
): ClaimResult {
  const id = Number(p.args.order_id);
  const amount = Number(p.args.amount ?? 0);
  let ok = false, why = '', tier: 'T0' | 'T1' = 'T0';
  switch (c.kind) {
    case 'ownership':
      ok = !!order && order.customer_id === caller;
      why = !order ? `order ${id} not found` : ok ? `order ${id} belongs to the caller (${caller})` : `order ${id} belongs to ${order.customer_id}, not ${caller}`;
      break;
    case 'state':
      if (!order) { why = `order ${id} not found`; break; }
      if (c.expect === 'delivered') {
        ok = ship?.status === 'delivered';
        why = ok ? `courier says delivered ${ship!.delivered_days_ago} day(s) ago` : `courier status is "${ship?.status ?? 'unknown'}", not delivered`;
      } else {
        ok = order.status === 'placed' || order.status === 'packed';
        why = ok ? `order status "${order.status}": not yet dispatched` : `order status "${order.status}": already dispatched`;
      }
      break;
    case 'temporal': {
      const d = ship?.delivered_days_ago;
      if (d == null) { why = 'no delivery date on record'; break; }
      ok = d <= w.settings.windowDays;
      why = `${d} day(s) since delivery vs the ${w.settings.windowDays}-day window` + (c.source === 'customer' ? ' (customer claim ignored; checked against records)' : '');
      break;
    }
    case 'monetary': {
      if (!order) { why = 'order not found'; break; }
      const left = order.paid - order.refunded;
      ok = amount > 0 && amount <= left;
      why = `${inr(amount)} requested vs ${inr(left)} refundable (paid ${inr(order.paid)} − refunded ${inr(order.refunded)})`;
      break;
    }
    case 'duplicate':
      ok = !priorRefunds.some(r => r.amount === amount);
      why = ok ? 'no earlier refund of this amount on the order' : `an earlier refund of ${inr(amount)} already exists on this order`;
      break;
    case 'eligibility':
      ok = !!order && !order.perishable;
      why = !order ? 'order not found' : ok ? 'item is not perishable' : 'item is perishable and not returnable';
      break;
    case 'evidence':
      ok = w.photos.has(id);
      why = ok ? 'photo is on file for this order' : 'no photo on file for this order';
      break;
    case 'authority':
      ok = false;
      why = 'authority claimed in customer text cannot widen limits or replace a record';
      break;
    case 'policy': {
      tier = 'T1';
      const clause = w.policy.find(x => x.id === c.clause);
      if (c.source === 'customer') { why = 'policy claim sourced from customer text is not accepted'; break; }
      if (!clause || !c.quote) { why = 'no clause or quote supplied'; break; }
      ok = norm(clause.text).includes(norm(c.quote));
      why = ok ? `quote found verbatim in clause ${clause.id}` : `quote NOT found in clause ${clause.id}. Quoted: "${c.quote}". Actual: "${clause.text}"`;
      break;
    }
  }
  return { claim: c, ok, why, tier };
}

export function verify(w: World, p: Proposal, caller: string): VerifyOutcome {
  const empty: RiskFeatures = { amountRatio: null, overCap: false, refundsRecent: 0, injectionFlags: p.injectionFlags, verifiedFraction: 0 };
  try {
    const id = Number(p.args.order_id);
    const oRes = getOrder(w, 'verifier', id);
    const order = oRes.status === 200 ? (oRes.body as OrderView) : null;
    let ship: ShipmentView | null = null;
    if (order?.awb && (p.tool === 'issue_refund' || p.tool === 'create_return_pickup')) {
      const sRes = getShipment(w, 'verifier', order.awb);
      if (sRes.status >= 500) throw new SourceUnavailable('courier');
      if (sRes.status === 200) ship = sRes.body as ShipmentView;
    }
    const prior = p.tool === 'issue_refund' ? getRefunds(w, 'verifier', id).body : [];
    const results = p.claims.map(c => checkClaim(w, c, p, caller, order, ship, prior));

    const recent = p.tool === 'issue_refund' ? getCustomerRefunds(w, 'verifier', caller).body.count : 0;
    const amount = Number(p.args.amount ?? 0);
    const risk: RiskFeatures = {
      amountRatio: p.tool === 'issue_refund' && order ? Math.round((amount / order.paid) * 100) / 100 : null,
      overCap: p.tool === 'issue_refund' && amount > w.settings.autoLimit,
      refundsRecent: recent,
      injectionFlags: p.injectionFlags,
      verifiedFraction: results.length ? results.filter(r => r.ok).length / results.length : 0,
    };
    const tier = results.some(r => r.tier === 'T1') ? 'T0 + T1' : 'T0';

    const failed = results.filter(r => !r.ok);
    if (failed.length) {
      return { verdict: 'BLOCK', reasons: [...new Set(failed.map(r => r.claim.kind))], results, risk, tier };
    }
    const reasons: string[] = [];
    if (risk.overCap) reasons.push('over_auto_limit');
    if (p.tool === 'issue_refund' && recent >= 1) reasons.push('refund_frequency');
    if (p.injectionFlags.length) reasons.push('injection_flags');
    return { verdict: reasons.length ? 'ESCALATE' : 'ALLOW', reasons, results, risk, tier };
  } catch (e) {
    return {
      verdict: 'ESCALATE', reasons: [e instanceof SourceUnavailable ? 'source_unavailable' : 'verifier_error'],
      results: [], risk: empty, tier: 'T0',
    };
  }
}
