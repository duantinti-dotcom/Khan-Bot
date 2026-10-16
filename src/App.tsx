import { lazy, Suspense } from 'react'
import { Route, Routes } from 'react-router-dom'
import { SiteDataProvider } from './context/SiteDataContext'
import { FeedbackProvider } from './components/ui/Feedback'
import { PageLoader } from './components/ui/Spinner'
import { PublicLayout } from './site/PublicLayout'
import HomePage from './site/pages/HomePage'
import { NotFoundPage, PrivacyPage, TermsPage } from './site/pages/LegalPage'

// O painel é carregado sob demanda: visitantes do site não baixam esse código.
const AdminApp = lazy(() => import('./admin/AdminApp'))

export default function App() {
  return (
    <SiteDataProvider>
      <FeedbackProvider>
        <Routes>
          <Route
            path="/admin/*"
            element={
              <Suspense fallback={<PageLoader label="Carregando painel…" />}>
                <AdminApp />
              </Suspense>
            }
          />
          <Route element={<PublicLayout />}>
            <Route index element={<HomePage />} />
            <Route path="privacidade" element={<PrivacyPage />} />
            <Route path="termos" element={<TermsPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Routes>
      </FeedbackProvider>
    </SiteDataProvider>
  )
}
