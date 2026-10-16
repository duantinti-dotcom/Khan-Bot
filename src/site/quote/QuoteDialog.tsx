import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, ArrowRight, Camera, CheckCircle2, ImagePlus, MessageCircle, Phone, ShieldCheck, Trash2 } from 'lucide-react'
import { Modal } from '../../components/ui/Modal'
import { Button, LinkButton } from '../../components/ui/Button'
import { Input, Segmented, Select, Textarea } from '../../components/ui/Field'
import { Notice } from '../../components/ui/Misc'
import { useSiteData } from '../../context/SiteDataContext'
import { submitQuoteRequest, uploadQuotePhotos } from '../../data/public'
import { emptyQuoteForm, NO_SERVICE, NO_SERVICE_LABEL, validateQuote, type FieldErrors, type QuoteFormValues } from '../../lib/quoteSchema'
import { maskBrPhone } from '../../lib/phone'
import { formatDate, formatMileage, quoteCode, todayISO } from '../../lib/format'
import { buildQuoteMessage, PERIOD_LABEL, whatsappLink } from '../../lib/whatsapp'
import { friendlyError } from '../../lib/errors'
import { validateImageFile } from '../../lib/images'
import { env } from '../../lib/env'

type Step = 'form' | 'review' | 'done'

interface Props {
  open: boolean
  initialServiceId: string
  onClose: () => void
}

const MAX_PHOTOS = 5

export default function QuoteDialog({ open, initialServiceId, onClose }: Props) {
  const { data } = useSiteData()
  const { settings, services } = data
  const persisted = env.hasBackend && data.source === 'database'
  const photosEnabled = persisted && settings.display.allowPhotos

  const validInitial = services.some((s) => s.id === initialServiceId) ? initialServiceId : ''
  const [values, setValues] = useState<QuoteFormValues>(() => emptyQuoteForm(validInitial))
  const [errors, setErrors] = useState<FieldErrors>({})
  const [step, setStep] = useState<Step>('form')
  const [photos, setPhotos] = useState<File[]>([])
  const [photoError, setPhotoError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [result, setResult] = useState<{ number: number } | null>(null)
  const [honeypot, setHoneypot] = useState('')
  const formRef = useRef<HTMLFormElement>(null)

  const serviceName = useMemo(() => {
    if (values.service_id === NO_SERVICE) return NO_SERVICE_LABEL
    return services.find((s) => s.id === values.service_id)?.name ?? ''
  }, [values.service_id, services])

  const message = useMemo(
    () =>
      buildQuoteMessage({
        businessName: settings.business.name,
        number: result?.number,
        ...values,
        service_name: serviceName,
      }),
    [settings.business.name, result, values, serviceName],
  )
  const waHref = whatsappLink(settings.contact.whatsapp, message)
  const hasWhatsNumber = Boolean(settings.contact.whatsapp)

  const set = <K extends keyof QuoteFormValues>(key: K, value: QuoteFormValues[K]) => {
    setValues((v) => ({ ...v, [key]: value }))
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }))
  }

  const onText = (key: keyof QuoteFormValues) => (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    set(key, e.target.value as never)

  const goReview = (e: FormEvent) => {
    e.preventDefault()
    const errs = validateQuote(values)
    setErrors(errs)
    if (Object.keys(errs).length) {
      const first = Object.keys(errs)[0]
      requestAnimationFrame(() => {
        const el = formRef.current?.querySelector<HTMLElement>(`[name="${first}"]`)
        el?.focus()
      })
      return
    }
    setSubmitError('')
    setStep('review')
  }

  const onPickPhotos = (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    e.target.value = ''
    setPhotoError('')
    const next = [...photos]
    for (const f of files) {
      const err = validateImageFile(f)
      if (err) {
        setPhotoError(`${f.name}: ${err}`)
        continue
      }
      if (next.length >= MAX_PHOTOS) {
        setPhotoError(`Envie no máximo ${MAX_PHOTOS} fotos.`)
        break
      }
      next.push(f)
    }
    setPhotos(next)
  }

  const submit = async () => {
    setSubmitting(true)
    setSubmitError('')
    try {
      const paths = photosEnabled ? await uploadQuotePhotos(photos) : []
      const res = await submitQuoteRequest(values, paths, honeypot)
      setResult({ number: res.number })
      setStep('done')
    } catch (err) {
      console.error('[orcamento]', err)
      setSubmitError(friendlyError(err, 'Não foi possível registrar sua solicitação agora.'))
    } finally {
      setSubmitting(false)
    }
  }

  const titles: Record<Step, string> = {
    form: 'Solicitar orçamento',
    review: 'Confira sua solicitação',
    done: persisted ? 'Solicitação registrada' : 'Continue pelo WhatsApp',
  }

  const steps = ['Dados', 'Resumo', 'Envio']
  const stepIndex = step === 'form' ? 0 : step === 'review' ? 1 : 2

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      closeOnBackdrop={step !== 'form'}
      title={titles[step]}
      description={
        <span className="flex items-center gap-2" aria-label={`Etapa ${stepIndex + 1} de 3`}>
          {steps.map((s, i) => (
            <span key={s} className="flex items-center gap-2">
              <span className={`text-xs font-semibold ${i <= stepIndex ? 'text-snow' : 'text-steel-400'}`}>
                <span className={i <= stepIndex ? 'text-accent' : ''}>0{i + 1}</span> {s}
              </span>
              {i < steps.length - 1 && <span className="h-px w-5 bg-ink-600" />}
            </span>
          ))}
        </span>
      }
      footer={
        step === 'form' ? (
          <>
            <Button variant="ghost" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" form="quote-form" iconRight={<ArrowRight className="size-4" />}>
              Revisar solicitação
            </Button>
          </>
        ) : step === 'review' ? (
          <>
            <Button variant="ghost" onClick={() => setStep('form')} icon={<ArrowLeft className="size-4" />} disabled={submitting}>
              Editar dados
            </Button>
            {persisted ? (
              <Button onClick={submit} loading={submitting} icon={<CheckCircle2 className="size-4" />}>
                {submitting ? 'Enviando…' : 'Enviar solicitação'}
              </Button>
            ) : (
              <LinkButton variant="whatsapp" href={waHref} target="_blank" rel="noopener noreferrer" icon={<MessageCircle className="size-4" />} onClick={() => setStep('done')}>
                Continuar pelo WhatsApp
              </LinkButton>
            )}
          </>
        ) : (
          <Button variant="outline" onClick={onClose}>
            Fechar
          </Button>
        )
      }
    >
      {step === 'form' && (
        <form id="quote-form" ref={formRef} onSubmit={goReview} noValidate className="grid gap-5">
          {/* Campo armadilha para robôs — invisível para pessoas */}
          <div className="absolute -left-[9999px]" aria-hidden="true">
            <label>
              Site
              <input tabIndex={-1} autoComplete="off" name="website" value={honeypot} onChange={(e) => setHoneypot(e.target.value)} />
            </label>
          </div>

          <fieldset className="grid gap-4">
            <legend className="mb-3 text-[0.7rem] font-semibold tracking-[0.24em] text-steel-400 uppercase">Seus dados</legend>
            <Input label="Nome completo" name="customer_name" autoComplete="name" value={values.customer_name} onChange={onText('customer_name')} error={errors.customer_name} maxLength={120} data-autofocus />
            <Input
              label="Telefone ou WhatsApp"
              name="phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel-national"
              placeholder="(11) 91234-5678"
              value={values.phone}
              onChange={(e) => set('phone', maskBrPhone(e.target.value))}
              error={errors.phone}
            />
            <Segmented
              label="Prefiro ser contatado por"
              name="contact_preference"
              value={values.contact_preference}
              onChange={(v) => set('contact_preference', v)}
              options={[
                { value: 'whatsapp', label: 'WhatsApp', icon: <MessageCircle className="size-4" /> },
                { value: 'ligacao', label: 'Ligação', icon: <Phone className="size-4" /> },
              ]}
            />
          </fieldset>

          <fieldset className="grid gap-4">
            <legend className="mb-3 text-[0.7rem] font-semibold tracking-[0.24em] text-steel-400 uppercase">Veículo</legend>
            <div className="grid gap-4 sm:grid-cols-2">
              <Input label="Marca" name="vehicle_brand" placeholder="Ex.: Volkswagen" value={values.vehicle_brand} onChange={onText('vehicle_brand')} error={errors.vehicle_brand} maxLength={60} />
              <Input label="Modelo" name="vehicle_model" placeholder="Ex.: Golf 1.4 TSI" value={values.vehicle_model} onChange={onText('vehicle_model')} error={errors.vehicle_model} maxLength={80} />
              <Input label="Ano" name="vehicle_year" optional inputMode="numeric" placeholder="Ex.: 2019" maxLength={4} value={values.vehicle_year} onChange={(e) => set('vehicle_year', e.target.value.replace(/\D/g, ''))} error={errors.vehicle_year} />
              <Input
                label="Quilometragem"
                name="vehicle_mileage"
                optional
                inputMode="numeric"
                placeholder="Ex.: 45.000"
                value={values.vehicle_mileage}
                onChange={(e) => {
                  const d = e.target.value.replace(/\D/g, '').slice(0, 7)
                  set('vehicle_mileage', d ? new Intl.NumberFormat('pt-BR').format(Number(d)) : '')
                }}
                error={errors.vehicle_mileage}
              />
            </div>
          </fieldset>

          <fieldset className="grid gap-4">
            <legend className="mb-3 text-[0.7rem] font-semibold tracking-[0.24em] text-steel-400 uppercase">Necessidade</legend>
            <Select label="Serviço desejado" name="service_id" value={values.service_id} onChange={onText('service_id')} error={errors.service_id}>
              <option value="">Selecione um serviço</option>
              {services.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
              <option value={NO_SERVICE}>{NO_SERVICE_LABEL}</option>
            </Select>
            <Textarea
              label="Descreva o problema ou a necessidade"
              name="description"
              placeholder="Ex.: barulho ao frear, luz da injeção acesa, revisão dos 40 mil km…"
              value={values.description}
              onChange={onText('description')}
              error={errors.description}
              maxLength={2000}
              hint={`${values.description.trim().length}/2000 caracteres`}
            />
          </fieldset>

          <fieldset className="grid gap-4">
            <legend className="mb-3 text-[0.7rem] font-semibold tracking-[0.24em] text-steel-400 uppercase">Preferência de atendimento</legend>
            <div className="grid gap-4 sm:grid-cols-2">
              <Input label="Data desejada" name="preferred_date" type="date" optional min={todayISO(0)} max={todayISO(180)} value={values.preferred_date} onChange={onText('preferred_date')} error={errors.preferred_date} />
              <Select label="Período preferido" name="preferred_period" optional value={values.preferred_period} onChange={onText('preferred_period')}>
                <option value="">Sem preferência</option>
                <option value="manha">Manhã</option>
                <option value="tarde">Tarde</option>
              </Select>
            </div>
            <p className="-mt-1 text-xs leading-relaxed text-steel-400">
              A data e o período são apenas uma preferência — não é um agendamento. A oficina confirma a disponibilidade com você.
            </p>
          </fieldset>

          {photosEnabled && (
            <fieldset className="grid gap-3">
              <legend className="mb-3 flex w-full items-baseline justify-between text-[0.7rem] font-semibold tracking-[0.24em] text-steel-400 uppercase">
                <span>Fotos</span>
                <span className="text-[0.72rem] font-normal tracking-normal normal-case">Opcional · até 5 imagens de 5 MB</span>
              </legend>
              <div className="flex flex-wrap gap-2.5">
                {photos.map((f, i) => (
                  <div key={`${f.name}-${i}`} className="group relative size-20 overflow-hidden rounded-xl border border-ink-600">
                    <PhotoThumb file={f} alt={`Foto ${i + 1}`} />
                    <button
                      type="button"
                      onClick={() => setPhotos((p) => p.filter((_, j) => j !== i))}
                      className="absolute inset-0 flex items-center justify-center bg-black/60 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                      aria-label={`Remover foto ${i + 1}`}
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                ))}
                {photos.length < MAX_PHOTOS && (
                  <label className="flex size-20 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-ink-500 text-steel-400 transition-colors hover:border-steel-300 hover:text-snow has-focus-visible:ring-3 has-focus-visible:ring-accent/30">
                    <ImagePlus className="size-5" />
                    <span className="text-[0.68rem]">Adicionar</span>
                    <input type="file" accept="image/jpeg,image/png,image/webp" multiple className="sr-only" onChange={onPickPhotos} />
                  </label>
                )}
              </div>
              {photoError && <p className="text-xs font-medium text-danger" role="alert">{photoError}</p>}
            </fieldset>
          )}

          <label className="flex items-start gap-3 text-sm text-steel-300">
            <input
              type="checkbox"
              name="consent"
              checked={Boolean(values.consent)}
              onChange={(e) => set('consent', e.target.checked as true)}
              className="mt-0.5 size-4.5 shrink-0 accent-[var(--color-accent)]"
              aria-invalid={errors.consent ? true : undefined}
            />
            <span>
              Concordo com o uso dos meus dados para retorno sobre este atendimento, conforme a{' '}
              <Link to="/privacidade" target="_blank" className="text-snow underline decoration-ink-500 underline-offset-2 hover:decoration-accent">
                Política de Privacidade
              </Link>
              .
            </span>
          </label>
          {errors.consent && <p className="-mt-3 text-xs font-medium text-danger" role="alert">{errors.consent}</p>}
        </form>
      )}

      {step === 'review' && (
        <div className="grid gap-5">
          <dl className="grid gap-px overflow-hidden rounded-2xl border border-ink-700 bg-ink-700 sm:grid-cols-2">
            <Summary label="Nome" value={values.customer_name} />
            <Summary label="Telefone" value={`${values.phone} · ${values.contact_preference === 'whatsapp' ? 'WhatsApp' : 'Ligação'}`} />
            <Summary label="Veículo" value={`${values.vehicle_brand} ${values.vehicle_model}${values.vehicle_year ? ` · ${values.vehicle_year}` : ''}`} />
            <Summary label="Quilometragem" value={values.vehicle_mileage ? formatMileage(Number(values.vehicle_mileage.replace(/\D/g, ''))) : 'Não informada'} />
            <Summary label="Serviço" value={serviceName} wide />
            <Summary label="Descrição" value={values.description} wide />
            <Summary
              label="Preferência"
              wide
              value={
                values.preferred_date || values.preferred_period
                  ? [values.preferred_date && formatDate(values.preferred_date), values.preferred_period && PERIOD_LABEL[values.preferred_period]].filter(Boolean).join(' · ') +
                    ' (sujeito à confirmação)'
                  : 'Sem preferência'
              }
            />
            {photosEnabled && <Summary label="Fotos" value={photos.length ? `${photos.length} anexada(s)` : 'Nenhuma'} wide />}
          </dl>

          {persisted ? (
            <Notice>
              <span className="flex gap-2.5">
                <ShieldCheck className="mt-0.5 size-4 shrink-0 text-info" />
                <span>
                  Ao enviar, sua solicitação fica registrada no sistema da oficina e nossa equipe entra em contato para conversar sobre o orçamento e combinar um eventual horário. Nenhum horário é confirmado automaticamente.
                </span>
              </span>
            </Notice>
          ) : (
            <Notice tone="warning">
              Este site ainda não está conectado ao sistema de pedidos, por isso a solicitação <strong>não fica registrada aqui</strong>. Continue pelo WhatsApp: a mensagem já vem preenchida e você confirma o envio no aplicativo.
            </Notice>
          )}

          {submitError && (
            <div role="alert" className="grid gap-3 rounded-xl border border-danger/30 bg-danger/[0.06] p-4 text-sm text-steel-200">
              <p>{submitError}</p>
              <p className="text-steel-400">Se preferir, envie os mesmos dados pelo WhatsApp:</p>
              <LinkButton variant="whatsapp" size="sm" href={waHref} target="_blank" rel="noopener noreferrer" icon={<MessageCircle className="size-4" />} className="justify-self-start">
                Enviar pelo WhatsApp
              </LinkButton>
            </div>
          )}
        </div>
      )}

      {step === 'done' && (
        <div className="grid gap-5 py-2 text-center">
          <div className="mx-auto flex size-16 items-center justify-center rounded-full border border-success/30 bg-success/10">
            {persisted ? <CheckCircle2 className="size-8 text-success" /> : <MessageCircle className="size-8 text-success" />}
          </div>
          {persisted && result ? (
            <>
              <div>
                <p className="text-sm text-steel-400">Número da solicitação</p>
                <p className="font-wide mt-1 text-3xl font-bold tracking-wide" data-testid="quote-code">
                  {quoteCode(result.number)}
                </p>
              </div>
              <p className="mx-auto max-w-md text-sm leading-relaxed text-steel-300">
                Recebemos sua solicitação. Nossa equipe vai entrar em contato pelo {values.contact_preference === 'whatsapp' ? 'WhatsApp' : 'telefone'} informado para entender os detalhes, apresentar o orçamento e combinar o atendimento.
              </p>
              <div className="mx-auto grid w-full max-w-md gap-3 rounded-2xl border border-ink-700 bg-ink-850 p-4 text-left">
                <p className="text-sm text-steel-300">Quer adiantar a conversa? Envie o resumo também pelo WhatsApp.</p>
                <LinkButton variant="whatsapp" href={waHref} target="_blank" rel="noopener noreferrer" icon={<MessageCircle className="size-4" />}>
                  Abrir conversa no WhatsApp
                </LinkButton>
                <p className="text-xs text-steel-400">O WhatsApp abre com a mensagem pronta. Ela só é enviada quando você tocar em enviar no aplicativo.</p>
              </div>
            </>
          ) : (
            <>
              <p className="mx-auto max-w-md text-sm leading-relaxed text-steel-300">
                Abrimos o WhatsApp com a mensagem pronta. <strong className="text-snow">Confira e toque em enviar no aplicativo</strong> — a mensagem não é enviada automaticamente.
              </p>
              {!hasWhatsNumber && (
                <Notice tone="warning" className="text-left">
                  Demonstração: o número de WhatsApp da oficina ainda não foi configurado, então o aplicativo pedirá que você escolha o contato.
                </Notice>
              )}
              <LinkButton variant="whatsapp" href={waHref} target="_blank" rel="noopener noreferrer" icon={<MessageCircle className="size-4" />} className="mx-auto">
                Abrir o WhatsApp novamente
              </LinkButton>
            </>
          )}
          {photos.length > 0 && !persisted && (
            <p className="flex items-center justify-center gap-2 text-xs text-steel-400">
              <Camera className="size-4" /> As fotos podem ser enviadas diretamente na conversa.
            </p>
          )}
        </div>
      )}
    </Modal>
  )
}

function Summary({ label, value, wide }: { label: string; value: string; wide?: boolean }) {
  return (
    <div className={`bg-ink-850 px-4 py-3 ${wide ? 'sm:col-span-2' : ''}`}>
      <dt className="text-[0.7rem] font-semibold tracking-[0.18em] text-steel-400 uppercase">{label}</dt>
      <dd className="mt-1 text-sm break-words whitespace-pre-line text-snow">{value}</dd>
    </div>
  )
}

function PhotoThumb({ file, alt }: { file: File; alt: string }) {
  const [url, setUrl] = useState('')
  useEffect(() => {
    const u = URL.createObjectURL(file)
    setUrl(u)
    return () => URL.revokeObjectURL(u)
  }, [file])
  return url ? <img src={url} alt={alt} className="size-full object-cover" /> : null
}
