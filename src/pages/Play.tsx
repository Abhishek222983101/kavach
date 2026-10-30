import { useState } from 'react';
import { world } from '../engine/singleton';
import { bump, resetWorld } from '../engine/world';
import { sendMessage } from '../engine/pipeline';
import { SCENARIOS } from '../engine/scenarios';
import type { Scenario } from '../engine/scenarios';
import type { Mode } from '../engine/types';
import { Badge, Seg, Toggle, useWorld } from '../components/ui';
import ChatPane from '../components/ChatPane';
import Story from '../components/Story';
import ConsolePane from '../components/ConsolePane';
import type { Tab } from '../components/ConsolePane';
import { useEffect, useRef } from 'react';

const GROUPS = ['Everyday', 'Needs a human', 'Caught by the Verifier', 'Failure handling', 'Without Kavach'];
const GROUP_LABEL: Record<string, string> = { 'Caught by the Verifier': 'Kavach catches it', 'Without Kavach': 'With Kavach off' };
const OUTCOME: Record<string, string> = { allow: 'Allowed', escalate: 'Asks the seller', block: 'Blocked', info: 'Information', danger: 'Not checked' };

export default function Play() {
  const w = useWorld();
  const [customerId, setCustomerId] = useState('cus_01');
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const [tab, setTab] = useState<Tab>('approvals');
  const [active, setActive] = useState<Scenario | null>(null);
  const [scenOpen, setScenOpen] = useState(true);
  const prevPending = useRef(0);
  const s = w.settings;

  useEffect(() => { world.settings.speed = 200; }, []);
  const pending = w.approvals.filter(a => a.status === 'pending').length;
  useEffect(() => { if (pending > prevPending.current) setTab('approvals'); prevPending.current = pending; }, [pending]);

  const run = (f: () => Promise<void>) => { setBusy(true); f().finally(() => setBusy(false)); };
  const runScenario = (sc: Scenario) => {
    if (busy) return;
    setActive(sc); setCustomerId(sc.customer); setSelected(null); setScenOpen(false);
    run(async () => { await sendMessage(world, sc.customer, sc.text, { photo: sc.photo, gloss: sc.gloss, override: { mode: sc.mode, guard: sc.guard ?? true, courierDown: sc.courierDown ?? false } }); });
  };
  const send = (text: string, photo: boolean) => { setActive(null); setSelected(null); run(async () => { await sendMessage(world, customerId, text, { photo }); }); };

  const turns = w.turns;
  const turn = turns.find(t => t.id === selected) ?? turns[turns.length - 1];

  return (
    <div className="wrap main">
      <div className="play-head">
        <div>
          <h1 style={{ fontSize: 'clamp(2rem, 1rem + 3vw, 3.2rem)' }}>Playground</h1>
          <p>Pick a scenario, or type your own message. New here? <a href="#/tour/1"><b>Take the 2-minute tour</b></a> first.</p>
        </div>
        <div className="card sm controls">
          <Seg<Mode> label="Agent" value={s.mode} onChange={m => { s.mode = m; bump(world); }}
            options={[{ v: 'careful', label: 'Careful' }, { v: 'gullible', label: 'Gullible', tone: 'warn' }]} />
          <Toggle on={s.guard} onChange={v => { s.guard = v; bump(world); }} label={s.guard ? 'Kavach on' : 'Kavach OFF'} hint="Off means the agent writes directly, with no checks" />
          <Toggle on={s.writesEnabled} onChange={v => { s.writesEnabled = v; bump(world); }} label={s.writesEnabled ? 'Changes allowed' : 'Changes paused'} hint="The kill switch: the executor refuses every change" />
          <span className="counters" title="This session only. Not an evaluation.">
            <Badge kind="allow">{w.counters.ALLOW} allowed</Badge><Badge kind="escalate">{w.counters.ESCALATE} asked</Badge><Badge kind="block">{w.counters.BLOCK} blocked</Badge>
          </span>
          <button className="btn sm" onClick={() => { resetWorld(world); world.settings.speed = 200; setSelected(null); setActive(null); }}>Reset</button>
        </div>
      </div>

      <details className="card scen" open={scenOpen} onToggle={e => setScenOpen((e.target as HTMLDetailsElement).open)}>
        <summary>{scenOpen ? 'Pick a scenario' : `Pick another scenario (${SCENARIOS.length})`}</summary>
        <div className="scen-groups">
          {GROUPS.map(g => (
            <div key={g} className={`scen-group ${g === 'Caught by the Verifier' ? 'wide' : ''}`}>
              <h4>{GROUP_LABEL[g] ?? g}</h4>
              <div className="scen-btns">
                {SCENARIOS.filter(x => x.group === g).map(x => (
                  <button key={x.id} className={`sc ${active?.id === x.id ? 'on' : ''}`} onClick={() => runScenario(x)} disabled={busy} title={x.blurb}>
                    <span className={`dot d-${x.badge}`} />{x.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
        {active && (
          <div className="blurb"><span className={`sticker ${active.badge === 'allow' ? 'mint' : active.badge === 'escalate' ? 'yolk' : active.badge === 'block' ? 'cherry' : active.badge === 'danger' ? 'ink' : 'sky'}`}>{OUTCOME[active.badge]}</span><span><b>{active.label}.</b> {active.blurb}</span></div>
        )}
      </details>

      <div className="play-grid">
        <ChatPane customerId={customerId} setCustomerId={setCustomerId} busy={busy} onSend={send} />
        <div>
          {turns.length > 1 && (
            <div className="turn-tabs" role="tablist" aria-label="Earlier requests">
              {turns.slice(-8).map(t => (
                <button key={t.id} role="tab" aria-selected={turn?.id === t.id} className={`tab ${turn?.id === t.id ? 'on' : ''}`} onClick={() => setSelected(t.id)}>
                  Request {turns.indexOf(t) + 1}
                </button>
              ))}
            </div>
          )}
          <Story turn={turn} />
        </div>
        <ConsolePane tab={tab} setTab={setTab} busy={busy} run={run} />
      </div>
    </div>
  );
}
