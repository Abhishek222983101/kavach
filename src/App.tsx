import { useEffect, useRef, useState } from 'react';
import { world } from './engine/singleton';
import { bump, resetWorld } from './engine/world';
import { sendMessage } from './engine/pipeline';
import { SCENARIOS } from './engine/scenarios';
import type { Scenario } from './engine/scenarios';
import type { Mode } from './engine/types';
import { Badge, Seg, Toggle, useWorld, verdictKind } from './components/ui';
import ChatPane from './components/ChatPane';
import TracePane from './components/TracePane';
import ConsolePane from './components/ConsolePane';
import type { Tab } from './components/ConsolePane';

const GROUPS = ['Everyday', 'Needs a human', 'Caught by the Verifier', 'Failure handling', 'Without Kavach'];
const EXPECT_LABEL: Record<string, string> = { allow: 'ALLOW', escalate: 'ESCALATE', block: 'BLOCK', info: 'INFO', danger: 'UNGUARDED' };

function About({ onClose }: { onClose: () => void }) {
  return (
    <div className="modal-back" onClick={onClose} role="dialog" aria-modal="true" aria-label="About this demo">
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h3>About this demo</h3>
        <p><b>Kavach</b> is a pre-action verification layer for tool-using support agents. The agent may read freely, but any action that changes the world (refund, return pickup, address change, cancellation) must be handed over as a <i>proposal with the facts it relies on</i>. A Verifier re-checks each fact against the records, a risk router decides auto / seller approval / block, and the Executor only runs actions that carry a signed verdict bound to the exact arguments.</p>
        <h4>What is real in this page</h4>
        <ul>
          <li>Claim checks that re-fetch from the (mock) store API; quote-or-fail policy grounding.</li>
          <li>Risk router, seller approval with edit-and-re-verify, one repair attempt.</li>
          <li>Verdict tokens signed with HMAC-SHA256 (WebCrypto) and bound to hash(tool, args); an Executor that refuses mismatches; idempotent writes.</li>
          <li>A hash-chained, append-only action log that detects tampering.</li>
        </ul>
        <h4>What is simulated</h4>
        <ul>
          <li><b>No language model runs here.</b> Messages are parsed by deterministic rules. <i>Gullible</i> mode scripts typical LLM mistakes (believing the customer, obeying text in a note, skipping self-checks) so the Verifier has something to catch.</li>
          <li>WhatsApp, the store, the courier and the payment gateway are in-browser mocks. Everything resets when you reload.</li>
          <li>The “careful model” tier (T2 consensus) is designed but not part of this demo.</li>
        </ul>
        <p className="muted small">No measured results are shown anywhere in this demo. Counters count this session only; they are not an evaluation.</p>
        <button className="btn approve" onClick={onClose}>Close</button>
      </div>
    </div>
  );
}

export default function App() {
  const w = useWorld();
  const [customerId, setCustomerId] = useState('cus_01');
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const [tab, setTab] = useState<Tab>('approvals');
  const [active, setActive] = useState<Scenario | null>(null);
  const [about, setAbout] = useState(false);
  const prevPending = useRef(0);

  const run = (f: () => Promise<void>) => { setBusy(true); f().finally(() => setBusy(false)); };

  const pending = w.approvals.filter(a => a.status === 'pending').length;
  useEffect(() => {
    if (pending > prevPending.current) setTab('approvals');
    prevPending.current = pending;
  }, [pending]);

  const runScenario = (s: Scenario) => {
    if (busy) return;
    setActive(s); setCustomerId(s.customer); setSelected(null);
    run(async () => { await sendMessage(world, s.customer, s.text, { photo: s.photo, override: { mode: s.mode, guard: s.guard ?? true, courierDown: s.courierDown ?? false } }); });
  };
  const send = (text: string, photo: boolean) => {
    setActive(null); setSelected(null);
    run(async () => { await sendMessage(world, customerId, text, { photo }); });
  };

  const s = w.settings;
  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="logo" aria-hidden="true">K</span>
          <div>
            <h1>Kavach</h1>
            <div className="tag">the support agent that checks before it acts</div>
          </div>
        </div>
        <div className="controls">
          <Seg<Mode> label="Agent" value={s.mode} onChange={m => { s.mode = m; bump(world); }}
            options={[{ v: 'careful', label: 'Careful' }, { v: 'gullible', label: 'Gullible', tone: 'warn' }]} />
          <Toggle on={s.guard} onChange={v => { s.guard = v; bump(world); }} label={s.guard ? 'Guard ON' : 'Guard OFF'} hint="Off = baseline without Kavach: the agent writes directly" />
          <Toggle on={s.writesEnabled} onChange={v => { s.writesEnabled = v; bump(world); }} label={s.writesEnabled ? 'Writes live' : 'Writes PAUSED'} hint="Kill switch" />
          <div className="counters" title="This session only. Not an evaluation.">
            <Badge kind="allow">{w.counters.ALLOW} allow</Badge><Badge kind="escalate">{w.counters.ESCALATE} escalate</Badge><Badge kind="block">{w.counters.BLOCK} block</Badge>
          </div>
          <button className="btn ghost" onClick={() => { resetWorld(world); setSelected(null); setActive(null); }}>Reset</button>
          <button className="btn ghost" onClick={() => setAbout(true)}>About</button>
        </div>
      </header>

      <div className="banner">
        <b>Concept demo.</b> Rule-based logic, no LLM. “Gullible” mode simulates an LLM that believes the customer, so you can watch the Verifier catch it. All data is mock and resets on reload.
      </div>

      <nav className="scenarios" aria-label="Scenarios">
        <div className="sc-flow">
          <span className="sc-title">Try a scenario</span>
          {GROUPS.map(g => (
            <span key={g} className="sc-group">
              <span className="sc-group-name">{g}</span>
              {SCENARIOS.filter(x => x.group === g).map(x => (
                <button key={x.id} className={`sc-chip ${active?.id === x.id ? 'on' : ''}`} onClick={() => runScenario(x)} disabled={busy} title={x.blurb}>
                  <span className={`dot d-${x.badge}`} />{x.label}
                </button>
              ))}
            </span>
          ))}
        </div>
        {active && (
          <div className="sc-blurb"><Badge kind={active.badge === 'danger' ? 'danger' : verdictKind(active.badge.toUpperCase())}>{EXPECT_LABEL[active.badge]}</Badge> <b>{active.label}.</b> {active.blurb}</div>
        )}
      </nav>

      <main className="grid">
        <ChatPane customerId={customerId} setCustomerId={setCustomerId} busy={busy} onSend={send} />
        <TracePane selected={selected} onSelect={setSelected} />
        <ConsolePane tab={tab} setTab={setTab} busy={busy} run={run} />
      </main>
      {about && <About onClose={() => setAbout(false)} />}
    </div>
  );
}
