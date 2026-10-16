import { useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { Eye, EyeOff, LogIn } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Field'
import { friendlyError } from '../../lib/errors'
import { useNoIndex } from '../../lib/seo'
import { AuthShell } from '../components/AuthShell'

export default function LoginPage() {
  useNoIndex('Entrar')
  const { signIn, session, isAdmin, loading } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const next = params.get('next')
  const safeNext = next && next.startsWith('/admin') && !next.startsWith('//') ? next : '/admin'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [errors, setErrors] = useState<{ email?: string; password?: string; form?: string }>({})
  const [submitting, setSubmitting] = useState(false)

  if (!loading && session && isAdmin) return <Navigate to={safeNext} replace />

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    const errs: typeof errors = {}
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) errs.email = 'Informe um e-mail válido.'
    if (!password) errs.password = 'Informe sua senha.'
    setErrors(errs)
    if (Object.keys(errs).length) return
    setSubmitting(true)
    try {
      await signIn(email, password)
      navigate(safeNext, { replace: true })
    } catch (err) {
      setErrors({ form: friendlyError(err, 'Não foi possível entrar. Tente novamente.') })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AuthShell title="Entrar no painel" subtitle="Use o e-mail e a senha da sua conta administrativa.">
      <form onSubmit={onSubmit} noValidate className="grid gap-5">
        {errors.form && (
          <p role="alert" className="rounded-xl border border-danger/30 bg-danger/[0.07] px-4 py-3 text-sm text-danger">
            {errors.form}
          </p>
        )}
        <Input label="E-mail" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} error={errors.email} data-autofocus autoFocus />
        <div className="relative">
          <Input
            label="Senha"
            type={show ? 'text' : 'password'}
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={errors.password}
            className="pr-12"
          />
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            className="absolute top-[1.9rem] right-2 flex size-9 items-center justify-center rounded-full text-steel-400 hover:text-snow"
            aria-label={show ? 'Ocultar senha' : 'Mostrar senha'}
            aria-pressed={show}
          >
            {show ? <EyeOff className="size-4.5" /> : <Eye className="size-4.5" />}
          </button>
        </div>
        <div className="flex justify-end">
          <Link to="/admin/recuperar-senha" className="text-sm text-steel-300 hover:text-snow">
            Esqueci minha senha
          </Link>
        </div>
        <Button type="submit" size="lg" loading={submitting} icon={<LogIn className="size-4" />}>
          {submitting ? 'Entrando…' : 'Entrar'}
        </Button>
      </form>
    </AuthShell>
  )
}
