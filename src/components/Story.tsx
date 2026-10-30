// The result of one request, told in plain words: what was asked, what the AI wanted, what Kavach checked,
// the decision (a stamp), and what happened. The technical trace sits behind a toggle.
import { useState } from 'react';
import type { ReactNode } from 'react';
import type { ClaimResult, Proposal, Step, Turn } from '../engine/types';
import { inr } from '../engine/world';
import { useWorld } from './ui';
import { StepList } from './Steps';
import { PLAIN } from '../content/plain';

const SOURCE = { tool: 'records', policy: 'policy', customer: 'customer said so' } as const;
const SRC_KIND = { tool: 'src-tool', policy: 'src-policy', customer: 'src-customer' } as const;

function wants(p: Proposal): string {
  const id = p.args.order_id;
  switch (p.tool) {
    case 'issue_refund': return `Refund ${inr(Number(p.args.amount))} on order ${id}`;
    case 'create_return_pickup': return `Book a return pickup for order ${id}`;
    case 'update_address': return `Change the delivery address on order ${id}`;
    case 'cancel_order': return `Cancel order ${id}`;
  }
}

function Sec({ n, title, kind, children }: { n: number; title: string; kind?: string; children: ReactNode }) {
  return (
    <section className={`story-sec ${kind ?? ''}`}>
      <h3><span className="num">{n}</span>{title}</h3>
      {children}
    </section>
  );
}

function Facts({ results }: { results: ClaimResult[] }) {
  return (
    <ul className="facts">
      {results.map(r => (
        <li key={r.claim.id} className={r.ok ? 'ok' : 'bad'}>
          <span className="mark" aria-label={r.ok ? 'passed' : 'failed'}>{r.ok ? '✓' : '✗'}</span>
          <div>
            <span className="says">{r.claim.statement}<span className={`badge b-${SRC_KIND[r.claim.source]} src`} title="Where the agent got this fact">{SOURCE[r.claim.source]}</span></span>
            <span className="records">{r.ok ? `Records agree. ${r.why}` : `Records say: ${r.why}`}</span>
          </div>
        </li>
      ))}
    </ul>
  );
}

type Tone = 'mint' | 'yolk' | 'cherry' | 'sky';

export default function Story({ turn }: { turn?: Turn }) {
  const w = useWorld();
  const [tech, setTech] = useState(false);
  if (!turn) {
    return (
      <div className="card story-empty">
        <h3>Nothing has happened yet</h3>
        <p>Send a message and the steps appear here, one at a time, in plain words.</p>
      </div>
    );
  }
  const steps = turn.steps;
  const proposal = steps.find((s: Step) => s.proposal)?.proposal;
  const checks: { claims: ClaimResult[]; route?: Step['route'] }[] = [];
  for (const s of steps) {
    if (s.claims) checks.push({ claims: s.claims });
    if (s.route && checks.length) checks[checks.length - 1].route = s.route;
  }
  const last = checks[checks.length - 1]?.route;
  const guardOff = steps.some(s => s.title.startsWith('GUARD OFF'));
  const gloss = w.chats[turn.customerId]?.find(m => m.role === 'customer' && m.text === turn.text)?.gloss;
  const running = turn.status === 'running';

  let stamp: { text: string; tone: Tone; sub?: string } | null = null;
  if (guardOff) stamp = { text: 'Not checked', tone: 'cherry', sub: 'Kavach is off, so nothing verified this request.' };
  else if (!proposal) {
    if (turn.note === 'ticket') stamp = { text: 'Passed to the seller', tone: 'yolk', sub: "A system didn't answer, so the agent handed the request to a person with a summary." };
    else if (turn.note === 'self_stop') stamp = { text: 'Agent stopped itself', tone: 'sky', sub: `${turn.noteText ?? ''} A careful agent catches this before proposing anything. Switch the agent to gullible to see Kavach catch it instead.` };
    else if (turn.note === 'asked') stamp = { text: 'Agent asked a question', tone: 'sky', sub: 'It needs more information, so it asks instead of guessing.' };
    else if (turn.note === 'read') stamp = { text: 'Nothing to approve', tone: 'sky', sub: 'The agent only read information. Reading is free, so no check is needed.' };
  } else if (last?.verdict === 'BLOCK') stamp = { text: 'Blocked', tone: 'cherry' };
  else if (last?.verdict === 'ESCALATE') {
    stamp = turn.status === 'pending' ? { text: 'Ask the seller', tone: 'yolk', sub: 'Waiting for a person. Nothing has happened yet.' }
      : turn.executed ? { text: 'Seller approved', tone: 'mint' } : { text: 'Seller said no', tone: 'cherry' };
  } else if (last?.verdict === 'ALLOW') stamp = { text: 'Allowed', tone: 'mint' };

  let n = 0;
  const reasons = (last?.reasons ?? []).map(r => PLAIN[r] ?? r);
  return (
    <div className="story" aria-live="polite">
      <Sec n={++n} title="The customer said">
        <p className="quote">“{turn.text}”</p>
        {gloss && <p className="gloss-line">In English: {gloss}</p>}
      </Sec>

      {proposal && (
        <Sec n={++n} title="The AI agent wants to">
          <p className="act">{wants(proposal)}</p>
          <p className="small">To do that, it says {proposal.claims.length} things are true. Kavach checks each one next.</p>
        </Sec>
      )}

      {checks.map((c, i) => (
        <Sec key={i} n={++n} kind="kavach" title={checks.length > 1 ? (i === 0 ? 'Kavach checks every fact in the records' : 'Kavach checks again after the fix') : 'Kavach checks every fact in the records'}>
          <Facts results={c.claims} />
        </Sec>
      ))}

      {stamp && !running && (
        <Sec n={++n} title="Decision">
          <div className="decision">
            <span key={`${turn.id}-${stamp.text}`} className={`stamp t-${stamp.tone}`}>{stamp.text}</span>
            <div className="reasons">
              {stamp.sub && <p>{stamp.sub}</p>}
              {!guardOff && reasons.map(r => <p key={r}>{r}</p>)}
            </div>
          </div>
        </Sec>
      )}

      {turn.reply && !running && (
        <Sec n={++n} title="What happened">
          <p className="result-line">
            {turn.unguarded && turn.executed ? 'The money was sent without any check.'
              : turn.executed ? 'The change was made. Every step is in the log.'
              : turn.status === 'pending' ? 'Nothing has changed yet. The request is waiting for the seller.'
              : proposal ? 'Nothing was changed.' : 'No change was made.'}
          </p>
          <div className="customer-sees">
            <b>The customer sees:</b> {turn.reply}
            {turn.replyEn && turn.replyEn !== turn.reply && <div className="gloss-line">In English: {turn.replyEn}</div>}
          </div>
        </Sec>
      )}

      <div className="tech-toggle">
        <button className="btn sm" onClick={() => setTech(t => !t)} aria-expanded={tech}>{tech ? 'Hide the technical steps' : 'Show the technical steps'}</button>
        {tech && <StepList turn={turn} />}
      </div>
    </div>
  );
}
