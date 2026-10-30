import { GITHUB } from '../content/links';

export default function Done() {
  return (
    <div className="wrap main done">
      <h1>That’s Kavach.</h1>
      <p style={{ fontSize: '1.25rem' }}>The AI can ask for anything. It only gets it after the facts check out.</p>
      <div className="recap">
        <div className="card tone-mint"><span className="num">1</span><div><h3>Clean and small goes through</h3><p>Every fact was checked first, so no person was needed.</p></div></div>
        <div className="card tone-yolk"><span className="num">2</span><div><h3>Big goes to a person</h3><p>Nothing happened until the seller pressed Approve.</p></div></div>
        <div className="card tone-cherry"><span className="num">3</span><div><h3>Wrong gets blocked</h3><p>A made-up policy and a hidden instruction both failed the check. With Kavach off, the same attack worked.</p></div></div>
        <div className="card tone-sky"><span className="num">4</span><div><h3>It can’t be talked around</h3><p>Every break-in attempt was refused, and editing the log broke its seal.</p></div></div>
      </div>
      <div className="cta">
        <a className="btn big mint" href="#/play">Try your own messages</a>
        <a className="btn big" href="#/tour/1">Do the tour again</a>
        <a className="btn big" href={GITHUB} target="_blank" rel="noreferrer">Read the code</a>
      </div>
      <div className="card" style={{ marginTop: 40, maxWidth: 760 }}>
        <h3>What isn’t built yet</h3>
        <ul className="not-built" style={{ marginTop: 10 }}>
          <li>A real AI model. Today’s agent is scripted, and the “gullible” mode imitates typical AI mistakes.</li>
          <li>A second, more careful check for unclear policy wording.</li>
          <li>A real shop, courier and WhatsApp connection, and a server that keeps data.</li>
          <li>Measured results. There are none yet. The plan for measuring it is in the repository.</li>
        </ul>
      </div>
    </div>
  );
}
