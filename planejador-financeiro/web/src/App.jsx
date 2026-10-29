import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { get, post } from './api.js';
import { ToastProvider } from './ui.jsx';
import Auth from './pages/Auth.jsx';
import Onboarding from './pages/Onboarding.jsx';
import Home from './pages/Home.jsx';
import Lancamentos from './pages/Lancamentos.jsx';
import Metas from './pages/Metas.jsx';
import Dinheiro from './pages/Dinheiro.jsx';
import Plano from './pages/Plano.jsx';
import Aprender from './pages/Aprender.jsx';
import Conta from './pages/Conta.jsx';
import Recebi from './forms/Recebi.jsx';
import Gastei from './forms/Gastei.jsx';
import Guardei from './forms/Guardei.jsx';
import Transferir from './forms/Transferir.jsx';
import Comprar from './forms/Comprar.jsx';

const Ctx = createContext(null);
export const useApp = () => useContext(Ctx);

const PAGES = [
  ['inicio', 'Início', '◎', Home],
  ['lancamentos', 'Lançamentos', '⇅', Lancamentos],
  ['metas', 'Minhas metas', '◆', Metas],
  ['dinheiro', 'Meu dinheiro', '▣', Dinheiro],
  ['plano', 'Meu plano', '✦', Plano],
  ['aprender', 'Onde guardar', '❖', Aprender],
  ['conta', 'Minha conta', '☺', Conta],
];
const MOBILE_TABS = ['inicio', 'lancamentos', 'metas', 'plano', 'mais'];
const MODALS = { recebi: Recebi, gastei: Gastei, guardei: Guardei, transferir: Transferir, comprar: Comprar };

function applyTheme(theme) {
  const t = theme === 'sistema' ? (window.matchMedia('(prefers-color-scheme: light)').matches ? 'claro' : 'escuro') : theme || 'escuro';
  document.documentElement.dataset.theme = t;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', t === 'claro' ? '#f3f6fb' : '#070b14');
}

function pageFromHash() {
  const h = location.hash.replace('#/', '').split('?')[0];
  return PAGES.some((p) => p[0] === h) ? h : 'inicio';
}

export default function App() {
  const [me, setMe] = useState(undefined);
  const [data, setData] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [page, setPage] = useState(pageFromHash());
  const [modal, setModal] = useState(null);
  const [more, setMore] = useState(false);

  const reload = useCallback(async () => {
    try {
      const d = await get('/data');
      setData(d);
      setLoadError(null);
      applyTheme(d.profile?.theme);
      return d;
    } catch (e) {
      if (e.status === 401) { setMe(null); setData(null); return null; }
      setLoadError(e.message);
      return null;
    }
  }, []);

  useEffect(() => {
    get('/auth/me').then((r) => { setMe(r.user ? r : null); if (r.user) reload(); }).catch((e) => { setMe(null); setLoadError(e.message); });
    const onHash = () => setPage(pageFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, [reload]);

  const go = useCallback((p) => { location.hash = `#/${p}`; setPage(p); setMore(false); window.scrollTo({ top: 0 }); }, []);
  const open = useCallback((name, props = {}) => setModal({ name, props }), []);
  const close = useCallback(() => setModal(null), []);
  const logout = useCallback(async () => {
    try { await post('/auth/logout'); } catch { /* sessão já encerrada */ }
    setMe(null); setData(null); applyTheme('escuro');
  }, []);

  const ctx = useMemo(() => data && ({ data, today: data.today, reload, open, close, go, me, logout, setMe }), [data, reload, open, close, go, me, logout]);

  if (me === undefined) return <div className="auth-wrap"><p className="muted">Carregando…</p></div>;
  if (!me) {
    return (
      <ToastProvider>
        <Auth onAuth={async (r) => { setMe(r); await reload(); }} error={loadError} />
      </ToastProvider>
    );
  }
  if (!data) {
    return (
      <div className="auth-wrap">
        <div className="card auth stack">
          <p>{loadError || 'Carregando seus dados…'}</p>
          {loadError && <button className="btn" onClick={reload}>Tentar de novo</button>}
        </div>
      </div>
    );
  }
  if (!data.profile.onboarding_done) {
    return (
      <Ctx.Provider value={ctx}>
        <ToastProvider><Onboarding /></ToastProvider>
      </Ctx.Provider>
    );
  }

  const Page = PAGES.find((p) => p[0] === page)[3];
  const ModalC = modal && MODALS[modal.name];
  return (
    <Ctx.Provider value={ctx}>
      <ToastProvider>
        <div className="shell">
          <aside className="sidebar">
            <div className="brand"><img src="/icon.svg" alt="" />Órbita</div>
            {PAGES.map(([k, l, ico]) => (
              <button key={k} className={`navlink ${page === k ? 'active' : ''}`} onClick={() => go(k)} aria-current={page === k ? 'page' : undefined}>
                <span className="ico" aria-hidden="true">{ico}</span>{l}
              </button>
            ))}
            <div className="spacer" />
            <button className="btn primary block" onClick={() => open('recebi')}>+ Recebi dinheiro</button>
            <button className="navlink" onClick={logout}><span className="ico">⎋</span>Sair</button>
          </aside>
          <main className="main">
            <Page />
          </main>
          <nav className="tabbar" aria-label="Navegação principal">
            {MOBILE_TABS.map((k) => {
              if (k === 'mais') {
                const active = ['dinheiro', 'aprender', 'conta'].includes(page);
                return <button key={k} className={active ? 'active' : ''} onClick={() => setMore(true)}><span className="ico">☰</span>Mais</button>;
              }
              const p = PAGES.find((x) => x[0] === k);
              return <button key={k} className={page === k ? 'active' : ''} onClick={() => go(k)}><span className="ico">{p[2]}</span>{k === 'metas' ? 'Metas' : k === 'plano' ? 'Plano' : p[1]}</button>;
            })}
          </nav>
        </div>
        {more && (
          <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && setMore(false)}>
            <div className="modal">
              <div className="modal-h"><h2>Mais</h2><button className="btn small ghost" onClick={() => setMore(false)} aria-label="Fechar">✕</button></div>
              <div className="stack">
                {PAGES.filter((p) => ['dinheiro', 'aprender', 'conta'].includes(p[0])).map(([k, l, ico]) => (
                  <button key={k} className="btn block" style={{ justifyContent: 'flex-start' }} onClick={() => go(k)}><span>{ico}</span>{l}</button>
                ))}
                <button className="btn block" style={{ justifyContent: 'flex-start' }} onClick={() => { setMore(false); open('transferir'); }}>⇄ Transferir entre contas</button>
                <button className="btn block" style={{ justifyContent: 'flex-start' }} onClick={() => { setMore(false); open('comprar'); }}>? Posso comprar isso?</button>
                <button className="btn danger block" onClick={logout}>Sair da conta</button>
              </div>
            </div>
          </div>
        )}
        {ModalC && <ModalC {...modal.props} onClose={close} />}
      </ToastProvider>
    </Ctx.Provider>
  );
}
