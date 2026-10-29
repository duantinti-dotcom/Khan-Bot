import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { get, post } from './api.js';
import { ToastProvider, Modal, Icon } from './ui.jsx';
import * as C from '@shared/calc.js';
import Auth from './pages/Auth.jsx';
import Onboarding from './pages/Onboarding.jsx';
import Home from './pages/Home.jsx';
import Movimentacoes from './pages/Movimentacoes.jsx';
import Plano from './pages/Plano.jsx';
import Metas from './pages/Metas.jsx';
import Perfil from './pages/Perfil.jsx';
import Recebi from './forms/Recebi.jsx';
import Gastei from './forms/Gastei.jsx';
import Guardei from './forms/Guardei.jsx';
import Transferir from './forms/Transferir.jsx';
import Comprar from './forms/Comprar.jsx';

const Ctx = createContext(null);
export const useApp = () => useContext(Ctx);

// Navegação principal: quatro áreas. Configurações, categorias e contas ficam no perfil.
const PAGES = [
  ['inicio', 'Início', 'inicio', Home],
  ['movimentacoes', 'Movimentações', 'mov', Movimentacoes],
  ['plano', 'Meu plano', 'plano', Plano],
  ['metas', 'Metas', 'metas', Metas],
  ['perfil', 'Perfil', 'perfil', Perfil],
];
const MODALS = { recebi: Recebi, gastei: Gastei, guardei: Guardei, transferir: Transferir, comprar: Comprar };

function applyTheme(theme) {
  const t = theme === 'sistema' ? (window.matchMedia('(prefers-color-scheme: light)').matches ? 'claro' : 'escuro') : theme || 'claro';
  document.documentElement.dataset.theme = t;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', t === 'claro' ? '#f6f2e9' : '#17181c');
}

function routeFromHash() {
  const [path] = location.hash.replace(/^#\/?/, '').split('?');
  const [page, sub = ''] = path.split('/');
  // Endereços antigos continuam funcionando.
  const legacy = { lancamentos: ['movimentacoes', ''], dinheiro: ['perfil', 'contas'], conta: ['perfil', 'dados'], aprender: ['perfil', 'aprender'] };
  if (legacy[page]) return { page: legacy[page][0], sub: legacy[page][1] };
  return { page: PAGES.some((p) => p[0] === page) ? page : 'inicio', sub };
}

function NewSheet({ onPick, onClose }) {
  const opts = [
    ['recebi', 'entrada', 'Entrada', 'Dinheiro que entrou ou vai entrar'],
    ['gastei', 'gasto', 'Gasto', 'Compra, conta ou despesa'],
    ['transferir', 'transf', 'Transferência', 'Entre minhas contas'],
    ['guardei', 'guardar', 'Guardar', 'Separar no app para uma meta'],
  ];
  return (
    <Modal title="Registrar" onClose={onClose}>
      <div className="new-grid">
        {opts.map(([k, ico, l, d]) => (
          <button key={k} className="btn" onClick={() => onPick(k)}><span className="ico"><Icon name={ico} /></span>{l}<small>{d}</small></button>
        ))}
      </div>
      <button className="btn block ghost" style={{ marginTop: 10 }} onClick={() => onPick('comprar')}>Simular uma compra antes</button>
    </Modal>
  );
}

function Celebrate({ goal, onClose }) {
  const bits = useMemo(() => Array.from({ length: 18 }, (_, i) => ({
    dx: `${Math.round(Math.cos((i / 18) * Math.PI * 2) * (120 + (i % 3) * 40))}px`,
    dy: `${Math.round(Math.sin((i / 18) * Math.PI * 2) * (120 + (i % 4) * 30))}px`,
    bg: ['#2347c6', '#2f7a57', '#c08a3e', '#8a6bb8'][i % 4],
  })), []);
  useEffect(() => { const t = setTimeout(onClose, 6000); return () => clearTimeout(t); }, [onClose]);
  return (
    <div className="celebrate" role="status">
      {bits.map((b, i) => <i key={i} style={{ '--dx': b.dx, '--dy': b.dy, background: b.bg }} />)}
      <div className="card">
        <h2>Meta atingida</h2>
        <p className="muted">“{goal.name}” chegou no valor que você queria.</p>
        <button className="btn primary" onClick={onClose}>Continuar</button>
      </div>
    </div>
  );
}

function readCelebrated() {
  try { return new Set(JSON.parse(localStorage.getItem('orbita.metas.comemoradas') || '[]')); } catch { return new Set(); }
}
function saveCelebrated(set) {
  try { localStorage.setItem('orbita.metas.comemoradas', JSON.stringify([...set])); } catch { /* sem armazenamento local */ }
}

export default function App() {
  const [me, setMe] = useState(undefined);
  const [data, setData] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [route, setRoute] = useState(routeFromHash());
  const [navState, setNavState] = useState(null);
  const [modal, setModal] = useState(null);
  const [celebrate, setCelebrate] = useState(null);

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
    const onHash = () => setRoute(routeFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, [reload]);

  // Comemora uma vez cada meta que acabou de ser atingida.
  useEffect(() => {
    if (!data) return;
    const done = readCelebrated();
    const first = done.size === 0 && !localStorage.getItem('orbita.metas.iniciado');
    for (const g of data.goals.filter((x) => !x.archived)) {
      const m = C.goalMetrics(g, data, data.today);
      if (m.status === 'atingida' && !done.has(g.id)) {
        done.add(g.id);
        if (!first) setCelebrate(g);
      }
    }
    saveCelebrated(done);
    try { localStorage.setItem('orbita.metas.iniciado', '1'); } catch { /* ignora */ }
  }, [data]);

  const go = useCallback((path, state = null) => {
    location.hash = `#/${path}`;
    setRoute(routeFromHash());
    setNavState(state);
    setModal(null);
    window.scrollTo({ top: 0 });
  }, []);
  const open = useCallback((name, props = {}) => setModal({ name, props }), []);
  const close = useCallback(() => setModal(null), []);
  const logout = useCallback(async () => {
    try { await post('/auth/logout'); } catch { /* sessão já encerrada */ }
    setMe(null); setData(null); applyTheme('claro');
    location.hash = '#/inicio';
  }, []);

  const ctx = useMemo(() => data && ({
    data, today: data.today, reload, open, close, go, me, logout, setMe, route, navState, setNavState,
  }), [data, reload, open, close, go, me, logout, route, navState]);

  if (me === undefined) return <div className="auth-wrap"><p className="muted">Carregando…</p></div>;
  if (!me) {
    return <ToastProvider><Auth onAuth={async (r) => { setMe(r); await reload(); }} error={loadError} /></ToastProvider>;
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
    return <Ctx.Provider value={ctx}><ToastProvider><Onboarding /></ToastProvider></Ctx.Provider>;
  }

  const Page = PAGES.find((p) => p[0] === route.page)[3];
  const ModalC = modal && MODALS[modal.name];
  const initial = (data.profile.display_name || data.user.username).slice(0, 1).toUpperCase();
  const tab = (k) => {
    const p = PAGES.find((x) => x[0] === k);
    return (
      <button key={k} className={route.page === k ? 'active' : ''} onClick={() => go(k)} aria-current={route.page === k ? 'page' : undefined}>
        <span className="ico"><Icon name={p[2]} /></span>{k === 'plano' ? 'Plano' : k === 'movimentacoes' ? 'Movimentos' : p[1]}
      </button>
    );
  };
  return (
    <Ctx.Provider value={ctx}>
      <ToastProvider>
        <div className="shell">
          <aside className="sidebar">
            <div className="brand"><img src="/icon.svg" alt="" />Órbita</div>
            {PAGES.map(([k, l, ico]) => (
              <button key={k} className={`navlink ${route.page === k ? 'active' : ''}`} onClick={() => go(k)} aria-current={route.page === k ? 'page' : undefined}>
                <span className="ico"><Icon name={ico} size={20} /></span>{l}
              </button>
            ))}
            <div className="spacer" />
            <button className="btn primary block" onClick={() => open('novo')}>+ Registrar</button>
            <button className="navlink" onClick={logout}><span className="ico"><Icon name="sair" size={20} /></span>Sair</button>
          </aside>
          <main className="main">
            <div className="page" key={`${route.page}/${route.sub}`}>
              <Page initial={initial} />
            </div>
          </main>
          <nav className="tabbar" aria-label="Navegação principal">
            {tab('inicio')}
            {tab('movimentacoes')}
            <div className="tab-plus"><button className="fab" onClick={() => open('novo')} aria-label="Registrar entrada, gasto, transferência ou aporte"><Icon name="mais" size={26} /></button></div>
            {tab('plano')}
            {tab('metas')}
          </nav>
        </div>
        {modal?.name === 'novo' && <NewSheet onClose={close} onPick={(k) => open(k)} />}
        {ModalC && <ModalC {...modal.props} onClose={close} />}
        {celebrate && <Celebrate goal={celebrate} onClose={() => setCelebrate(null)} />}
      </ToastProvider>
    </Ctx.Provider>
  );
}

export function TopBar({ title, subtitle, children }) {
  const { data, go } = useApp();
  const initial = (data.profile.display_name || data.user.username).slice(0, 1).toUpperCase();
  return (
    <div className="topbar">
      <div style={{ minWidth: 0 }}>
        {subtitle && <div className="hello">{subtitle}</div>}
        <h1>{title}</h1>
      </div>
      <div className="row">
        {children}
        <button className="avatar" onClick={() => go('perfil')} aria-label="Perfil, contas, categorias e configurações">{initial}</button>
      </div>
    </div>
  );
}
