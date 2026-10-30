import { useEffect, useRef, useState } from 'react';
import { inr } from '../engine/world';
import { useWorld } from './ui';

interface Props {
  customerId: string;
  setCustomerId?: (id: string) => void;
  busy: boolean;
  onSend: (text: string, photo: boolean) => void;
  /** Tour mode: the message is fixed and sent with one button. */
  preset?: string;
  presetSent?: boolean;
  onReset?: () => void;
}

export default function ChatPane({ customerId, setCustomerId, busy, onSend, preset, presetSent, onReset }: Props) {
  const w = useWorld();
  const [text, setText] = useState('');
  const [photo, setPhoto] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const msgs = w.chats[customerId] ?? [];
  const cust = w.customers.find(c => c.id === customerId)!;
  const orders = [...w.orders.values()].filter(o => o.customer === customerId);
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'nearest' }); }, [msgs.length, busy]);

  const send = () => {
    const v = text.trim();
    if (!v || busy) return;
    onSend(v, photo);
    setText(''); setPhoto(false);
  };
  const first = orders[0];
  const tries = first ? [`Where is order ${first.id}?`, `I want a refund for order ${first.id}`, `Cancel order ${first.id}`] : [];

  return (
    <section className="card chat" aria-label="Customer chat">
      <div className="who">
        <h3>{preset ? `${cust.name} on WhatsApp` : 'Customer chat'}</h3>
        {setCustomerId
          ? <select value={customerId} onChange={e => setCustomerId(e.target.value)} aria-label="Pick a customer" disabled={busy}>
              {w.customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          : <span className="sticker sky">simulated chat</span>}
      </div>

      {!preset && (
        <>
          <p className="small">{cust.name}’s orders. Click one to add it to your message:</p>
          <div className="chips">
            {orders.length === 0 && <span className="small">No orders.</span>}
            {orders.map(o => (
              <button key={o.id} className="chip" onClick={() => setText(t => (t ? t + ' ' : '') + `order ${o.id}`)}
                title={`${o.item}, paid ${inr(o.paid)}, ${o.status}${o.deliveredDaysAgo != null ? `, delivered ${o.deliveredDaysAgo} days ago` : ''}`}>
                #{o.id} {o.item} {inr(o.paid)} {o.status === 'delivered' ? `(${o.deliveredDaysAgo}d ago)` : `(${o.status})`}
              </button>
            ))}
          </div>
        </>
      )}

      <div className="messages" aria-live="polite">
        {msgs.length === 0 && <p className="small">No messages yet.</p>}
        {msgs.map(m => (
          <div key={m.id} className={`bubble ${m.role}`}>
            {m.text}
            {m.gloss && <span className="gloss">In English: {m.gloss}</span>}
          </div>
        ))}
        {busy && <div className="bubble agent typing" aria-label="The agent is working"><span /><span /><span /></div>}
        <div ref={endRef} />
      </div>

      {preset ? (
        <div className="composer">
          {!presetSent && (
            <>
              <p className="small">This is what the customer will send:</p>
              <div className="preset">“{preset}”</div>
              <button className="btn big mint" onClick={() => onSend(preset, false)} disabled={busy}>Send this message</button>
            </>
          )}
          {presetSent && onReset && <button className="btn sm" onClick={onReset} disabled={busy}>Start this step over</button>}
        </div>
      ) : (
        <div className="composer">
          <div className="chips">{tries.map(t => <button key={t} className="chip" onClick={() => setText(t)} disabled={busy}>{t}</button>)}</div>
          <div className="row">
            <input type="text" value={text} onChange={e => setText(e.target.value)} onKeyDown={e => e.key === 'Enter' && send()}
              placeholder="Type a message, in English or Hinglish" aria-label="Message" disabled={busy} />
            <button className={`icon-btn ${photo ? 'on' : ''}`} onClick={() => setPhoto(p => !p)} aria-pressed={photo} title="Attach a photo of the item">📎</button>
            <button className="btn mint" onClick={send} disabled={busy || !text.trim()}>Send</button>
          </div>
          <p className="small">The paperclip attaches a photo. It is needed for damaged or wrong items.</p>
        </div>
      )}
    </section>
  );
}
