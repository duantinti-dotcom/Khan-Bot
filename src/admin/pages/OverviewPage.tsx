import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, BadgeCheck, CheckCheck, FileText, Inbox, PenSquare, PhoneCall, Plus, Wrench } from 'lucide-react'
import { getDashboardStats, listQuotes, type DashboardStats } from '../../data/admin'
import type { QuoteRequest } from '../../lib/types'
import { friendlyError } from '../../lib/errors'
import { quoteCode, relativeTime } from '../../lib/format'
import { PageLoader } from '../../components/ui/Spinner'
import { EmptyState, ErrorState } from '../../components/ui/Misc'
import { PageHeader, Panel, StatusBadge } from '../components/PageHeader'
import { DailyBars, RankBars } from '../components/Charts'

export default function OverviewPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [recent, setRecent] = useState<QuoteRequest[]>([])
  const [days, setDays] = useState(30)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [s, r] = await Promise.all([getDashboardStats(days), listQuotes({ pageSize: 6 })])
      setStats(s)
      setRecent(r.rows)
    } catch (err) {
      setError(friendlyError(err, 'Não foi possível carregar os indicadores.'))
    } finally {
      setLoading(false)
    }
  }, [days])

  useEffect(() => {
    void load()
  }, [load])

  const by = stats?.by_status ?? {}
  const cards = [
    { label: 'Total de solicitações', value: stats?.total ?? 0, icon: FileText, to: '/admin/orcamentos' },
    { label: 'Novas', value: by.novo ?? 0, icon: Inbox, to: '/admin/orcamentos?status=novo', highlight: (by.novo ?? 0) > 0 },
    { label: 'Em contato', value: by.em_contato ?? 0, icon: PhoneCall, to: '/admin/orcamentos?status=em_contato' },
    { label: 'Orçamentos aprovados', value: stats?.approved_ever ?? 0, icon: BadgeCheck, to: '/admin/orcamentos?status=aprovado', hint: 'Pedidos que já tiveram o orçamento aprovado' },
    { label: 'Serviços concluídos', value: by.concluido ?? 0, icon: CheckCheck, to: '/admin/orcamentos?status=concluido' },
  ]
  const periodTotal = stats?.per_day.reduce((a, d) => a + d.count, 0) ?? 0

  return (
    <>
      <PageHeader
        title="Visão geral"
        description="Indicadores calculados a partir das solicitações registradas no sistema."
        actions={
          <>
            <Link to="/admin/servicos?novo=1" className="inline-flex h-10 items-center gap-2 rounded-full border border-ink-600 px-4 text-sm font-medium hover:bg-white/5">
              <Plus className="size-4" /> Novo serviço
            </Link>
            <Link to="/admin/orcamentos" className="inline-flex h-10 items-center gap-2 rounded-full bg-accent px-4 text-sm font-semibold text-white hover:bg-accent-strong">
              Ver orçamentos <ArrowRight className="size-4" />
            </Link>
          </>
        }
      />

      {error && <ErrorState message={error} onRetry={load} />}
      {loading && !stats ? (
        <PageLoader />
      ) : (
        stats && (
          <div className="grid gap-6">
            <ul className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
              {cards.map((c) => (
                <li key={c.label} className={c.label === 'Total de solicitações' ? 'col-span-2 md:col-span-1' : ''}>
                  <Link
                    to={c.to}
                    title={c.hint}
                    className={`group flex h-full flex-col rounded-2xl border bg-ink-900 p-5 transition-colors hover:border-ink-500 ${c.highlight ? 'border-accent/40' : 'border-ink-700'}`}
                  >
                    <div className="flex items-center justify-between text-steel-400">
                      <span className="text-xs font-medium">{c.label}</span>
                      <c.icon className={`size-4 ${c.highlight ? 'text-accent' : ''}`} />
                    </div>
                    <span className="font-wide mt-4 text-3xl font-bold tabular-nums">{c.value}</span>
                  </Link>
                </li>
              ))}
            </ul>

            <div className="grid gap-6 xl:grid-cols-3">
              <Panel
                className="xl:col-span-2"
                title="Solicitações por dia"
                description={`${periodTotal} no período`}
                actions={
                  <div className="flex rounded-full border border-ink-600 p-0.5 text-xs" role="group" aria-label="Período">
                    {[7, 30, 90].map((d) => (
                      <button
                        key={d}
                        type="button"
                        aria-pressed={days === d}
                        onClick={() => setDays(d)}
                        className={`h-7 rounded-full px-3 font-medium ${days === d ? 'bg-snow text-ink-950' : 'text-steel-300 hover:text-snow'}`}
                      >
                        {d} dias
                      </button>
                    ))}
                  </div>
                }
              >
                {periodTotal === 0 ? (
                  <EmptyState icon={<FileText className="size-5" />} title="Sem solicitações no período" text="O gráfico aparece assim que houver pedidos registrados pelo site." />
                ) : (
                  <DailyBars data={stats.per_day} />
                )}
              </Panel>

              <Panel title="Serviços mais solicitados">
                {stats.top_services.length < 1 ? (
                  <EmptyState icon={<Wrench className="size-5" />} title="Ainda sem dados" text="Os serviços aparecem aqui conforme as solicitações chegam." />
                ) : (
                  <RankBars data={stats.top_services} />
                )}
              </Panel>
            </div>

            <div className="grid gap-6 xl:grid-cols-3">
              <Panel
                className="xl:col-span-2"
                title="Solicitações recentes"
                actions={
                  <Link to="/admin/orcamentos" className="text-xs font-semibold text-accent hover:underline">
                    Ver todas
                  </Link>
                }
              >
                {recent.length === 0 ? (
                  <EmptyState icon={<Inbox className="size-5" />} title="Nenhuma solicitação ainda" text="Quando um cliente enviar o formulário do site, o pedido aparecerá aqui." />
                ) : (
                  <ul className="-my-2 divide-y divide-ink-700">
                    {recent.map((q) => (
                      <li key={q.id}>
                        <Link to={`/admin/orcamentos?id=${q.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-3 hover:text-snow">
                          <span className="font-wide w-20 text-xs font-semibold text-steel-400">{quoteCode(q.number)}</span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium">{q.customer_name}</span>
                            <span className="block truncate text-xs text-steel-400">
                              {q.vehicle_brand} {q.vehicle_model} · {q.service_name}
                            </span>
                          </span>
                          <StatusBadge status={q.status} />
                          <span className="w-20 text-right text-xs text-steel-400">{relativeTime(q.created_at)}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>

              <Panel title="Atalhos">
                <ul className="grid gap-2">
                  {[
                    { to: '/admin/orcamentos?status=novo', label: 'Responder pedidos novos', icon: Inbox },
                    { to: '/admin/servicos', label: 'Gerenciar serviços', icon: Wrench },
                    { to: '/admin/conteudo', label: 'Editar conteúdo do site', icon: PenSquare },
                    { to: '/admin/galeria', label: 'Atualizar galeria', icon: Plus },
                  ].map((s) => (
                    <li key={s.to}>
                      <Link to={s.to} className="flex h-11 items-center gap-3 rounded-xl border border-ink-700 px-3 text-sm text-steel-200 transition-colors hover:border-ink-500 hover:text-snow">
                        <s.icon className="size-4 text-steel-400" />
                        <span className="flex-1">{s.label}</span>
                        <ArrowRight className="size-4 text-steel-400" />
                      </Link>
                    </li>
                  ))}
                </ul>
              </Panel>
            </div>
          </div>
        )
      )}
    </>
  )
}
