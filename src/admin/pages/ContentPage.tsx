import { Input, Select, Textarea } from '../../components/ui/Field'
import { ErrorState, Notice } from '../../components/ui/Misc'
import { PageLoader } from '../../components/ui/Spinner'
import { ICONS } from '../../components/ui/ServiceIcon'
import { contrastWithWhite } from '../../lib/theme'
import type { SiteSettings } from '../../lib/settings'
import { PageHeader } from '../components/PageHeader'
import { ImageField } from '../components/ImageField'
import { FormSection, Grid2, ListEditor } from '../components/FormBits'
import { useSettingsEditor } from '../components/useSettingsEditor'

const PRESETS = ['#e10600', '#d71920', '#c8102e', '#ff3b30', '#e4572e']

export default function ContentPage() {
  const ed = useSettingsEditor()
  const { draft, field, set, errors } = ed

  return (
    <>
      <PageHeader title="Conteúdo do site" description="Textos, imagens e cores exibidos no site público. As alterações aparecem no site assim que forem salvas." />
      {ed.loadError && <ErrorState message={ed.loadError} onRetry={ed.load} />}
      {ed.loading || !draft ? (
        !ed.loadError && <PageLoader />
      ) : (
        <div className="rounded-2xl border border-ink-700 bg-ink-900 p-5 sm:p-8">
          <FormSection title="Identidade" description="Nome, logotipo e cor principal da marca.">
            <Grid2>
              <Input label="Nome da oficina" maxLength={80} {...field('business.name')} />
              <Input label="Slogan" maxLength={120} {...field('business.tagline')} />
            </Grid2>
            <Textarea label="Descrição curta (rodapé)" maxLength={400} {...field('business.description')} />
            <Grid2>
              <ImageField label="Logotipo" folder="brand" aspect="aspect-[3/1]" value={draft.business.logoUrl} onChange={(v) => set('business.logoUrl', v)} hint="PNG ou WebP com fundo transparente. Vazio = logotipo padrão." />
              <div className="grid content-start gap-2">
                <span className="text-[0.82rem] font-medium text-steel-200">Cor principal</span>
                <div className="flex flex-wrap items-center gap-2">
                  <input type="color" value={draft.theme.accent} onChange={(e) => set('theme.accent', e.target.value)} className="h-11 w-14 cursor-pointer rounded-xl border border-ink-600 bg-ink-850 p-1" aria-label="Escolher cor" />
                  <input
                    value={draft.theme.accent}
                    onChange={(e) => set('theme.accent', e.target.value)}
                    aria-label="Cor em hexadecimal"
                    aria-invalid={errors['theme.accent'] ? true : undefined}
                    className="h-11 w-28 rounded-xl border border-ink-600 bg-ink-850 px-3 font-mono text-sm uppercase outline-none focus:border-accent"
                  />
                  {PRESETS.map((c) => (
                    <button key={c} type="button" onClick={() => set('theme.accent', c)} className="size-8 rounded-full border-2 border-ink-900 ring-1 ring-ink-500" style={{ background: c }} aria-label={`Usar ${c}`} />
                  ))}
                </div>
                {errors['theme.accent'] && <p className="text-xs text-danger">{errors['theme.accent']}</p>}
                {/^#[0-9a-f]{6}$/i.test(draft.theme.accent) && contrastWithWhite(draft.theme.accent) < 3 && (
                  <Notice tone="warning">Esta cor tem pouco contraste com texto branco. Prefira tons mais escuros para botões legíveis.</Notice>
                )}
              </div>
            </Grid2>
          </FormSection>

          <FormSection title="Primeira dobra" description="Título, subtítulo, botões e imagem de destaque.">
            <Input label="Chamada acima do título" maxLength={80} {...field('hero.eyebrow')} />
            <Input label="Título principal" maxLength={120} {...field('hero.title')} />
            <Textarea label="Subtítulo" maxLength={300} {...field('hero.subtitle')} />
            <Grid2>
              <Input label="Botão principal" maxLength={40} {...field('hero.primaryCta')} />
              <Input label="Botão secundário" maxLength={40} {...field('hero.secondaryCta')} />
            </Grid2>
            <ImageField label="Imagem de fundo" folder="site" value={draft.hero.imageUrl} onChange={(v) => set('hero.imageUrl', v)} hint="Recomendado: 2400 × 1400 px, com o veículo à direita." />
          </FormSection>

          <FormSection title="Diferenciais" description="Benefícios apresentados logo após a primeira dobra.">
            <Grid2>
              <Input label="Chamada" maxLength={60} {...field('differentials.eyebrow')} />
              <Input label="Título" maxLength={120} {...field('differentials.title')} />
            </Grid2>
            <ListEditor<SiteSettings['differentials']['items'][number]>
              items={draft.differentials.items}
              onChange={(items) => set('differentials.items', items)}
              create={() => ({ icon: 'shield-check', title: '', text: '' })}
              addLabel="Adicionar diferencial"
              max={8}
              render={(item, update, i) => (
                <>
                  <Grid2>
                    <Input label="Título" value={item.title} maxLength={60} onChange={(e) => update({ title: e.target.value })} error={errors[`differentials.items.${i}.title`]} />
                    <Select label="Ícone" value={item.icon} onChange={(e) => update({ icon: e.target.value })}>
                      {Object.entries(ICONS).map(([k, v]) => (
                        <option key={k} value={k}>
                          {v.label}
                        </option>
                      ))}
                    </Select>
                  </Grid2>
                  <Textarea label="Descrição" value={item.text} maxLength={220} className="min-h-20" onChange={(e) => update({ text: e.target.value })} />
                </>
              )}
            />
          </FormSection>

          <FormSection title="A oficina" description="Apresentação, história, fotos e especialidades.">
            <Grid2>
              <Input label="Chamada" maxLength={60} {...field('about.eyebrow')} />
              <Input label="Título" maxLength={120} {...field('about.title')} />
            </Grid2>
            <Textarea label="Apresentação" maxLength={1200} {...field('about.text')} />
            <Textarea label="História" maxLength={1500} {...field('about.history')} />
            <Grid2>
              <ImageField label="Foto principal" folder="site" aspect="aspect-[4/5]" value={draft.about.imageUrl} onChange={(v) => set('about.imageUrl', v)} />
              <ImageField label="Foto secundária" folder="site" aspect="aspect-square" value={draft.about.secondaryImageUrl} onChange={(v) => set('about.secondaryImageUrl', v)} />
            </Grid2>
            <Textarea
              label="Especialidades"
              hint="Uma por linha."
              value={draft.about.specialties.join('\n')}
              onChange={(e) =>
                set(
                  'about.specialties',
                  e.target.value.split('\n').map((s) => s.trimStart()).filter((s, i, arr) => s || i === arr.length - 1).slice(0, 12),
                )
              }
              onBlur={() => set('about.specialties', draft.about.specialties.map((s) => s.trim()).filter(Boolean))}
              error={Object.keys(errors).find((k) => k.startsWith('about.specialties')) ? 'Revise as especialidades (máx. 60 caracteres cada).' : undefined}
            />
          </FormSection>

          <FormSection title="Títulos das seções">
            <Grid2>
              <Input label="Serviços — chamada" maxLength={60} {...field('servicesSection.eyebrow')} />
              <Input label="Serviços — título" maxLength={120} {...field('servicesSection.title')} />
            </Grid2>
            <Textarea label="Serviços — texto" maxLength={300} className="min-h-20" {...field('servicesSection.subtitle')} />
            <Grid2>
              <Input label="Galeria — chamada" maxLength={60} {...field('gallerySection.eyebrow')} />
              <Input label="Galeria — título" maxLength={120} {...field('gallerySection.title')} />
            </Grid2>
            <Textarea label="Galeria — texto" maxLength={300} className="min-h-20" {...field('gallerySection.subtitle')} />
            <Grid2>
              <Input label="Avaliações — chamada" maxLength={60} {...field('reviewsSection.eyebrow')} />
              <Input label="Avaliações — título" maxLength={120} {...field('reviewsSection.title')} />
            </Grid2>
            <Textarea label="Avaliações — texto" maxLength={300} className="min-h-20" {...field('reviewsSection.subtitle')} />
            <Textarea label="Avaliações — mensagem quando não houver avaliações" maxLength={300} className="min-h-20" {...field('reviewsSection.emptyText')} />
            <Grid2>
              <Input label="Perguntas — chamada" maxLength={60} {...field('faqSection.eyebrow')} />
              <Input label="Perguntas — título" maxLength={120} {...field('faqSection.title')} />
            </Grid2>
            <Grid2>
              <Input label="Contato — chamada" maxLength={60} {...field('contactSection.eyebrow')} />
              <Input label="Contato — título" maxLength={120} {...field('contactSection.title')} />
            </Grid2>
            <Textarea label="Contato — texto" maxLength={300} className="min-h-20" {...field('contactSection.subtitle')} />
          </FormSection>

          <FormSection title="Chamada final" description="Bloco de conversão antes do rodapé.">
            <Input label="Título" maxLength={120} {...field('finalCta.title')} />
            <Textarea label="Texto" maxLength={300} className="min-h-20" {...field('finalCta.text')} />
            <Grid2>
              <Input label="Botão de orçamento" maxLength={40} {...field('finalCta.primaryCta')} />
              <Input label="Botão de WhatsApp" maxLength={40} {...field('finalCta.whatsappCta')} />
            </Grid2>
          </FormSection>
          {ed.saveBar}
        </div>
      )}
    </>
  )
}
