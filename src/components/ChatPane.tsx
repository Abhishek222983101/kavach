import { useEffect, useRef, useState } from 'react';
import { inr } from '../engine/world';
import { Badge, useWorld } from './ui';

export default function ChatPane({ customerId, setCustomerId, busy, onSend }: {
  customerId: string; setCustomerId: (id: string) => void; busy: boolean;
  onSend: (text: string, photo: boolean) => void;
}) {
  const w = useWorld();
  const [text, setText] = useState('');
  const [photo, setPhoto] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const msgs = w.chats[customerId] ?? [];
  const cust = w.customers.find(c => c.id === customerId)!;
  const orders = [...w.orders.values()].filter(o => o.customer === customerId);
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }, [msgs.length, w.version]);

  const send = () => {
    const v = text.trim();
    if (!v || busy) return;
    onSend(v, photo);
    setText('');
    setPhoto(false);
  };
  const first = orders[0];
  const tries = first ? [`Order ${first.id} kahan hai?`, `Order ${first.id} ka refund chahiye`, `Order ${first.id} cancel karo`] : [];

  return (
    <section className="pane chat" aria-label="Customer chat">
      <div className="pane-head">
        <h2>WhatsApp <span className="muted">sim</span></h2>
        <select value={customerId} onChange={e => setCustomerId(e.target.value)} aria-label="Customer" disabled={busy}>
          {w.customers.map(c => <option key={c.id} value={c.id}>{c.name} · {c.phone.slice(-5)}</option>)}
        </select>
      </div>
      <div className="orders">
        <div className="muted small">{cust.name}’s orders (click to insert):</div>
        <div className="order-chips">
          {orders.length === 0 && <span className="muted small">none</span>}
          {orders.map(o => (
            <button key={o.id} className="order-chip" onClick={() => setText(t => (t ? t + ' ' : '') + `Order ${o.id}`)}
              title={`${o.item}, paid ${inr(o.paid)}, ${o.status}${o.deliveredDaysAgo != null ? `, delivered ${o.deliveredDaysAgo}d ago` : ''}`}>
              <b>#{o.id}</b> {o.item} · {inr(o.paid)}
              <span className="muted"> · {o.status === 'delivered' ? `${o.deliveredDaysAgo}d ago` : o.status}</span>
              {o.perishable && <Badge kind="info">perishable</Badge>}
            </button>
          ))}
        </div>
      </div>
      <div className="messages" aria-live="polite">
        {msgs.length === 0 && <div className="muted small center">No messages yet. Pick a scenario above or type below.</div>}
        {msgs.map(m => <div key={m.id} className={`bubble ${m.role}`}>{m.text}</div>)}
        {busy && <div className="bubble agent typing"><span /><span /><span /></div>}
        <div ref={endRef} />
      </div>
      <div className="composer">
        {tries.length > 0 && (
          <div className="tries">
            {tries.map(t => <button key={t} className="try" onClick={() => setText(t)} disabled={busy}>{t}</button>)}
          </div>
        )}
        <div className="row">
          <input value={text} onChange={e => setText(e.target.value)} onKeyDown={e => e.key === 'Enter' && send()}
            placeholder="e.g. Order 1042 toota hua aaya, ₹1,299 refund chahiye" aria-label="Message" disabled={busy} />
          <button className={`icon-btn ${photo ? 'on' : ''}`} onClick={() => setPhoto(p => !p)} title="Attach a photo of the item" aria-pressed={photo}>📎</button>
          <button className="send" onClick={send} disabled={busy || !text.trim()}>Send</button>
        </div>
        <div className="muted small">Hinglish or English. 📎 = attach a photo (needed for damaged or wrong items).</div>
      </div>
    </section>
  );
}
