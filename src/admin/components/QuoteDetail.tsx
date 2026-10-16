import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Calendar, Car, Clock, Gauge, Lock, MessageCircle, Phone, Trash2, Wrench } from 'lucide-react'
import { Modal } from '../../components/ui/Modal'
import { Button, LinkButton } from '../../components/ui/Button'
import { useFeedback } from '../../components/ui/Feedback'
import { ErrorState } from '../../components/ui/Misc'
import { PageLoader, Spinner } from '../../components/ui/Spinner'
import { useAuth } from '../../context/AuthContext'
import { useSiteData } from '../../context/SiteDataContext'
import {
  addQuoteNote,
  deleteQuote,
  deleteQuoteNote,
  getQuote,
  listQuoteHistory,
  listQuoteNotes,
  signedPhotoUrls,
  updateQuoteStatus,
} from '../../data/admin'
import type { QuoteNote, QuoteRequest, QuoteStatus, QuoteStatusHistory } from '../../lib/types'
import { STATUS_META, STATUS_TRANSITIONS } from '../../lib/status'
import { formatDate, formatDateTime, formatMileage, quoteCode } from '../../lib/format'
import { formatPhone } from '../../lib/phone'
import { buildFollowUpMessage, PERIOD_LABEL, whatsappLink } from '../../lib/whatsapp'
import { friendlyError } from '../../lib/errors'
import { StatusBadge } from './PageHeader'

interface Props {
  id: string
  onClose: () => void
  onChanged: (q: QuoteRequest | null, removedId?: string) => void
}

export function QuoteDetail({ id, onClose, onChanged }: Props) {
  const { user, profile } = useAuth()
  const { data } = useSiteData()
  const { toast, confirm } = useFeedback()
  const [quote, setQuote] = useState<QuoteRequest | null>(null)
  const [history, setHistory] = useState<QuoteStatusHistory[]>([])
  const [notes, setNotes] = useState<QuoteNote[]>([])
  const [photos, setPhotos] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [changing, setChanging] = useState<QuoteStatus | null>(null)
  const [note, setNote] = useState('')
  const [savingNote, setSavingNote] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const q = await getQuote(id)
      if (!q) {
        setError('Solicitação não encontrada. Ela pode ter sido excluída.')
        return
      }
      setQuote(q)
      const [h, n] = await Promise.all([listQuoteHistory(id), listQuoteNotes(id)])
      setHistory(h)
      setNotes(n)
      if (q.photo_paths.length) setPhotos(await signedPhotoUrls(q.photo_paths).catch(() => []))
    } catch (err) {
      setError(friendlyError(err, 'Não foi possível carregar a solicitação.'))
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    void load()
  }, [load])

  const changeStatus = async (to: QuoteStatus) => {
    if (!quote) return
    if (to === 'cancelado' && !(await confirm({ title: 'Cancelar solicitação', message: 'O pedido será marcado como cancelado. É possível reabri-lo depois.', confirmLabel: 'Cancelar pedido', tone: 'danger' }))) return
    setChanging(to)
    try {
      const updated = await updateQuoteStatus(quote.id, to)
      setQuote(updated)
      onChanged(updated)
      setHistory(await listQuoteHistory(quote.id))
      toast(`Status alterado para “${STATUS_META[to].label}”.`)
    } catch (err) {
      toast(friendlyError(err, 'Não foi possível alterar o status.'), 'error')
    } finally {
      setChanging(null)
    }
  }

  const submitNote = async (e: FormEvent) => {
    e.preventDefault()
    if (!quote || !user || !note.trim()) return
    setSavingNote(true)
    try {
      const created = await addQuoteNote(quote.id, note, user.id, profile?.full_name || user.email || null)
      setNotes((n) => [...n, created])
      setNote('')
      toast('Observação registrada.')
    } catch (err) {
      toast(friendlyError(err, 'Não foi possível salvar a observação.'), 'error')
    } finally {
      setSavingNote(false)
    }
  }

  const removeNote = async (n: QuoteNote) => {
    if (!(await confirm({ title: 'Excluir observação', message: 'Esta observação interna será removida permanentemente.', confirmLabel: 'Excluir', tone: 'danger' }))) return
    try {
      await deleteQuoteNote(n.id)
      setNotes((list) => list.filter((x) => x.id !== n.id))
      toast('Observação excluída.')
    } catch (err) {
      toast(friendlyError(err), 'error')
    }
  }

  const removeQuote = async () => {
    if (!quote) return
    const ok = await confirm({
      title: 'Excluir solicitação',
      message: (
        <>
          A solicitação <strong>{quoteCode(quote.number)}</strong>, com histórico e observações, será excluída permanentemente. O cadastro do cliente é mantido.
        </>
      ),
      confirmLabel: 'Excluir definitivamente',
      tone: 'danger',
    })
    if (!ok) return
    try {
      await deleteQuote(quote.id)
      toast('Solicitação excluída.')
      onChanged(null, quote.id)
    } catch (err) {
      toast(friendlyError(err), 'error')
    }
  }

  const wa = quote ? whatsappLink(quote.phone_normalized, buildFollowUpMessage(data.settings.business.name, quote.customer_name, quote.number)) : '#'

  return (
    <Modal
      open
      variant="sheet"
      onClose={onClose}
      title={quote ? `Pedido ${quoteCode(quote.number)}` : 'Solicitação'}
      description={quote ? `Recebido em ${formatDateTime(quote.created_at)}` : undefined}
    >
      {loading && !quote ? (
        <PageLoader />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : (
        quote && (
          <div className="grid gap-7">
            <section className="flex flex-wrap items-center gap-3">
              <StatusBadge status={quote.status} />
              <span className="text-xs text-steel-400">{STATUS_META[quote.status].description}</span>
            </section>

            <section>
              <h3 className="text-[0.7rem] font-semibold tracking-[0.2em] text-steel-400 uppercase">Cliente</h3>
              <p className="mt-2 text-lg font-semibold">{quote.customer_name}</p>
              <p className="text-sm text-steel-300">
                {formatPhone(quote.phone_normalized)} · prefere {quote.contact_preference === 'whatsapp' ? 'WhatsApp' : 'ligação'}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <LinkButton variant="whatsapp" size="sm" href={wa} target="_blank" rel="noopener noreferrer" icon={<MessageCircle className="size-4" />}>
                  Abrir WhatsApp
                </LinkButton>
                <LinkButton variant="outline" size="sm" href={`tel:+${quote.phone_normalized}`} icon={<Phone className="size-4" />}>
                  Ligar
                </LinkButton>
              </div>
            </section>

            <section className="grid gap-px overflow-hidden rounded-2xl border border-ink-700 bg-ink-700 sm:grid-cols-2">
              <Info icon={<Car className="size-4" />} label="Veículo" value={`${quote.vehicle_brand} ${quote.vehicle_model}${quote.vehicle_year ? ` · ${quote.vehicle_year}` : ''}`} />
              <Info icon={<Gauge className="size-4" />} label="Quilometragem" value={quote.vehicle_mileage != null ? formatMileage(quote.vehicle_mileage) : 'Não informada'} />
              <Info icon={<Wrench className="size-4" />} label="Serviço" value={quote.service_name} wide />
              <Info
                icon={<Calendar className="size-4" />}
                label="Preferência do cliente"
                wide
                value={
                  quote.preferred_date || quote.preferred_period
                    ? `${[quote.preferred_date && formatDate(quote.preferred_date), quote.preferred_period && PERIOD_LABEL[quote.preferred_period]].filter(Boolean).join(' · ')} — confirmar disponibilidade`
                    : 'Sem preferência de data'
                }
              />
            </section>

            <section>
              <h3 className="text-[0.7rem] font-semibold tracking-[0.2em] text-steel-400 uppercase">Descrição do cliente</h3>
              <p className="mt-2 rounded-2xl border border-ink-700 bg-ink-850 p-4 text-sm leading-relaxed whitespace-pre-line text-steel-200">{quote.description}</p>
            </section>

            {quote.photo_paths.length > 0 && (
              <section>
                <h3 className="text-[0.7rem] font-semibold tracking-[0.2em] text-steel-400 uppercase">Fotos enviadas</h3>
                {photos.length ? (
                  <ul className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-5">
                    {photos.map((u, i) => (
                      <li key={u}>
                        <a href={u} target="_blank" rel="noopener noreferrer" className="block aspect-square overflow-hidden rounded-xl border border-ink-700">
                          <img src={u} alt={`Foto ${i + 1} enviada pelo cliente`} className="size-full object-cover" />
                        </a>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-sm text-steel-400">Não foi possível carregar as fotos.</p>
                )}
                <p className="mt-2 text-xs text-steel-400">Links temporários (10 minutos). Arquivos privados.</p>
              </section>
            )}

            <section>
              <h3 className="text-[0.7rem] font-semibold tracking-[0.2em] text-steel-400 uppercase">Atualizar status</h3>
              <div className="mt-3 flex flex-wrap gap-2">
                {STATUS_TRANSITIONS[quote.status].map((s) => (
                  <button
                    key={s}
                    type="button"
                    disabled={Boolean(changing)}
                    onClick={() => void changeStatus(s)}
                    className="inline-flex h-9 items-center gap-2 rounded-full border border-ink-600 px-3.5 text-xs font-semibold transition-colors hover:border-steel-400 disabled:opacity-50"
                  >
                    {changing === s ? <Spinner className="size-3.5" /> : <span className={`size-2 rounded-full ${STATUS_META[s].dot}`} />}
                    {STATUS_META[s].label}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-xs text-steel-400">Somente as próximas etapas válidas são exibidas. “Aprovado” indica orçamento aceito — o serviço só é concluído depois de “Em execução”.</p>
            </section>

            <section>
              <h3 className="flex items-center gap-2 text-[0.7rem] font-semibold tracking-[0.2em] text-steel-400 uppercase">
                <Lock className="size-3.5" /> Observações internas
              </h3>
              <p className="mt-1 text-xs text-steel-400">Visíveis apenas para a equipe. Nunca são enviadas ao cliente nem exibidas no site.</p>
              {notes.length > 0 && (
                <ul className="mt-3 grid gap-2">
                  {notes.map((n) => (
                    <li key={n.id} className="group rounded-xl border border-ink-700 bg-ink-850 p-3.5">
                      <div className="flex items-center justify-between gap-2 text-xs text-steel-400">
                        <span>
                          {n.author_name ?? 'Equipe'} · {formatDateTime(n.created_at)}
                        </span>
                        <button type="button" onClick={() => void removeNote(n)} className="rounded-full p-1 hover:bg-danger/10 hover:text-danger" aria-label="Excluir observação">
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                      <p className="mt-1.5 text-sm whitespace-pre-line text-steel-200">{n.body}</p>
                    </li>
                  ))}
                </ul>
              )}
              <form onSubmit={submitNote} className="mt-3 grid gap-2">
                <label className="sr-only" htmlFor="note">
                  Nova observação
                </label>
                <textarea
                  id="note"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  maxLength={2000}
                  placeholder="Ex.: cliente pediu retorno após as 14h; orçamento enviado com duas opções de peça…"
                  className="min-h-20 w-full rounded-xl border border-ink-600 bg-ink-850 p-3 text-sm outline-none placeholder:text-steel-400/70 focus:border-accent"
                />
                <Button type="submit" size="sm" variant="outline" loading={savingNote} disabled={!note.trim()} className="justify-self-end">
                  Adicionar observação
                </Button>
              </form>
            </section>

            <section>
              <h3 className="flex items-center gap-2 text-[0.7rem] font-semibold tracking-[0.2em] text-steel-400 uppercase">
                <Clock className="size-3.5" /> Histórico
              </h3>
              <ol className="mt-3 border-l border-ink-600 pl-5">
                {history.map((h) => (
                  <li key={h.id} className="relative pb-4 last:pb-0">
                    <span className={`absolute top-1.5 -left-[1.53rem] size-2.5 rounded-full ring-4 ring-ink-900 ${STATUS_META[h.to_status].dot}`} />
                    <p className="text-sm">
                      {h.from_status ? (
                        <>
                          {STATUS_META[h.from_status].label} → <strong>{STATUS_META[h.to_status].label}</strong>
                        </>
                      ) : (
                        <>Solicitação recebida pelo site</>
                      )}
                    </p>
                    <p className="text-xs text-steel-400">{formatDateTime(h.created_at)}</p>
                  </li>
                ))}
              </ol>
            </section>

            <section className="border-t border-ink-700 pt-5">
              <Button variant="danger" size="sm" icon={<Trash2 className="size-4" />} onClick={() => void removeQuote()}>
                Excluir solicitação
              </Button>
            </section>
          </div>
        )
      )}
    </Modal>
  )
}

function Info({ icon, label, value, wide }: { icon: React.ReactNode; label: string; value: string; wide?: boolean }) {
  return (
    <div className={`bg-ink-850 p-4 ${wide ? 'sm:col-span-2' : ''}`}>
      <p className="flex items-center gap-2 text-[0.7rem] font-semibold tracking-[0.16em] text-steel-400 uppercase">
        {icon} {label}
      </p>
      <p className="mt-1.5 text-sm text-snow">{value}</p>
    </div>
  )
}
