import { StrictMode, Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';
import './game-hud.css';
import { installCursors } from './ui/gameCursor';

installCursors();

// O painel do ADM (O Administrador) fica fora do jogo: /#/admin
const AdminPanel = lazy(() => import('./ui/AdminPanel').then((m) => ({ default: m.AdminPanel })));
const isAdminRoute = () => location.hash.startsWith('#/admin');

const startedAdmin = isAdminRoute();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isAdminRoute() ? <Suspense fallback={null}><AdminPanel /></Suspense> : <App />}
  </StrictMode>,
);
// troca entre jogo e painel recarrega a página (outros usos do hash, como o link de senha, não)
window.addEventListener('hashchange', () => { if (isAdminRoute() !== startedAdmin) location.reload(); });
