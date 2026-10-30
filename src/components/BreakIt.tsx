// Tour step 6: try to bypass the guard, then try to edit the log.
import { useEffect, useState } from 'react';
import { runExecutorLab } from '../engine/lab';
import type { LabResult } from '../engine/lab';
import { tamperRow, verifyChain } from '../engine/log';
import { useWorld } from './ui';

export default function BreakIt({ onFlag }: { onFlag: (id: 'run' | 'tamper') => void }) {
  const w = useWorld();
  const [res, setRes] = useState<LabResult[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [chain, setChain] = useState<{ ok: boolean; brokenAt?: number; checked: number } | null>(null);
  useEffect(() => { verifyChain(w).then(setChain); }, [w, w.version]);

  const run = async () => { setBusy(true); setRes(await runExecutorLab(w)); setBusy(false); onFlag('run'); };
  const tamper = () => { tamperRow(w, 1); onFlag('tamper'); };

  return (
    <div className="break-grid">
      <div className="card">
        <h3>1. The break-in attempts</h3>
        <p className="small" style={{ margin: '6px 0 14px' }}>These are real calls into the executor, the only code allowed to change anything.</p>
        <button className="btn big yolk" onClick={run} disabled={busy}>Run the 5 break-in attempts</button>
        <div style={{ display: 'grid', gap: 10, marginTop: 16 }}>
          {res?.map(r => (
            <div key={r.name} className={`card sm flat lab-card ${r.pass ? 'pass' : 'fail'}`}>
              <b>{r.pass ? 'Refused. ' : 'Not refused. '}</b>{r.name}
              <div className="small">{r.detail}</div>
              <div className="small">Expected: <code>{r.expect}</code>. Got: <code>{r.actual}</code>.</div>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <h3>2. The action log</h3>
        <p className="small" style={{ margin: '6px 0 14px' }}>Each row contains the previous row’s fingerprint. Change any row and every later fingerprint stops matching.</p>
        <div className="tamper-row">
          {chain && (chain.ok
            ? <span className="sticker mint">Seal intact, {chain.checked} rows</span>
            : <span className="sticker cherry">Seal broken at row {chain.brokenAt}</span>)}
          <button className="btn sm cherry" onClick={tamper} disabled={w.log.length < 2 || chain?.ok === false}>Edit a log row</button>
        </div>
        {w.log.length < 2 && <p className="small" style={{ marginTop: 10 }}>Run the break-in attempts first. Each refusal is written to the log.</p>}
        <div className="log" style={{ marginTop: 14 }}>
          {[...w.log].reverse().slice(0, 8).map(r => (
            <div key={r.i} className="log-row">
              <span>{String(r.i).padStart(2, '0')}</span><span className="mono">{r.ts}</span>
              <span className="badge">{r.event}</span><span className="log-sum">{r.summary}</span><code className="hash">{r.hash.slice(0, 8)}</code>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
