import { useEffect, useState } from 'react';
import { world } from '../engine/singleton';
import { resetWorld } from '../engine/world';
import { sendMessage } from '../engine/pipeline';
import { TOUR } from '../content/tour';
import type { TaskId } from '../content/tour';
import { TOUR_STEPS } from '../router';
import { useWorld } from '../components/ui';
import ChatPane from '../components/ChatPane';
import Story from '../components/Story';
import { Approvals } from '../components/ConsolePane';
import BreakIt from '../components/BreakIt';

export default function Tour({ step }: { step: number }) {
  const w = useWorld();
  const s = TOUR[step - 1];
  const [busy, setBusy] = useState(false);
  const [flags, setFlags] = useState<Record<string, boolean>>({});

  const begin = () => { resetWorld(world); world.settings.speed = 140; setFlags({}); setBusy(false); };
  useEffect(begin, [step]);

  const turn = w.turns[w.turns.length - 1];
  const done = (id: TaskId) => id === 'send' ? w.turns.length > 0 : id === 'approve' ? w.approvals.some(a => a.status === 'approved') : !!flags[id];
  const allDone = s.tasks.every(t => done(t.id));

  const send = (text: string) => {
    setBusy(true);
    sendMessage(world, s.customer!, text, { photo: s.photo, override: { mode: s.mode, guard: s.guard, courierDown: false } }).finally(() => setBusy(false));
  };
  const next = TOUR[step];
  const prev = TOUR[step - 2];

  return (
    <>
      <div className="wrap main">
        <nav className="progress" aria-label="Tour progress">
          {TOUR.map(t => (
            <a key={t.n} href={`#/tour/${t.n}`} className={t.n === step ? 'now' : t.n < step ? 'past' : ''} aria-current={t.n === step ? 'step' : undefined}
              title={t.title} aria-label={`Step ${t.n}: ${t.title}`}>{t.n}</a>
          ))}
          <span className="label">Step {step} of {TOUR_STEPS}</span>
        </nav>

        <header className="tour-head">
          <h1>{s.title}</h1>
          <p>{s.goal}</p>
        </header>

        <div className="tour-grid">
          <aside className="side">
            <div className="card">
              <h3>Do this</h3>
              <ul className="tasks">
                {s.tasks.map(t => (
                  <li key={t.id} className={done(t.id) ? 'done' : ''}>
                    <span className="box" aria-hidden="true">{done(t.id) ? '✓' : ''}</span>
                    <span>{t.text}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="card">
              <h3>Look for</h3>
              <ul className="look">{s.look.map(l => <li key={l}>{l}</li>)}</ul>
            </div>
          </aside>

          <div className="stage">
            {s.kind === 'chat' ? (
              <>
                <div className="modes">
                  <span className={`sticker ${s.mode === 'gullible' ? 'cherry' : 'mint'}`}>Agent: {s.mode}</span>
                  <span className={`sticker ${s.guard ? 'mint' : 'ink'}`}>Kavach: {s.guard ? 'on' : 'OFF'}</span>
                  {s.mode === 'gullible' && <span className="hint">A gullible agent copies what the customer claims and skips its own checks, like a careless AI. It’s scripted here to show what Kavach catches.</span>}
                </div>
                <ChatPane customerId={s.customer!} busy={busy} onSend={send} preset={s.text} presetSent={w.turns.length > 0} onReset={begin} />
                {step === 2 && (
                  <div className="card tone-yolk"><Approvals compact busy={busy} run={f => { setBusy(true); f().finally(() => setBusy(false)); }} /></div>
                )}
                <Story turn={turn} />
              </>
            ) : (
              <BreakIt onFlag={id => setFlags(f => ({ ...f, [id]: true }))} />
            )}
          </div>
        </div>

        <div className="tour-nav">
          {prev ? <a className="btn" href={`#/tour/${prev.n}`}>Back</a> : <a className="btn" href="#/">Back to home</a>}
          {next
            ? <a className={`btn big ${allDone ? 'go' : ''}`} href={`#/tour/${next.n}`}>Next: {next.title}</a>
            : <a className={`btn big ${allDone ? 'go' : ''}`} href="#/done">Finish the tour</a>}
        </div>
      </div>
    </>
  );
}
