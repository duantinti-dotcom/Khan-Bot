import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles.css';

// Mantém formulários e botões visíveis acima do teclado no celular: a altura visível real
// (visualViewport) vira variáveis CSS usadas pelos modais.
function trackViewport() {
  const vv = window.visualViewport;
  if (!vv) return;
  const set = () => {
    const kb = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
    document.documentElement.style.setProperty('--vvh', `${vv.height}px`);
    document.documentElement.style.setProperty('--kb', `${kb}px`);
  };
  vv.addEventListener('resize', set);
  vv.addEventListener('scroll', set);
  set();
}
trackViewport();

createRoot(document.getElementById('root')).render(<App />);
