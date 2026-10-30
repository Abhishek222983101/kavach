// The full technical trace (every step the engine took). Hidden behind a toggle in the plain-language Story.
import type { ClaimResult, Phase, Proposal, RiskFeatures, Step, Turn, Verdict } from '../engine/types';
import { REASON_LABEL } from '../engine/i18n';
import { short } from '../engine/crypto';
import { Badge, verdictKind } from './ui';

const PHASE_LABEL: Record<Phase, string> = {
  ingest: 'ingest', understand: 'understand', plan: 'plan', read: 'read', propose: 'propose', verify: 'verify',
  route: 'route', approval: 'human', execute: 'execute', reply: 'reply', log: 'log',
};

function ClaimTable({ claims }: { claims: ClaimResult[] }) {
  return (
    <div className="claims">
      {claims.map(c => (
        <div key={c.claim.id} className={`claim ${c.ok ? 'ok' : 'bad'}`}>
          <span className="claim-ic" aria-label={c.ok ? 'verified' : 'failed'}>{c.ok ? '✓' : '✗'}</span>
          <div>
            <div className="claim-top">
              <span className="claim-kind">{c.claim.kind}</span>
              <Badge kind={`src-${c.claim.source}`}>{c.claim.source}</Badge>
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
      <span>amount ÷ paid: <b>{r.amountRatio ?? '—'}</b></span><span>over limit: <b>{r.overCap ? 'yes' : 'no'}</b></span>
      <span>recent refunds: <b>{r.refundsRecent}</b></span><span>verified: <b>{Math.round(r.verifiedFraction * 100)}%</b></span>
      <span>injection flags: <b>{r.injectionFlags.length}</b></span>
    </div>
  );
}
function RoutePanel({ route }: { route: { verdict: Verdict; reasons: string[]; risk: RiskFeatures; tier: string } }) {
  return (
    <div className="route">
      <div className="route-head"><Badge kind={verdictKind(route.verdict)}>{route.verdict}</Badge><span>tier {route.tier}</span></div>
      {route.reasons.length > 0 && <ul className="reasons-list">{route.reasons.map(r => <li key={r}><code>{r}</code> {REASON_LABEL[r]}</li>)}</ul>}
      <Risk r={route.risk} />
    </div>
  );
}
function ProposalPanel({ p }: { p: Proposal }) {
  const view = { tool: p.tool, args: p.args, claims: p.claims.map(c => ({ kind: c.kind, source: c.source, statement: c.statement, ...(c.quote ? { quote: c.quote } : {}) })), injection_flags: p.injectionFlags };
  return (
    <details className="proposal"><summary>The proposal as data ({p.claims.length} claims)</summary><pre>{JSON.stringify(view, null, 2)}</pre></details>
  );
}
function StepCard({ s }: { s: Step }) {
  return (
    <div className={`step lvl-${s.level}`}>
      <div className="step-head"><span className="phase">{PHASE_LABEL[s.phase]}</span><span className="step-title">{s.title}</span></div>
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
      {s.why && <div className="why">Why: {s.why}</div>}
    </div>
  );
}
export function StepList({ turn }: { turn: Turn }) {
  return <div className="tech">{turn.steps.map(s => <StepCard key={s.id} s={s} />)}</div>;
}
