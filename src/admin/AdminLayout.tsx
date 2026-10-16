import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import {
  ExternalLink,
  FileText,
  HelpCircle,
  Images,
  LayoutDashboard,
  LogOut,
  Menu,
  PenSquare,
  Settings,
  Star,
  Users,
  Wrench,
  X,
} from 'lucide-react'
import { Logo } from '../components/brand/Logo'
import { useAuth } from '../context/AuthContext'
import { useSiteData } from '../context/SiteDataContext'
import { useFeedback } from '../components/ui/Feedback'
import { supabase } from '../lib/supabase'

export const ADMIN_NAV = [
  { to: '/admin', label: 'Visão geral', icon: LayoutDashboard, end: true },
  { to: '/admin/orcamentos', label: 'Orçamentos', icon: FileText },
  { to: '/admin/clientes', label: 'Clientes', icon: Users },
  { to: '/admin/servicos', label: 'Serviços', icon: Wrench },
  { to: '/admin/galeria', label: 'Galeria', icon: Images },
  { to: '/admin/avaliacoes', label: 'Avaliações', icon: Star },
  { to: '/admin/perguntas', label: 'Perguntas frequentes', icon: HelpCircle },
  { to: '/admin/conteudo', label: 'Conteúdo do site', icon: PenSquare },
  { to: '/admin/configuracoes', label: 'Configurações', icon: Settings },
]

/** Atualiza o contador de pedidos novos ao trocar de página. */
function useNewQuotesCount() {
  const [count, setCount] = useState(0)
  const { pathname } = useLocation()
  useEffect(() => {
    let active = true
    supabase
      ?.from('quote_requests')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'novo')
      .then(({ count: c }) => active && setCount(c ?? 0))
    return () => {
      active = false
    }
  }, [pathname])
  return count
}

export function AdminLayout() {
  const { user, profile, signOut } = useAuth()
  const { data, reload } = useSiteData()
  const { confirm } = useFeedback()
  const [drawer, setDrawer] = useState(false)
  const { pathname } = useLocation()
  const newCount = useNewQuotesCount()
  const current = [...ADMIN_NAV].reverse().find((n) => (n.end ? pathname === n.to : pathname.startsWith(n.to))) ?? ADMIN_NAV[0]

  useEffect(() => setDrawer(false), [pathname])
  // Ao sair do painel, o site público recarrega com as alterações salvas.
  useEffect(() => () => void reload(), [reload])

  const logout = async () => {
    if (await confirm({ title: 'Sair do painel', message: 'Deseja encerrar sua sessão neste dispositivo?', confirmLabel: 'Sair' })) await signOut()
  }

  const initials = (profile?.full_name || user?.email || '?').trim().charAt(0).toUpperCase()

  const nav = (
    <nav aria-label="Painel" className="flex flex-1 flex-col gap-1 overflow-y-auto px-3 py-4">
      {ADMIN_NAV.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          className={({ isActive }) =>
            `group relative flex h-10 items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors ${
              isActive ? 'bg-white/[0.06] text-snow' : 'text-steel-400 hover:bg-white/[0.03] hover:text-snow'
            }`
          }
        >
          {({ isActive }) => (
            <>
              {isActive && <span className="absolute top-2 bottom-2 left-0 w-0.5 rounded-full bg-accent" />}
              <item.icon className={`size-4.5 ${isActive ? 'text-accent' : ''}`} strokeWidth={1.75} />
              <span className="flex-1">{item.label}</span>
              {item.to === '/admin/orcamentos' && newCount > 0 && (
                <span className="rounded-full bg-accent px-2 py-0.5 text-[0.68rem] font-bold text-white" aria-label={`${newCount} novos`}>
                  {newCount}
                </span>
              )}
            </>
          )}
        </NavLink>
      ))}
    </nav>
  )

  const footer = (
    <div className="border-t border-ink-700 p-3">
      <a href="/" target="_blank" rel="noopener noreferrer" className="flex h-10 items-center gap-3 rounded-xl px-3 text-sm text-steel-400 hover:bg-white/[0.03] hover:text-snow">
        <ExternalLink className="size-4.5" strokeWidth={1.75} /> Ver site
      </a>
      <button type="button" onClick={logout} className="flex h-10 w-full items-center gap-3 rounded-xl px-3 text-sm text-steel-400 hover:bg-danger/10 hover:text-danger">
        <LogOut className="size-4.5" strokeWidth={1.75} /> Sair
      </button>
    </div>
  )

  return (
    <div className="min-h-dvh bg-ink-950 lg:pl-64">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-ink-700 bg-ink-900 lg:flex">
        <div className="flex h-16 items-center border-b border-ink-700 px-5">
          <Logo name={data.settings.business.name} logoUrl={data.settings.business.logoUrl} />
        </div>
        {nav}
        {footer}
      </aside>

      {drawer && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu do painel">
          <div className="absolute inset-0 animate-fade-in bg-black/70" onClick={() => setDrawer(false)} />
          <aside className="relative flex h-full w-72 max-w-[85vw] animate-slide-in-left flex-col border-r border-ink-700 bg-ink-900">
            <div className="flex h-16 items-center justify-between border-b border-ink-700 px-4">
              <Logo name={data.settings.business.name} logoUrl={data.settings.business.logoUrl} />
              <button type="button" onClick={() => setDrawer(false)} className="flex size-9 items-center justify-center rounded-full text-steel-300 hover:bg-white/5" aria-label="Fechar menu">
                <X className="size-5" />
              </button>
            </div>
            {nav}
            {footer}
          </aside>
        </div>
      )}

      <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-ink-700 bg-ink-950/90 px-4 backdrop-blur-md sm:px-6 lg:px-8">
        <button type="button" onClick={() => setDrawer(true)} className="flex size-10 items-center justify-center rounded-full border border-ink-600 lg:hidden" aria-label="Abrir menu">
          <Menu className="size-5" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="hidden text-xs text-steel-400 sm:block">Painel · {data.settings.business.name}</p>
          <p className="truncate text-sm font-semibold sm:text-base">{current.label}</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden text-right sm:block">
            <p className="text-sm font-medium">{profile?.full_name || 'Administrador'}</p>
            <p className="text-xs text-steel-400">{user?.email}</p>
          </div>
          <span className="font-wide flex size-9 items-center justify-center rounded-full bg-accent/15 text-sm font-bold text-accent ring-1 ring-accent/30" aria-hidden="true">
            {initials}
          </span>
        </div>
      </header>

      <main className="px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        <Outlet />
      </main>
    </div>
  )
}
