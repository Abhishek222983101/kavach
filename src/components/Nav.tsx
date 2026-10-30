import type { Route } from '../router';
import { GITHUB } from '../content/links';

export default function Nav({ page }: { page: Route['page'] }) {
  return (
    <header className="nav">
      <a className="brand" href="#/" aria-label="Kavach home"><span className="logo" aria-hidden="true">K</span>Kavach</a>
      <nav aria-label="Main">
        <a className={page === 'tour' || page === 'done' ? 'on' : ''} href="#/tour/1">Take the tour</a>
        <a className={page === 'play' ? 'on' : ''} href="#/play">Playground</a>
        <a href={GITHUB} target="_blank" rel="noreferrer">Code on GitHub</a>
      </nav>
    </header>
  );
}

export function Footer() {
  return (
    <footer className="foot">
      <div className="wrap">
        <span>Kavach is a concept demo. No real AI model runs here, and all shop data is pretend.</span>
        <span><a href="#/">Home</a> · <a href="#/tour/1">Tour</a> · <a href="#/play">Playground</a> · <a href={GITHUB} target="_blank" rel="noreferrer">Code</a></span>
      </div>
    </footer>
  );
}
