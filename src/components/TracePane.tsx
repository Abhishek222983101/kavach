import { useEffect, useRef, useState } from 'react';
import type { ClaimResult, Phase, Proposal, RiskFeatures, Step, Turn, Verdict } from '../engine/types';
import { REASON_LABEL } from '../engine/i18n';
import { inr } from '../engine/world';
import { short } from '../engine/crypto';
import { Badge, useWorld, verdictKind } from './ui';

const PHASES: { id: Phase | Phase[]; label: string }[] = [
  { id: 'understand', label: 'Understand' },
  { id: 'plan', label: 'Plan' },
  { id: 'read', label: 'Read tools' },
  { id: 'propose', label: 'Proposal' },
  { id: 'verify', label: 'Verify' },
  { id: 'route', label: 'Route' },
  { id: 'approval', label: 'Human' },
  { id: 'execute', label: 'Execute' },
  { id: 'reply', label: 'Reply' },
];
const PHASE_LABEL: Record<Phase, string> = {
  ingest: 'INGEST', understand: 'UNDERSTAND', plan: 'PLAN', read: 'READ', propose: 'PROPOSE', verify: 'VERIFY',
  route: 'ROUTE', approval: 'HUMAN', execute: 'EXECUTE', reply: 'REPLY', log: 'LOG',
};
const worst = (steps: Step[]) => steps.some(s => s.level === 'fail') ? 'fail' : steps.some(s => s.level === 'warn') ? 'warn' : steps.length ? 'ok' : 'idle';

function Pipeline({ turn }: { turn: Turn | undefined }) {
  return (
    <ol className="pipeline" aria-label="Pipeline">
      {PHASES.map(p => {
        const steps = turn?.steps.filter(s => s.phase === p.id) ?? [];
        return (
          <li key={String(p.id)} className={`pl pl-${worst(steps)}`}>
            <span className="pl-dot" />{p.label}
          </li>
        );
      })}
    </ol>
  );
}

function ClaimTable({ claims }: { claims: ClaimResult[] }) {
  return (
    <div className="claims" role="table">
      {claims.map(c => (
        <div key={c.claim.id} className={`claim ${c.ok ? 'ok' : 'bad'}`} role="row">
          <span className="claim-ic" aria-label={c.ok ? 'verified' : 'failed'}>{c.ok ? '✓' : '✗'}</span>
          <div className="claim-main">
            <div className="claim-top">
              <span className="claim-kind">{c.claim.kind}</span>
              <Badge kind={`src-${c.claim.source}`} title="Where the agent got this fact">{c.claim.source}</Badge>
              <span className="claim-tier">{c.tier}</span>
            </div>
            <div className="claim-stmt">Agent says: {c.claim.statement}</div>
            <div className="claim-why">Records say: {c.why}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

function Risk({ r }: { r: RiskFeatures }) {
  return (
    <div className="risk">
      <span>amount ÷ paid: <b>{r.amountRatio ?? '—'}</b></span>
      <span>over auto-limit: <b>{r.overCap ? 'yes' : 'no'}</b></span>
      <span>recent refunds: <b>{r.refundsRecent}</b></span>
      <span>claims verified: <b>{Math.round(r.verifiedFraction * 100)}%</b></span>
      <span>injection flags: <b>{r.injectionFlags.length}</b></span>
    </div>
  );
}

function RoutePanel({ route }: { route: { verdict: Verdict; reasons: string[]; risk: RiskFeatures; tier: string } }) {
  return (
    <div className="route">
      <div className="route-head"><Badge kind={verdictKind(route.verdict)}>{route.verdict}</Badge><span className="muted">tier {route.tier}</span></div>
      {route.reasons.length > 0 && <ul className="reasons">{route.reasons.map(r => <li key={r}><code>{r}</code> {REASON_LABEL[r]}</li>)}</ul>}
      <Risk r={route.risk} />
    </div>
  );
}

function ProposalPanel({ p }: { p: Proposal }) {
  const view = { tool: p.tool, args: p.args, claims: p.claims.map(c => ({ kind: c.kind, source: c.source, statement: c.statement, ...(c.quote ? { quote: c.quote } : {}) })), injection_flags: p.injectionFlags };
  return (
    <details className="proposal">
      <summary>Show the proposal the agent handed over ({p.claims.length} claims)</summary>
      <pre>{JSON.stringify(view, null, 2)}</pre>
    </details>
  );
}

function StepCard({ s }: { s: Step }) {
  return (
    <div className={`step lvl-${s.level}`}>
      <div className="step-head">
        <span className={`phase ph-${s.phase}`}>{PHASE_LABEL[s.phase]}</span>
        <span className="step-title">{s.title}</span>
      </div>
      {s.detail && <div className="step-detail">{s.detail}</div>}
      {s.claims && <ClaimTable claims={s.claims} />}
      {s.route && <RoutePanel route={s.route} />}
      {s.token && (
        <div className="token">
          <div><span className="muted">verdict</span> {s.token.verdict}</div>
          <div><span className="muted">args_hash</span> <code>{short(s.token.argsHash, 22)}</code></div>
          <div><span className="muted">HMAC sig</span> <code>{short(s.token.sig, 22)}</code></div>
        </div>
      )}
      {s.proposal && <ProposalPanel p={s.proposal} />}
      {s.why && <div className="why"><b>Why:</b> {s.why}</div>}
    </div>
  );
}

function Empty() {
  const flow = ['Customer message', 'Agent plans + reads', 'Action proposal + claims', 'VERIFIER re-checks records', 'Risk router', 'Seller approves (if risky)', 'Executor needs signed verdict'];
  return (
    <div className="empty">
      <h3>How Kavach thinks</h3>
      <p>The agent can read freely. To <b>change</b> anything (refund, return, address, cancel) it must hand over a proposal listing the facts it relies on. The Verifier re-checks each fact against the records. Only then can the Executor act.</p>
      <ol className="flow">{flow.map((f, i) => <li key={f} className={i === 3 ? 'hl' : ''}>{f}</li>)}</ol>
      <p className="muted">Pick a scenario above, or type a message in the chat. Every step appears here as it happens.</p>
      <div className="note">
        <b>What is real here:</b> the claim checks, risk router, signed verdict (HMAC-SHA256 via WebCrypto), the executor that refuses anything not matching the verdict, and the hash-chained log.
        <br /><b>What is simulated:</b> the language model (replaced by a deterministic parser; <i>Gullible</i> mode simulates typical LLM mistakes), WhatsApp, the store and the courier.
      </div>
    </div>
  );
}

export default function TracePane({ selected, onSelect }: { selected: number | null; onSelect: (id: number | null) => void }) {
  const w = useWorld();
  const turns = w.turns;
  const turn = turns.find(t => t.id === selected) ?? turns[turns.length - 1];
  const endRef = useRef<HTMLDivElement>(null);
  const [follow, setFollow] = useState(true);
  useEffect(() => { if (follow && turn) endRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }, [w.version, follow, turn]);

  return (
    <section className="pane trace" aria-label="Thought process">
      <div className="pane-head">
        <h2>Thought process</h2>
        <div className="turn-tabs">
          {turns.slice(-6).map(t => (
            <button key={t.id} className={`tab ${turn?.id === t.id ? 'on' : ''}`} onClick={() => { onSelect(t.id); setFollow(t.id === turns[turns.length - 1].id); }}>
              #{turns.indexOf(t) + 1}{t.status === 'pending' ? ' ⏸' : ''}
            </button>
          ))}
        </div>
      </div>
      <Pipeline turn={turn} />
      <div className="trace-body">
        {!turn && <Empty />}
        {turn && (
          <>
            <div className="turn-head">
              <div className="said">“{turn.text}”</div>
              <div className="turn-meta">
                <Badge kind="info">{w.customers.find(c => c.id === turn.customerId)?.name}</Badge>
                <Badge kind={turn.mode === 'gullible' ? 'escalate' : 'info'}>agent: {turn.mode}</Badge>
                <Badge kind={turn.guard ? 'allow' : 'danger'}>guard {turn.guard ? 'ON' : 'OFF'}</Badge>
                {turn.status === 'running' && <Badge kind="info">running…</Badge>}
                {turn.status === 'pending' && <Badge kind="escalate">waiting for seller</Badge>}
                {turn.verdict && turn.verdict !== 'NONE' && <Badge kind={verdictKind(turn.verdict)}>{turn.verdict}</Badge>}
                {turn.executed && <Badge kind={turn.unguarded ? 'danger' : 'allow'}>{turn.unguarded ? 'EXECUTED WITHOUT CHECKS' : 'executed'}</Badge>}
              </div>
            </div>
            {turn.steps.map(s => <StepCard key={s.id} s={s} />)}
            {turn.status === 'done' && turn.steps.length > 0 && turn.reply && (
              <div className="outcome">Customer sees: <b>{turn.reply}</b></div>
            )}
          </>
        )}
        <div ref={endRef} />
      </div>
    </section>
  );
}
export { inr };
