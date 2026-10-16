import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Car, ChevronDown, MessageCircle, Search, Users } from 'lucide-react'
import { listCustomers, type CustomerWithStats } from '../../data/admin'
import { formatDate, quoteCode, relativeTime } from '../../lib/format'
import { formatPhone } from '../../lib/phone'
import { buildFollowUpMessage, whatsappLink } from '../../lib/whatsapp'
import { friendlyError } from '../../lib/errors'
import { useSiteData } from '../../context/SiteDataContext'
import { PageLoader } from '../../components/ui/Spinner'
import { EmptyState, ErrorState } from '../../components/ui/Misc'
import { PageHeader, Pagination, StatusBadge } from '../components/PageHeader'

const PAGE_SIZE = 20

export default function CustomersPage() {
  const { data } = useSiteData()
  const [search, setSearch] = useState('')
  const [term, setTerm] = useState('')
  const [page, setPage] = useState(0)
  const [rows, setRows] = useState<CustomerWithStats[]>([])
  const [count, setCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [open, setOpen] = useState<string | null>(null)

  useEffect(() => {
    const t = window.setTimeout(() => {
      setTerm(search)
      setPage(0)
    }, 350)
    return () => window.clearTimeout(t)
  }, [search])

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await listCustomers(term, page, PAGE_SIZE)
      setRows(res.rows)
      setCount(res.count)
    } catch (err) {
      setError(friendlyError(err, 'Não foi possível carregar os clientes.'))
    } finally {
      setLoading(false)
    }
  }, [term, page])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <>
      <PageHeader
        title="Clientes"
        description="Clientes com solicitações registradas. Pedidos com o mesmo telefone ficam reunidos no mesmo cadastro."
      />
      <label className="relative mb-4 block max-w-md">
        <span className="sr-only">Pesquisar clientes</span>
        <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-steel-400" />
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Pesquisar por nome ou telefone"
          className="h-11 w-full rounded-xl border border-ink-600 bg-ink-900 pr-3 pl-10 text-sm outline-none placeholder:text-steel-400 focus:border-accent"
        />
      </label>

      {error && <ErrorState message={error} onRetry={load} />}

      <div className="overflow-hidden rounded-2xl border border-ink-700 bg-ink-900">
        {loading && rows.length === 0 ? (
          <PageLoader />
        ) : rows.length === 0 ? (
          <div className="p-5">
            <EmptyState icon={<Users className="size-5" />} title={term ? 'Nenhum cliente encontrado' : 'Nenhum cliente ainda'} text={term ? 'Tente outro nome ou telefone.' : 'Os clientes são criados automaticamente quando enviam uma solicitação pelo site.'} />
          </div>
        ) : (
          <ul className={`divide-y divide-ink-700 ${loading ? 'opacity-60' : ''}`}>
            {rows.map((c) => {
              const isOpen = open === c.id
              const vehicles = Array.from(
                new Set(c.requests.map((r) => `${r.vehicle_brand} ${r.vehicle_model}${r.vehicle_year ? ` ${r.vehicle_year}` : ''}`)),
              )
              const requests = [...c.requests].sort((a, b) => b.created_at.localeCompare(a.created_at))
              return (
                <li key={c.id}>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-4 sm:px-5">
                    <span className="font-wide flex size-10 shrink-0 items-center justify-center rounded-full bg-ink-700 text-sm font-semibold">
                      {c.name.charAt(0).toUpperCase()}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{c.name}</p>
                      <p className="text-sm text-steel-400">{formatPhone(c.phone_normalized)}</p>
                    </div>
                    <div className="hidden text-right text-xs text-steel-400 sm:block">
                      <p>
                        {c.requests.length} solicitaç{c.requests.length === 1 ? 'ão' : 'ões'}
                      </p>
                      {c.last_request_at && <p>Última {relativeTime(c.last_request_at)}</p>}
                    </div>
                    <a
                      href={whatsappLink(c.phone_normalized, buildFollowUpMessage(data.settings.business.name, c.name))}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex size-9 items-center justify-center rounded-full bg-[#1fa855]/15 text-[#3ddc84] hover:bg-[#1fa855]/25"
                      aria-label={`Conversar com ${c.name} pelo WhatsApp`}
                    >
                      <MessageCircle className="size-4" />
                    </a>
                    <button
                      type="button"
                      onClick={() => setOpen(isOpen ? null : c.id)}
                      aria-expanded={isOpen}
                      className="flex size-9 items-center justify-center rounded-full border border-ink-600 hover:border-steel-400"
                      aria-label={isOpen ? 'Recolher histórico' : 'Ver histórico'}
                    >
                      <ChevronDown className={`size-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                    </button>
                  </div>
                  {isOpen && (
                    <div className="grid animate-fade-in gap-5 border-t border-ink-700 bg-ink-850 px-4 py-5 sm:px-5 md:grid-cols-[1fr_2fr]">
                      <div>
                        <h3 className="text-[0.7rem] font-semibold tracking-[0.2em] text-steel-400 uppercase">Veículos informados</h3>
                        <ul className="mt-3 grid gap-2">
                          {vehicles.map((v) => (
                            <li key={v} className="flex items-center gap-2 text-sm">
                              <Car className="size-4 text-steel-400" /> {v}
                            </li>
                          ))}
                        </ul>
                        <p className="mt-4 text-xs text-steel-400">Cliente desde {formatDate(c.created_at)}</p>
                      </div>
                      <div>
                        <h3 className="text-[0.7rem] font-semibold tracking-[0.2em] text-steel-400 uppercase">Histórico de solicitações</h3>
                        <ul className="mt-3 divide-y divide-ink-700 rounded-xl border border-ink-700">
                          {requests.map((r) => (
                            <li key={r.id}>
                              <Link to={`/admin/orcamentos?id=${r.id}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5 text-sm hover:bg-white/[0.03]">
                                <span className="font-wide w-20 text-xs font-semibold text-steel-400">{quoteCode(r.number)}</span>
                                <span className="min-w-0 flex-1 truncate">{r.service_name}</span>
                                <StatusBadge status={r.status} />
                                <span className="text-xs text-steel-400">{formatDate(r.created_at)}</span>
                              </Link>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
        <Pagination page={page} pageSize={PAGE_SIZE} count={count} onPage={setPage} />
      </div>
    </>
  )
}
