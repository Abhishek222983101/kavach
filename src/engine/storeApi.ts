// Mock store API. Shaped like Shopify (orders), Shiprocket (tracking), Razorpay (refunds).
// Every call is recorded so the UI can show "real tool/API calls on mock store data".
// Write endpoints need the executor's credential: the agent code does not hold it.
import type { ApiCall, Order, World } from './types';
import { nextId, bump } from './world';

export interface Res<T = unknown> { status: number; body: T }
type By = ApiCall['by'];

function rec(w: World, by: By, method: string, path: string, status: number) {
  w.apiLog.push({ id: nextId(w), by, method, path, status });
  if (w.apiLog.length > 200) w.apiLog.shift();
}
const refundedTotal = (w: World, id: number) => w.refunds.filter(r => r.order === id).reduce((s, r) => s + r.amount, 0);
export const refundableLeft = (w: World, o: Order) => o.paid - refundedTotal(w, o.id);
export const refundsRecent = (w: World, customer: string) =>
  w.refunds.filter(r => r.customer === customer && r.daysAgo <= w.settings.freqDays).length;

export interface OrderView {
  id: number; customer_id: string; item: string; status: Order['status']; paid: number; refunded: number;
  perishable: boolean; note: string; awb: string | null; address: string;
}
const view = (w: World, o: Order): OrderView => ({
  id: o.id, customer_id: o.customer, item: o.item, status: o.status, paid: o.paid, refunded: refundedTotal(w, o.id),
  perishable: o.perishable, note: o.note, awb: o.awb, address: o.address,
});

export function getOrder(w: World, by: By, id: number): Res<OrderView | { error: string }> {
  const o = w.orders.get(id);
  const res: Res<OrderView | { error: string }> = o ? { status: 200, body: view(w, o) } : { status: 404, body: { error: 'order_not_found' } };
  rec(w, by, 'GET', `/orders/${id}`, res.status);
  return res;
}
export function listOrders(w: World, by: By, customer: string): Res<OrderView[]> {
  const list = [...w.orders.values()].filter(o => o.customer === customer).map(o => view(w, o));
  rec(w, by, 'GET', `/customers/${customer}/orders`, 200);
  return { status: 200, body: list };
}
export interface ShipmentView { awb: string; status: 'in_transit' | 'delivered'; delivered_days_ago: number | null }
export function getShipment(w: World, by: By, awb: string): Res<ShipmentView | { error: string }> {
  if (w.settings.courierDown) { rec(w, by, 'GET', `/shipments/${awb}`, 500); return { status: 500, body: { error: 'courier_unavailable' } }; }
  const o = [...w.orders.values()].find(x => x.awb === awb);
  if (!o) { rec(w, by, 'GET', `/shipments/${awb}`, 404); return { status: 404, body: { error: 'awb_not_found' } }; }
  rec(w, by, 'GET', `/shipments/${awb}`, 200);
  return { status: 200, body: { awb, status: o.status === 'delivered' ? 'delivered' : 'in_transit', delivered_days_ago: o.deliveredDaysAgo } };
}

export function getRefunds(w: World, by: By, orderId: number): Res<{ id: string; amount: number }[]> {
  rec(w, by, 'GET', `/orders/${orderId}/refunds`, 200);
  return { status: 200, body: w.refunds.filter(r => r.order === orderId).map(r => ({ id: r.id, amount: r.amount })) };
}
export function getCustomerRefunds(w: World, by: By, customer: string): Res<{ count: number; window_days: number }> {
  rec(w, by, 'GET', `/customers/${customer}/refunds?days=${w.settings.freqDays}`, 200);
  return { status: 200, body: { count: refundsRecent(w, customer), window_days: w.settings.freqDays } };
}

// ---- Policy retrieval: simple keyword-overlap ranking (stands in for BM25) ----
const tok = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(t => t.length > 2);
export function searchPolicy(w: World, by: By, q: string): Res<{ id: number; text: string; score: number }[]> {
  const qt = new Set(tok(q));
  const hits = w.policy
    .map(c => ({ id: c.id, text: c.text, score: tok(c.text).filter(t => qt.has(t)).length }))
    .filter(h => h.score > 0).sort((a, b) => b.score - a.score || a.id - b.id).slice(0, 3);
  rec(w, by, 'GET', `/policy?q=${encodeURIComponent(q)}`, 200);
  return { status: 200, body: hits };
}

// ---- Write endpoints: executor credential required ----
const forbidden = (w: World, by: By, method: string, path: string): Res<{ error: string }> => {
  rec(w, by, method, path, 403); return { status: 403, body: { error: 'forbidden: missing executor credential' } };
};
export function postRefund(w: World, by: By, cred: string, orderId: number, amount: number, idem: string): Res<{ refund_id?: string; error?: string }> {
  const path = `/refunds {order:${orderId}, amount:${amount}}`;
  if (cred !== w.writeCred) return forbidden(w, by, 'POST', path);
  const prev = w.done.get('refund:' + idem);
  if (prev) { rec(w, by, 'POST', path + ' (replay)', 200); return { status: 200, body: { refund_id: prev } }; }
  const o = w.orders.get(orderId);
  if (!o) { rec(w, by, 'POST', path, 404); return { status: 404, body: { error: 'order_not_found' } }; }
  if (amount > refundableLeft(w, o)) { rec(w, by, 'POST', path, 422); return { status: 422, body: { error: 'amount_exceeds_refundable' } }; }
  const id = 'rfnd_' + String(w.refunds.length + 1).padStart(3, '0');
  w.refunds.push({ id, order: orderId, amount, daysAgo: 0, customer: o.customer });
  w.done.set('refund:' + idem, id);
  rec(w, by, 'POST', path, 201); bump(w);
  return { status: 201, body: { refund_id: id } };
}
export function postReturn(w: World, by: By, cred: string, orderId: number, idem: string): Res<{ pickup_id?: string; error?: string }> {
  const path = `/returns {order:${orderId}}`;
  if (cred !== w.writeCred) return forbidden(w, by, 'POST', path);
  const prev = w.done.get('return:' + idem);
  if (prev) { rec(w, by, 'POST', path + ' (replay)', 200); return { status: 200, body: { pickup_id: prev } }; }
  if (!w.orders.has(orderId)) { rec(w, by, 'POST', path, 404); return { status: 404, body: { error: 'order_not_found' } }; }
  const id = 'pick_' + String(w.returns.length + 1).padStart(3, '0');
  w.returns.push({ id, order: orderId }); w.done.set('return:' + idem, id);
  rec(w, by, 'POST', path, 201); bump(w);
  return { status: 201, body: { pickup_id: id } };
}
export function patchAddress(w: World, by: By, cred: string, orderId: number, address: string): Res<{ ok?: boolean; error?: string }> {
  const path = `/orders/${orderId}/address`;
  if (cred !== w.writeCred) return forbidden(w, by, 'PATCH', path);
  const o = w.orders.get(orderId);
  if (!o) { rec(w, by, 'PATCH', path, 404); return { status: 404, body: { error: 'order_not_found' } }; }
  o.address = address; rec(w, by, 'PATCH', path, 200); bump(w);
  return { status: 200, body: { ok: true } };
}
export function postCancel(w: World, by: By, cred: string, orderId: number): Res<{ ok?: boolean; error?: string }> {
  const path = `/orders/${orderId}/cancel`;
  if (cred !== w.writeCred) return forbidden(w, by, 'POST', path);
  const o = w.orders.get(orderId);
  if (!o) { rec(w, by, 'POST', path, 404); return { status: 404, body: { error: 'order_not_found' } }; }
  w.orders.delete(orderId); rec(w, by, 'POST', path, 200); bump(w);
  return { status: 200, body: { ok: true } };
}
