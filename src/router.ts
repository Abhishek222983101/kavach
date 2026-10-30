import { useEffect, useState } from 'react';

export type Route =
  | { page: 'home' }
  | { page: 'tour'; step: number }
  | { page: 'done' }
  | { page: 'play' };

export const TOUR_STEPS = 6;

function parse(): Route {
  const [a, b] = location.hash.replace(/^#\/?/, '').split('/');
  if (a === 'tour') return { page: 'tour', step: Math.min(TOUR_STEPS, Math.max(1, Number(b) || 1)) };
  if (a === 'done') return { page: 'done' };
  if (a === 'play') return { page: 'play' };
  return { page: 'home' };
}

export function useRoute(): Route {
  const [r, setR] = useState<Route>(parse);
  useEffect(() => {
    const f = () => { setR(parse()); window.scrollTo(0, 0); };
    window.addEventListener('hashchange', f);
    return () => window.removeEventListener('hashchange', f);
  }, []);
  return r;
}
