import { useRoute } from './router';
import { TOUR } from './content/tour';
import Nav, { Footer } from './components/Nav';
import Home from './pages/Home';
import Tour from './pages/Tour';
import Done from './pages/Done';
import Play from './pages/Play';

export default function App() {
  const route = useRoute();
  const field = route.page === 'tour' ? TOUR[route.step - 1].field : route.page === 'done' ? 'mint' : route.page === 'play' ? 'sky' : 'yolk';
  return (
    <div className={`page field-${field}`}>
      <Nav page={route.page} />
      {route.page === 'home' && <Home />}
      {route.page === 'tour' && <Tour key={route.step} step={route.step} />}
      {route.page === 'done' && <Done />}
      {route.page === 'play' && <Play />}
      <Footer />
    </div>
  );
}
