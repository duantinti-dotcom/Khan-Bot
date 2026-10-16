import { lazy, Suspense, type ReactNode } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { ShieldAlert } from 'lucide-react'
import { AuthProvider, useAuth } from '../context/AuthContext'
import { PageLoader } from '../components/ui/Spinner'
import { Button } from '../components/ui/Button'
import { env } from '../lib/env'
import { useNoIndex } from '../lib/seo'
import { AuthShell } from './components/AuthShell'
import { AdminLayout } from './AdminLayout'
import LoginPage from './pages/LoginPage'
import { ForgotPasswordPage, ResetPasswordPage } from './pages/PasswordPages'

const OverviewPage = lazy(() => import('./pages/OverviewPage'))
const QuotesPage = lazy(() => import('./pages/QuotesPage'))
const CustomersPage = lazy(() => import('./pages/CustomersPage'))
const ServicesPage = lazy(() => import('./pages/ServicesPage'))
const GalleryPage = lazy(() => import('./pages/GalleryPage'))
const ReviewsPage = lazy(() => import('./pages/ReviewsPage'))
const FaqsPage = lazy(() => import('./pages/FaqsPage'))
const ContentPage = lazy(() => import('./pages/ContentPage'))
const SettingsPage = lazy(() => import('./pages/SettingsPage'))

export default function AdminApp() {
  if (!env.hasBackend) return <NotConfigured />
  return (
    <AuthProvider>
      <Routes>
        <Route path="login" element={<LoginPage />} />
        <Route path="recuperar-senha" element={<ForgotPasswordPage />} />
        <Route path="redefinir-senha" element={<ResetPasswordPage />} />
        <Route
          element={
            <RequireAdmin>
              <AdminLayout />
            </RequireAdmin>
          }
        >
          <Route index element={<Lazy el={<OverviewPage />} />} />
          <Route path="orcamentos" element={<Lazy el={<QuotesPage />} />} />
          <Route path="clientes" element={<Lazy el={<CustomersPage />} />} />
          <Route path="servicos" element={<Lazy el={<ServicesPage />} />} />
          <Route path="galeria" element={<Lazy el={<GalleryPage />} />} />
          <Route path="avaliacoes" element={<Lazy el={<ReviewsPage />} />} />
          <Route path="perguntas" element={<Lazy el={<FaqsPage />} />} />
          <Route path="conteudo" element={<Lazy el={<ContentPage />} />} />
          <Route path="configuracoes" element={<Lazy el={<SettingsPage />} />} />
          <Route path="*" element={<Navigate to="/admin" replace />} />
        </Route>
      </Routes>
    </AuthProvider>
  )
}

function Lazy({ el }: { el: ReactNode }) {
  return <Suspense fallback={<PageLoader />}>{el}</Suspense>
}

/**
 * Proteção de rota no frontend. A proteção REAL dos dados está no banco (RLS):
 * mesmo chamando a API diretamente, quem não é admin não lê nem altera nada.
 */
function RequireAdmin({ children }: { children: ReactNode }) {
  const { session, isAdmin, loading, signOut, user } = useAuth()
  const location = useLocation()
  useNoIndex('Acesso')
  if (loading) return <PageLoader label="Verificando acesso…" />
  if (!session) return <Navigate to={`/admin/login?next=${encodeURIComponent(location.pathname + location.search)}`} replace />
  if (!isAdmin)
    return (
      <AuthShell title="Acesso não autorizado" subtitle={`A conta ${user?.email ?? ''} não tem permissão administrativa.`}>
        <div className="grid gap-4">
          <div className="flex gap-3 rounded-xl border border-warning/30 bg-warning/[0.07] p-4 text-sm text-steel-200">
            <ShieldAlert className="size-5 shrink-0 text-warning" />
            Peça ao responsável pelo sistema para liberar seu acesso. Nenhum dado administrativo é exibido para esta conta.
          </div>
          <Button variant="outline" onClick={() => void signOut()}>
            Sair e entrar com outra conta
          </Button>
        </div>
      </AuthShell>
    )
  return <>{children}</>
}

function NotConfigured() {
  useNoIndex('Configuração pendente')
  return (
    <AuthShell title="Painel não configurado" subtitle="O banco de dados ainda não foi conectado a este site.">
      <div className="grid gap-3 text-sm leading-relaxed text-steel-300">
        <p>Para ativar o painel administrativo, defina as variáveis abaixo no ambiente de publicação e gere um novo build:</p>
        <pre className="overflow-x-auto rounded-xl border border-ink-700 bg-ink-950 p-4 text-xs text-steel-200">
          VITE_SUPABASE_URL=…{'\n'}VITE_SUPABASE_ANON_KEY=…
        </pre>
        <p>O passo a passo completo está no README do projeto.</p>
      </div>
    </AuthShell>
  )
}
