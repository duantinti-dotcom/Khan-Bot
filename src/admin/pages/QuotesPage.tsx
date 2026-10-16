import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ChevronRight, FileText, Search, X } from 'lucide-react'
import { listQuotes, type QuoteFilters } from '../../data/admin'
import type { QuoteRequest, QuoteStatus } from '../../lib/types'
import { STATUS_META, STATUS_ORDER } from '../../lib/status'
import { formatDateTime, quoteCode, relativeTime } from '../../lib/format'
import { formatPhone } from '../../lib/phone'
import { friendlyError } from '../../lib/errors'
import { PageLoader } from '../../components/ui/Spinner'
import { EmptyState, ErrorState } from '../../components/ui/Misc'
import { PageHeader, Pagination, StatusBadge } from '../components/PageHeader'
import { QuoteDetail } from '../components/QuoteDetail'

const PAGE_SIZE = 15

export default function QuotesPage() {
  const [params, setParams] = useSearchParams()
  const status = (params.get('status') ?? '') as QuoteStatus | ''
  const from = params.get('de') ?? ''
  const to = params.get('ate') ?? ''
  const sort = (params.get('ordem') ?? 'created_desc') as QuoteFilters['sort']
  const page = Number(params.get('pagina') ?? 0)
  const selectedId = params.get('id')
  const [search, setSearch] = useState(params.get('busca') ?? '')

  const [rows, setRows] = useState<QuoteRequest[]>([])
  const [count, setCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const update = useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(params)
      for (const [k, v] of Object.entries(patch)) {
        if (v === null || v === '') next.delete(k)
        else next.set(k, v)
      }
      if (!('pagina' in patch)) next.delete('pagina')
      setParams(next, { replace: true })
    },
    [params, setParams],
  )

  // Pesquisa com atraso para não consultar a cada tecla.
  useEffect(() => {
    const t = window.setTimeout(() => {
      if ((params.get('busca') ?? '') !== search) update({ busca: search })
    }, 350)
    return () => window.clearTimeout(t)
  }, [search, params, update])

  const busca = params.get('busca') ?? ''
  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await listQuotes({ search: busca, status, from, to, sort, page, pageSize: PAGE_SIZE })
      setRows(res.rows)
      setCount(res.count)
    } catch (err) {
      setError(friendlyError(err, 'Não foi possível carregar as solicitações.'))
    } finally {
      setLoading(false)
    }
  }, [busca, status, from, to, sort, page])

  useEffect(() => {
    void load()
  }, [load])

  const onChanged = (q: QuoteRequest | null, removedId?: string) => {
    if (removedId) {
      setRows((r) => r.filter((x) => x.id !== removedId))
      setCount((c) => Math.max(0, c - 1))
      update({ id: null, pagina: String(page) })
      return
    }
    if (q) setRows((r) => r.map((x) => (x.id === q.id ? q : x)))
  }

  const hasFilters = Boolean(busca || status || from || to)

  return (
    <>
      <PageHeader title="Orçamentos" description="Solicitações enviadas pelo site. Atualize o status conforme o atendimento avança." />

      <div className="mb-4 grid gap-3 lg:grid-cols-[1fr_auto_auto_auto_auto]">
        <label className="relative">
          <span className="sr-only">Pesquisar</span>
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-steel-400" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Nome, telefone, veículo ou nº do pedido"
            className="h-11 w-full rounded-xl border border-ink-600 bg-ink-900 pr-3 pl-10 text-sm outline-none placeholder:text-steel-400 focus:border-accent"
          />
        </label>
        <select
          aria-label="Filtrar por status"
          value={status}
          onChange={(e) => update({ status: e.target.value })}
          className="h-11 rounded-xl border border-ink-600 bg-ink-900 px-3 text-sm outline-none focus:border-accent"
        >
          <option value="">Todos os status</option>
          {STATUS_ORDER.map((s) => (
            <option key={s} value={s}>
              {STATUS_META[s].label}
            </option>
          ))}
        </select>
        <div className="grid grid-cols-2 gap-3 lg:contents">
          <label className="flex h-11 items-center gap-2 rounded-xl border border-ink-600 bg-ink-900 px-3 text-xs text-steel-400 focus-within:border-accent">
            De
            <input type="date" value={from} max={to || undefined} onChange={(e) => update({ de: e.target.value })} className="min-w-0 flex-1 bg-transparent text-sm text-snow outline-none" aria-label="Recebido a partir de" />
          </label>
          <label className="flex h-11 items-center gap-2 rounded-xl border border-ink-600 bg-ink-900 px-3 text-xs text-steel-400 focus-within:border-accent">
            Até
            <input type="date" value={to} min={from || undefined} onChange={(e) => update({ ate: e.target.value })} className="min-w-0 flex-1 bg-transparent text-sm text-snow outline-none" aria-label="Recebido até" />
          </label>
        </div>
        <select
          aria-label="Ordenar"
          value={sort}
          onChange={(e) => update({ ordem: e.target.value })}
          className="h-11 rounded-xl border border-ink-600 bg-ink-900 px-3 text-sm outline-none focus:border-accent"
        >
          <option value="created_desc">Mais recentes</option>
          <option value="created_asc">Mais antigos</option>
          <option value="name_asc">Nome (A–Z)</option>
        </select>
      </div>

      {hasFilters && (
        <button
          type="button"
          onClick={() => {
            setSearch('')
            setParams(new URLSearchParams(), { replace: true })
          }}
          className="mb-4 inline-flex items-center gap-1.5 text-xs font-medium text-steel-300 hover:text-snow"
        >
          <X className="size-3.5" /> Limpar filtros
        </button>
      )}

      {error && <ErrorState message={error} onRetry={load} />}

      <div className="overflow-hidden rounded-2xl border border-ink-700 bg-ink-900">
        {loading && rows.length === 0 ? (
          <PageLoader />
        ) : rows.length === 0 ? (
          <div className="p-5">
            <EmptyState
              icon={<FileText className="size-5" />}
              title={hasFilters ? 'Nenhum resultado' : 'Nenhuma solicitação recebida'}
              text={hasFilters ? 'Ajuste os filtros ou a pesquisa.' : 'As solicitações enviadas pelo formulário do site aparecerão aqui.'}
            />
          </div>
        ) : (
          <>
            {/* Tabela (telas médias e grandes) */}
            <div className={`hidden overflow-x-auto md:block ${loading ? 'opacity-60' : ''}`}>
              <table className="w-full text-left text-sm">
                <thead className="border-b border-ink-700 text-[0.7rem] tracking-[0.14em] text-steel-400 uppercase">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Pedido</th>
                    <th className="px-4 py-3 font-semibold">Cliente</th>
                    <th className="px-4 py-3 font-semibold">Veículo</th>
                    <th className="px-4 py-3 font-semibold">Serviço</th>
                    <th className="px-4 py-3 font-semibold">Recebido</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-4 py-3"><span className="sr-only">Ações</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-700">
                  {rows.map((q) => (
                    <tr key={q.id} className="cursor-pointer transition-colors hover:bg-white/[0.02]" onClick={() => update({ id: q.id, pagina: String(page) })}>
                      <td className="font-wide px-4 py-3.5 text-xs font-semibold text-steel-300">{quoteCode(q.number)}</td>
                      <td className="px-4 py-3.5">
                        <p className="font-medium">{q.customer_name}</p>
                        <p className="text-xs text-steel-400">{formatPhone(q.phone_normalized)}</p>
                      </td>
                      <td className="px-4 py-3.5 text-steel-200">
                        {q.vehicle_brand} {q.vehicle_model}
                        {q.vehicle_year ? <span className="text-steel-400"> · {q.vehicle_year}</span> : null}
                      </td>
                      <td className="max-w-48 truncate px-4 py-3.5 text-steel-200">{q.service_name}</td>
                      <td className="px-4 py-3.5 whitespace-nowrap text-steel-300" title={formatDateTime(q.created_at)}>
                        {relativeTime(q.created_at)}
                      </td>
                      <td className="px-4 py-3.5">
                        <StatusBadge status={q.status} />
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        <button
                          type="button"
                          className="inline-flex h-8 items-center gap-1 rounded-full border border-ink-600 px-3 text-xs font-medium hover:border-steel-400"
                          onClick={(e) => {
                            e.stopPropagation()
                            update({ id: q.id, pagina: String(page) })
                          }}
                        >
                          Abrir <ChevronRight className="size-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Cartões (celular) */}
            <ul className={`divide-y divide-ink-700 md:hidden ${loading ? 'opacity-60' : ''}`}>
              {rows.map((q) => (
                <li key={q.id}>
                  <button type="button" className="flex w-full flex-col gap-2 px-4 py-4 text-left" onClick={() => update({ id: q.id, pagina: String(page) })}>
                    <span className="flex w-full items-center justify-between gap-3">
                      <span className="font-wide text-xs font-semibold text-steel-400">{quoteCode(q.number)}</span>
                      <StatusBadge status={q.status} />
                    </span>
                    <span className="font-medium">{q.customer_name}</span>
                    <span className="text-sm text-steel-300">
                      {q.vehicle_brand} {q.vehicle_model} · {q.service_name}
                    </span>
                    <span className="text-xs text-steel-400">{relativeTime(q.created_at)}</span>
                  </button>
                </li>
              ))}
            </ul>
            <Pagination page={page} pageSize={PAGE_SIZE} count={count} onPage={(p) => update({ pagina: String(p) })} />
          </>
        )}
      </div>

      {selectedId && <QuoteDetail id={selectedId} onClose={() => update({ id: null, pagina: String(page) })} onChanged={onChanged} />}
    </>
  )
}
