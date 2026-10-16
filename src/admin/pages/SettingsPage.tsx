import { Input, Select, Switch, Textarea } from '../../components/ui/Field'
import { ErrorState, Notice } from '../../components/ui/Misc'
import { PageLoader } from '../../components/ui/Spinner'
import { maskBrPhone, onlyDigits } from '../../lib/phone'
import type { SiteSettings } from '../../lib/settings'
import { whatsappLink } from '../../lib/whatsapp'
import { PageHeader } from '../components/PageHeader'
import { ImageField } from '../components/ImageField'
import { FormSection, Grid2, ListEditor } from '../components/FormBits'
import { useSettingsEditor } from '../components/useSettingsEditor'

export default function SettingsPage() {
  const ed = useSettingsEditor()
  const { draft, field, set, errors } = ed

  return (
    <>
      <PageHeader title="Configurações" description="Dados comerciais, contato, horários, redes sociais, SEO e preferências de exibição." />
      {ed.loadError && <ErrorState message={ed.loadError} onRetry={ed.load} />}
      {ed.loading || !draft ? (
        !ed.loadError && <PageLoader />
      ) : (
        <div className="rounded-2xl border border-ink-700 bg-ink-900 p-5 sm:p-8">
          <FormSection title="Dados comerciais" description="Usados no rodapé e na política de privacidade.">
            <Grid2>
              <Input label="Razão social" optional maxLength={160} {...field('business.legalName')} />
              <Input label="CNPJ" optional maxLength={40} {...field('business.document')} />
            </Grid2>
            <Switch
              label="Modo demonstração"
              description="Enquanto ativo, o site sinaliza os dados de contato como demonstrativos, oculta o mapa e não publica dados estruturados. Desative ao configurar os dados reais."
              checked={draft.business.isDemo}
              onChange={(v) => set('business.isDemo', v)}
            />
          </FormSection>

          <FormSection title="Contato e localização">
            <Grid2>
              <Input label="Telefone" maxLength={30} placeholder="(11) 3456-7890" {...field('contact.phone')} />
              <Input label="E-mail" type="email" maxLength={160} {...field('contact.email')} />
            </Grid2>
            <Input label="Endereço" maxLength={200} placeholder="Rua, número, bairro" {...field('contact.address')} />
            <div className="grid gap-5 sm:grid-cols-[2fr_1fr_1fr]">
              <Input label="Cidade" maxLength={80} {...field('contact.city')} />
              <Input label="UF" maxLength={40} {...field('contact.state')} />
              <Input label="CEP" maxLength={12} {...field('contact.zip')} />
            </div>
            <Input label="Link do Google Maps" optional hint="Opcional. Se vazio, o botão de rotas usa o endereço acima." {...field('contact.mapsUrl')} />
            <Select label="Canal de contato preferido" value={draft.contact.preferredChannel} onChange={(e) => set('contact.preferredChannel', e.target.value)}>
              <option value="whatsapp">WhatsApp</option>
              <option value="telefone">Telefone</option>
              <option value="email">E-mail</option>
            </Select>
          </FormSection>

          <FormSection title="WhatsApp" description="Número que recebe as conversas iniciadas pelo site.">
            <Input
              label="Número do WhatsApp"
              inputMode="tel"
              placeholder="55 11 91234-5678"
              hint="Com DDI 55 e DDD. Sem número, o WhatsApp abre para o visitante escolher o contato."
              value={draft.contact.whatsapp}
              onChange={(e) => {
                const d = onlyDigits(e.target.value).slice(0, 13)
                set('contact.whatsapp', d)
              }}
              error={errors['contact.whatsapp']}
            />
            {draft.contact.whatsapp && (
              <p className="text-xs text-steel-400">
                Formato: +{draft.contact.whatsapp.slice(0, 2)} {maskBrPhone(draft.contact.whatsapp)} ·{' '}
                <a className="text-accent hover:underline" href={whatsappLink(draft.contact.whatsapp, 'Teste de configuração')} target="_blank" rel="noopener noreferrer">
                  Testar link
                </a>
              </p>
            )}
            <Textarea label="Mensagem inicial padrão" maxLength={300} className="min-h-20" {...field('whatsapp.greeting')} />
            <Switch label="Botão flutuante do WhatsApp" checked={draft.whatsapp.floatingButton} onChange={(v) => set('whatsapp.floatingButton', v)} />
            <Notice>O site abre o WhatsApp com a mensagem pronta. O envio só acontece quando o visitante confirma dentro do aplicativo.</Notice>
          </FormSection>

          <FormSection title="Horários">
            <ListEditor<SiteSettings['hours'][number]>
              items={draft.hours}
              onChange={(items) => set('hours', items)}
              create={() => ({ days: '', hours: '' })}
              addLabel="Adicionar horário"
              render={(h, update, i) => (
                <Grid2>
                  <Input label="Dias" placeholder="Segunda a sexta" value={h.days} maxLength={40} onChange={(e) => update({ days: e.target.value })} error={errors[`hours.${i}.days`]} />
                  <Input label="Horário" placeholder="08h às 18h" value={h.hours} maxLength={60} onChange={(e) => update({ hours: e.target.value })} error={errors[`hours.${i}.hours`]} />
                </Grid2>
              )}
            />
          </FormSection>

          <FormSection title="Redes sociais e links" description="Informe endereços completos (https://…). Campos vazios ficam ocultos.">
            <Grid2>
              <Input label="Instagram" placeholder="https://instagram.com/…" {...field('social.instagram')} />
              <Input label="Facebook" placeholder="https://facebook.com/…" {...field('social.facebook')} />
              <Input label="YouTube" placeholder="https://youtube.com/…" {...field('social.youtube')} />
              <Input label="TikTok" placeholder="https://tiktok.com/@…" {...field('social.tiktok')} />
            </Grid2>
            <Input label="Perfil no Google (avaliações)" optional placeholder="https://g.page/…" {...field('social.googleBusiness')} />
            <ListEditor<SiteSettings['links'][number]>
              items={draft.links}
              onChange={(items) => set('links', items)}
              create={() => ({ label: '', url: '' })}
              addLabel="Adicionar link externo"
              max={8}
              render={(l, update, i) => (
                <Grid2>
                  <Input label="Nome" value={l.label} maxLength={40} onChange={(e) => update({ label: e.target.value })} error={errors[`links.${i}.label`]} />
                  <Input label="URL" value={l.url} onChange={(e) => update({ url: e.target.value })} error={errors[`links.${i}.url`]} />
                </Grid2>
              )}
            />
          </FormSection>

          <FormSection title="SEO e compartilhamento" description="Como o site aparece no Google e em redes sociais.">
            <Input label="Título da página" maxLength={70} hint={`${draft.seo.title.length}/70 caracteres`} {...field('seo.title')} />
            <Textarea label="Descrição" maxLength={170} className="min-h-20" hint={`${draft.seo.description.length}/170 caracteres`} {...field('seo.description')} />
            <Input label="Endereço do site" placeholder="https://www.suaoficina.com.br" {...field('seo.siteUrl')} />
            <ImageField label="Imagem de compartilhamento" folder="site" aspect="aspect-[1200/630]" value={draft.seo.ogImage} onChange={(v) => set('seo.ogImage', v)} hint="1200 × 630 px." />
            <Switch
              label="Dados estruturados (SEO local)"
              description="Publica nome, endereço e contato no formato schema.org. Só é aplicado com o modo demonstração desativado."
              checked={draft.seo.structuredData}
              onChange={(v) => set('seo.structuredData', v)}
            />
          </FormSection>

          <FormSection title="Exibição" description="Seções e recursos visíveis no site.">
            <Switch label="Exibir preços cadastrados" checked={draft.display.showPrices} onChange={(v) => set('display.showPrices', v)} />
            <Switch label="Exibir galeria" checked={draft.display.showGallery} onChange={(v) => set('display.showGallery', v)} />
            <Switch label="Exibir avaliações" checked={draft.display.showReviews} onChange={(v) => set('display.showReviews', v)} />
            <Switch label="Exibir perguntas frequentes" checked={draft.display.showFaq} onChange={(v) => set('display.showFaq', v)} />
            <Switch label="Exibir mapa" checked={draft.display.showMap} onChange={(v) => set('display.showMap', v)} />
            <Switch label="Permitir envio de fotos no orçamento" description="As fotos ficam em armazenamento privado, acessível apenas pelo painel." checked={draft.display.allowPhotos} onChange={(v) => set('display.allowPhotos', v)} />
          </FormSection>
          {ed.saveBar}
        </div>
      )}
    </>
  )
}
