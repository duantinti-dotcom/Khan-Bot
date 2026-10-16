import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, CheckCircle2, Eye, EyeOff } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { env } from '../../lib/env'
import { useAuth } from '../../context/AuthContext'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Field'
import { Notice } from '../../components/ui/Misc'
import { PageLoader } from '../../components/ui/Spinner'
import { friendlyError } from '../../lib/errors'
import { useNoIndex } from '../../lib/seo'
import { AuthShell } from '../components/AuthShell'

export function ForgotPasswordPage() {
  useNoIndex('Recuperar senha')
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('Informe um e-mail válido.')
      return
    }
    setError('')
    setLoading(true)
    try {
      const origin = env.siteUrl || window.location.origin
      const { error: err } = await supabase!.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${origin}/admin/redefinir-senha` })
      if (err) throw err
      setSent(true)
    } catch (err) {
      setError(friendlyError(err, 'Não foi possível enviar o e-mail agora.'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthShell title="Recuperar senha" subtitle="Enviaremos um link para você criar uma nova senha.">
      {sent ? (
        <div className="grid gap-5">
          <Notice tone="success">
            Se houver uma conta com o e-mail <strong>{email}</strong>, você receberá as instruções em instantes. Confira também a caixa de spam.
          </Notice>
          <Link to="/admin/login" className="inline-flex items-center gap-2 text-sm text-steel-300 hover:text-snow">
            <ArrowLeft className="size-4" /> Voltar ao login
          </Link>
        </div>
      ) : (
        <form onSubmit={onSubmit} noValidate className="grid gap-5">
          <Input label="E-mail" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} error={error} autoFocus />
          <Button type="submit" size="lg" loading={loading}>
            Enviar link
          </Button>
          <Link to="/admin/login" className="inline-flex items-center gap-2 text-sm text-steel-300 hover:text-snow">
            <ArrowLeft className="size-4" /> Voltar ao login
          </Link>
        </form>
      )}
    </AuthShell>
  )
}

export function ResetPasswordPage() {
  useNoIndex('Nova senha')
  const { session, loading } = useAuth()
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [show, setShow] = useState(false)
  const [errors, setErrors] = useState<{ password?: string; confirm?: string; form?: string }>({})
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)
  const [waited, setWaited] = useState(false)

  // O link do e-mail cria a sessão de recuperação ao abrir esta página.
  useEffect(() => {
    const t = window.setTimeout(() => setWaited(true), 1500)
    return () => window.clearTimeout(t)
  }, [])

  if (loading || (!session && !waited)) return <PageLoader label="Validando link…" />

  if (!session)
    return (
      <AuthShell title="Link inválido ou expirado" subtitle="Solicite um novo link de recuperação.">
        <Link to="/admin/recuperar-senha" className="text-sm font-semibold text-accent hover:underline">
          Solicitar novo link
        </Link>
      </AuthShell>
    )

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    const errs: typeof errors = {}
    if (password.length < 10) errs.password = 'Use pelo menos 10 caracteres.'
    if (confirm !== password) errs.confirm = 'As senhas não coincidem.'
    setErrors(errs)
    if (Object.keys(errs).length) return
    setSaving(true)
    try {
      const { error } = await supabase!.auth.updateUser({ password })
      if (error) throw error
      setDone(true)
      window.setTimeout(() => navigate('/admin', { replace: true }), 1500)
    } catch (err) {
      setErrors({ form: friendlyError(err, 'Não foi possível salvar a nova senha.') })
    } finally {
      setSaving(false)
    }
  }

  return (
    <AuthShell title="Criar nova senha" subtitle={session.user.email ?? undefined}>
      {done ? (
        <Notice tone="success">
          <span className="flex items-center gap-2">
            <CheckCircle2 className="size-4 text-success" /> Senha atualizada. Redirecionando…
          </span>
        </Notice>
      ) : (
        <form onSubmit={onSubmit} noValidate className="grid gap-5">
          {errors.form && (
            <p role="alert" className="rounded-xl border border-danger/30 bg-danger/[0.07] px-4 py-3 text-sm text-danger">
              {errors.form}
            </p>
          )}
          <div className="relative">
            <Input label="Nova senha" type={show ? 'text' : 'password'} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} error={errors.password} hint="Mínimo de 10 caracteres." className="pr-12" />
            <button type="button" onClick={() => setShow((s) => !s)} className="absolute top-[1.9rem] right-2 flex size-9 items-center justify-center rounded-full text-steel-400 hover:text-snow" aria-label={show ? 'Ocultar senha' : 'Mostrar senha'}>
              {show ? <EyeOff className="size-4.5" /> : <Eye className="size-4.5" />}
            </button>
          </div>
          <Input label="Confirmar senha" type={show ? 'text' : 'password'} autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} error={errors.confirm} />
          <Button type="submit" size="lg" loading={saving}>
            Salvar nova senha
          </Button>
        </form>
      )}
    </AuthShell>
  )
}
