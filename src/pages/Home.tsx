import { GITHUB } from '../content/links';

function Slip() {
  return (
    <div className="slip" aria-label="Example refund slip that gets blocked">
      <h3><span>Refund slip</span><span>Order 1045 · ₹1,000</span></h3>
      <ul>
        <li><span className="tick">✓</span>The order is Sana’s</li>
        <li><span className="tick">✓</span>It was delivered</li>
        <li className="bad"><span className="tick x">✗</span>
          <span>“The policy allows 30 days”<span className="real">The written policy says 7 days.</span></span></li>
      </ul>
      <span className="stamp t-cherry hero-stamp">Blocked</span>
    </div>
  );
}

export default function Home() {
  return (
    <div className="wrap main">
      <div className="hero">
        <div>
          <h1>Before an AI agent moves your money, it has to prove it’s right.</h1>
          <p className="lede">Kavach checks every refund, return and address change against your records before the AI is allowed to do it.</p>
          <div className="cta">
            <a className="btn big mint" href="#/tour/1">Take the 2-minute tour</a>
            <a className="btn big" href="#/play">Open the playground</a>
          </div>
        </div>
        <Slip />
      </div>

      <section className="section">
        <h2>How it works</h2>
        <div className="three">
          <div className="card"><span className="num">1</span><h3>The AI asks</h3>
            <p>It can read freely. To change anything, it must list the facts it is relying on, like “this is the customer’s order”.</p></div>
          <div className="card tone-grape"><span className="num">2</span><h3>Kavach checks</h3>
            <p>Every fact is checked again in the real records. If the AI quotes the policy, the quote must match the policy word for word.</p></div>
          <div className="card"><span className="num">3</span><h3>Then it acts, or a person decides</h3>
            <p>Small and clean: it goes ahead. Big or odd: the seller decides. Wrong: it is blocked. Everything is logged.</p></div>
        </div>
      </section>

      <section className="section">
        <h2>What is real, and what is pretend</h2>
        <div className="honest">
          <div className="card tone-mint"><h3>Real</h3>
            <ul>
              <li>The fact checks against the records</li>
              <li>The approval signature, tied to the exact amount</li>
              <li>The seller approval step</li>
              <li>The tamper-proof log</li>
            </ul></div>
          <div className="card tone-yolk"><h3>Pretend</h3>
            <ul>
              <li>No real AI model runs. The “gullible” agent is scripted to make typical AI mistakes so you can watch Kavach catch them.</li>
              <li>The shop, the courier and WhatsApp are made up.</li>
              <li>Nothing is saved. Reload and it resets.</li>
            </ul></div>
        </div>
      </section>

      <section className="section">
        <h2>Pick your path</h2>
        <div className="paths">
          <div className="card tone-mint"><h3>The tour</h3><p>Six short steps with instructions on every page. About two minutes.</p><a className="btn" href="#/tour/1">Start the tour</a></div>
          <div className="card"><h3>The playground</h3><p>Seventeen ready-made scenarios, or type your own message.</p><a className="btn" href="#/play">Open the playground</a></div>
          <div className="card"><h3>The code</h3><p>The source, the design notes and the plan for measuring it.</p><a className="btn" href={GITHUB} target="_blank" rel="noreferrer">Code on GitHub</a></div>
        </div>
      </section>
    </div>
  );
}
