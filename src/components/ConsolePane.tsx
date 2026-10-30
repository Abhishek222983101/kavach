import { useEffect, useState } from 'react';
import { acknowledgeTicket, resolveApproval } from '../engine/pipeline';
import { runExecutorLab } from '../engine/lab';
import type { LabResult } from '../engine/lab';
import { tamperRow, verifyChain } from '../engine/log';
import { resetWorld, bump, inr } from '../engine/world';
import { PLAIN } from '../content/plain';
import { short } from '../engine/crypto';
import { Badge, Seg, Toggle, useWorld, verdictKind } from './ui';
import type { Approval } from '../engine/types';

export type Tab = 'approvals' | 'log' | 'store' | 'settings' | 'lab';

function ApprovalCard({ a, busy, run }: { a: Approval; busy: boolean; run: (f: () => Promise<void>) => void }) {
  const w = useWorld();
  const cust = w.customers.find(c => c.id === a.customerId);
  const isRefund = a.proposal.tool === 'issue_refund';
  const [amt, setAmt] = useState(isRefund ? String(a.proposal.args.amount) : '');
  const edited = isRefund && Number(amt) !== Number(a.proposal.args.amount);
  return (
    <div className="card sm approval">
      <div className="card-head">
        <b>{a.proposal.tool}</b> · order {String(a.proposal.args.order_id)}
        {isRefund && <> · <b>{inr(Number(a.proposal.args.amount))}</b></>}
        <Badge kind="escalate">needs your decision</Badge>
      </div>
      <div className="muted small">Customer: {cust?.name} · {cust?.phone}</div>
      <ul className="reasons">{a.outcome.reasons.map(r => <li key={r}>{PLAIN[r] ?? r}</li>)}</ul>
      <div className="muted small">{a.outcome.results.filter(r => r.ok).length} of {a.outcome.results.length} facts checked out in the records. Everything is valid; the amount or context needs a person.</div>
      {isRefund && (
        <label className="edit">Change the amount if you like (it is checked again): ₹
          <input type="number" value={amt} min={1} onChange={e => setAmt(e.target.value)} />
        </label>
      )}
      <div className="row gap">
        <button className="btn approve" disabled={busy} onClick={() => run(() => resolveApproval(w, a.id, 'approve', edited ? Number(amt) : undefined))}>
          {edited ? 'Approve edited' : 'Approve'}
        </button>
        <button className="btn reject" disabled={busy} onClick={() => run(() => resolveApproval(w, a.id, 'reject'))}>Reject</button>
      </div>
    </div>
  );
}

export function Approvals({ busy, run, compact }: { busy: boolean; run: (f: () => Promise<void>) => void; compact?: boolean }) {
  const w = useWorld();
  const pending = w.approvals.filter(a => a.status === 'pending');
  const decided = w.approvals.filter(a => a.status !== 'pending').slice(-5).reverse();
  const openTickets = w.tickets.filter(t => t.status === 'open');
  const overCap = w.precedents.filter(p => p.decision === 'approved' && p.action === 'issue_refund' && (p.amount ?? 0) > w.settings.autoLimit);
  const suggest = overCap.length >= 3 ? Math.ceil(Math.max(...overCap.map(p => p.amount ?? 0)) / 100) * 100 : null;
  return (
    <div className="tab-body seller">
      <h4>{compact ? 'The seller’s phone' : 'Waiting for the seller'} {pending.length > 0 && <Badge kind="escalate">{pending.length}</Badge>}</h4>
      {pending.length === 0 && <p className="seller-empty small">{compact ? 'No requests waiting. A request that needs the seller shows up here.' : 'Nothing is waiting. Run the “Over-limit refund” scenario to see a request pause here.'}</p>}
      {pending.map(a => <ApprovalCard key={a.id} a={a} busy={busy} run={run} />)}
      {openTickets.length > 0 && <h4>Handed over to you</h4>}
      {openTickets.map(t => (
        <div key={t.id} className="card sm flat">
          <p className="small">{t.summary}</p>
          <button className="btn sm" onClick={() => acknowledgeTicket(w, t.id)}>Mark as seen</button>
        </div>
      ))}
      {!compact && decided.length > 0 && <h4>Recent decisions</h4>}
      {!compact && decided.map(a => (
        <div key={a.id} className="decided">
          <Badge kind={a.status === 'approved' ? 'allow' : 'block'}>{a.status}</Badge> {a.proposal.tool} on order {String(a.proposal.args.order_id)}{a.note ? ` (${a.note})` : ''}
        </div>
      ))}
      {!compact && (
        <>
          <h4>What the agent has learned from you</h4>
          {w.precedents.length === 0 ? <p className="small">Your approve and reject decisions are saved here as examples.</p>
            : <p className="small">{w.precedents.length} decision(s) saved. {overCap.length} were refunds above the limit that you approved.</p>}
          {suggest && (
            <div className="card sm tone-yolk">
              <p>You approved {overCap.length} refunds above the limit. Raise the auto-limit to {inr(suggest)}?</p>
              <p className="small">A suggestion never applies itself. The full design waits for 5 decisions; this demo uses 3 so you can see it.</p>
              <button className="btn sm mint" onClick={() => { w.settings.autoLimit = suggest; bump(w); }}>Raise to {inr(suggest)}</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function LogTab() {
  const w = useWorld();
  const [status, setStatus] = useState<{ ok: boolean; brokenAt?: number; checked: number } | null>(null);
  const [row, setRow] = useState(1);
  useEffect(() => { verifyChain(w).then(setStatus); }, [w.version, w]);
  return (
    <div className="tab-body">
      <div className="row gap wrap">
        {status && (status.ok
          ? <Badge kind="allow">chain intact · {status.checked} rows</Badge>
          : <Badge kind="block">chain broken at row {status.brokenAt}</Badge>)}
        <span className="muted small">each row hashes the previous one</span>
      </div>
      <div className="row gap wrap tamper">
        <label className="small">Tamper with row <input type="number" min={0} max={Math.max(0, w.log.length - 1)} value={row} onChange={e => setRow(Number(e.target.value))} /></label>
        <button className="btn ghost" disabled={!w.log[row]} onClick={() => tamperRow(w, row)}>Edit that row</button>
        <span className="muted small">then watch the chain break</span>
      </div>
      <div className="log">
        {w.log.length === 0 && <div className="muted small">Empty. Run a scenario: every step is appended here.</div>}
        {[...w.log].reverse().map(r => (
          <div key={r.i} className="log-row">
            <span className="muted mono">{String(r.i).padStart(2, '0')}</span>
            <span className="mono">{r.ts}</span>
            <Badge kind={r.event === 'execute' ? 'allow' : r.event === 'approval' ? 'escalate' : 'info'}>{r.event}</Badge>
            <span className="log-sum">{r.summary}</span>
            <code className="hash" title={r.hash}>{short(r.hash, 8)}</code>
          </div>
        ))}
      </div>
    </div>
  );
}

function StoreTab() {
  const w = useWorld();
  const orders = [...w.orders.values()];
  return (
    <div className="tab-body">
      <h4>Orders (mock store)</h4>
      <div className="table-wrap">
        <table>
          <thead><tr><th>#</th><th>Customer</th><th>Item</th><th>Paid</th><th>Status</th><th>Refunded</th></tr></thead>
          <tbody>
            {orders.map(o => {
              const ref = w.refunds.filter(r => r.order === o.id).reduce((s, r) => s + r.amount, 0);
              return (
                <tr key={o.id} title={o.note ? `Customer note: ${o.note}` : undefined}>
                  <td>{o.id}</td><td>{w.customers.find(c => c.id === o.customer)?.name}</td>
                  <td>{o.item}{o.perishable ? ' 🥖' : ''}{o.note ? ' 📝' : ''}</td><td>{inr(o.paid)}</td>
                  <td>{o.status}{o.deliveredDaysAgo != null ? ` · ${o.deliveredDaysAgo}d` : ''}</td><td>{ref ? inr(ref) : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="muted small">📝 = has a customer note (untrusted text) · 🥖 = perishable. Hover a row to read the note.</div>
      <h4>Store API calls <span className="muted small">(who called what)</span></h4>
      <div className="api">
        {[...w.apiLog].reverse().slice(0, 40).map(c => (
          <div key={c.id} className="api-row">
            <Badge kind={`by-${c.by}`}>{c.by}</Badge>
            <code>{c.method} {c.path}</code>
            <span className={`status s${Math.floor(c.status / 100)}`}>{c.status}</span>
          </div>
        ))}
        {w.apiLog.length === 0 && <div className="muted small">No calls yet.</div>}
      </div>
    </div>
  );
}

function SettingsTab() {
  const w = useWorld();
  const s = w.settings;
  const num = (label: string, key: 'autoLimit' | 'windowDays' | 'freqDays', hint: string) => (
    <label className="setting">
      <span>{label}<span className="muted small"> {hint}</span></span>
      <input type="number" min={0} value={s[key]} onChange={e => { s[key] = Math.max(0, Number(e.target.value)); bump(w); }} />
    </label>
  );
  return (
    <div className="tab-body">
      <h4>Seller settings (take effect immediately)</h4>
      {num('Auto-approval limit (₹)', 'autoLimit', 'refunds above this need the seller')}
      {num('Return window (days)', 'windowDays', 'from delivery')}
      {num('Refund frequency window (days)', 'freqDays', 'one auto-refund per customer')}
      <Toggle on={s.writesEnabled} onChange={v => { s.writesEnabled = v; bump(w); }} label="Writes enabled (kill switch)" hint="Off = the Executor refuses every write. Reads continue." />
      <Toggle on={s.courierDown} onChange={v => { s.courierDown = v; bump(w); }} label="Simulate courier API outage" hint="Makes /shipments return 500" />
      <Seg value={String(s.speed)} onChange={v => { s.speed = Number(v); bump(w); }} label="Reveal speed"
        options={[{ v: '0', label: 'Instant' }, { v: '240', label: 'Normal' }, { v: '600', label: 'Slow' }]} />
      <h4>Written policy (what the Verifier quotes against)</h4>
      <ol className="policy">{w.policy.map(c => <li key={c.id}>{c.text}</li>)}</ol>
      <button className="btn ghost" onClick={() => resetWorld(w)}>Reset the whole demo</button>
    </div>
  );
}

function LabTab({ busy, run }: { busy: boolean; run: (f: () => Promise<void>) => void }) {
  const w = useWorld();
  const [res, setRes] = useState<LabResult[] | null>(null);
  return (
    <div className="tab-body">
      <h4>Executor lab: try to bypass the guard</h4>
      <p className="small muted">Five direct attempts to make a write happen without a valid verdict. Each one must be refused. They are real calls into the Executor and the store API.</p>
      <button className="btn approve" disabled={busy} onClick={() => run(async () => setRes(await runExecutorLab(w)))}>Run the bypass tests</button>
      {res && res.map(r => (
        <div key={r.name} className={`card lab ${r.pass ? 'pass' : 'fail'}`}>
          <div className="card-head"><Badge kind={r.pass ? 'allow' : 'block'}>{r.pass ? 'REFUSED as designed' : 'UNEXPECTED'}</Badge> {r.name}</div>
          <div className="small">expected <code>{r.expect}</code> · got <code>{r.actual}</code></div>
          <div className="muted small">{r.detail}</div>
        </div>
      ))}
    </div>
  );
}

export default function ConsolePane({ tab, setTab, busy, run }: { tab: Tab; setTab: (t: Tab) => void; busy: boolean; run: (f: () => Promise<void>) => void }) {
  const w = useWorld();
  const pending = w.approvals.filter(a => a.status === 'pending').length + w.tickets.filter(t => t.status === 'open').length;
  const tabs: { id: Tab; label: string }[] = [
    { id: 'approvals', label: `Approvals${pending ? ` (${pending})` : ''}` }, { id: 'log', label: 'Log' },
    { id: 'store', label: 'Store' }, { id: 'settings', label: 'Settings' }, { id: 'lab', label: 'Break it' },
  ];
  return (
    <section className="card console" aria-label="Seller console">
      <h3 style={{ marginBottom: 12 }}>Seller console</h3>
      <div className="tabs" role="tablist">
        {tabs.map(t => <button key={t.id} role="tab" aria-selected={tab === t.id} className={`tab ${tab === t.id ? 'on' : ''}`} onClick={() => setTab(t.id)}>{t.label}</button>)}
      </div>
      {tab === 'approvals' && <Approvals busy={busy} run={run} />}
      {tab === 'log' && <LogTab />}
      {tab === 'store' && <StoreTab />}
      {tab === 'settings' && <SettingsTab />}
      {tab === 'lab' && <LabTab busy={busy} run={run} />}
    </section>
  );
}
export { verdictKind };
