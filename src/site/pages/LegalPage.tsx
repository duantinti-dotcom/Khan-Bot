import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { useSiteData } from '../../context/SiteDataContext'
import { usePublicSeo } from '../../lib/seo'

const YEAR = new Date().getFullYear()

function LegalShell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="bg-ink-950 pt-[72px]">
      <article className="container-x max-w-3xl py-20 sm:py-28">
        <Link to="/" className="inline-flex items-center gap-2 text-sm text-steel-400 hover:text-snow">
          <ArrowLeft className="size-4" /> Voltar ao site
        </Link>
        <h1 className="font-wide mt-8 text-3xl font-bold tracking-tight uppercase sm:text-4xl">{title}</h1>
        <div className="mt-10 grid gap-6 text-[0.95rem] leading-relaxed text-steel-300 [&_h2]:mt-4 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-snow [&_li]:ml-5 [&_li]:list-disc [&_ul]:grid [&_ul]:gap-2">
          {children}
        </div>
      </article>
    </div>
  )
}

export function PrivacyPage() {
  const { data } = useSiteData()
  usePublicSeo(data.settings, { title: 'Política de privacidade', path: '/privacidade' })
  const { business, contact } = data.settings
  const owner = business.legalName || business.name
  return (
    <LegalShell title="Política de privacidade">
      {business.isDemo && (
        <p className="rounded-xl border border-warning/30 bg-warning/[0.07] px-4 py-3 text-sm text-warning">
          Modelo demonstrativo. Antes da publicação, revise este texto com a assessoria jurídica da oficina.
        </p>
      )}
      <p>
        Esta política explica como {owner} trata os dados pessoais informados neste site, em conformidade com a Lei Geral de Proteção de Dados (Lei nº 13.709/2018).
      </p>
      <h2>Quais dados coletamos</h2>
      <ul>
        <li>Nome, telefone/WhatsApp e preferência de contato;</li>
        <li>Dados do veículo (marca, modelo, ano e quilometragem) e a descrição da necessidade;</li>
        <li>Data e período de preferência para atendimento, quando informados;</li>
        <li>Fotos do veículo, quando enviadas voluntariamente.</li>
      </ul>
      <h2>Para que usamos</h2>
      <p>
        Exclusivamente para responder à sua solicitação de orçamento, entrar em contato sobre o atendimento e manter o histórico dos serviços solicitados. Não vendemos nem compartilhamos seus dados para fins de publicidade.
      </p>
      <h2>Base legal</h2>
      <p>O tratamento ocorre com base no seu consentimento e em procedimentos preliminares relacionados a um eventual contrato de prestação de serviços.</p>
      <h2>Armazenamento e segurança</h2>
      <p>
        As solicitações ficam em ambiente com acesso restrito à equipe autorizada da oficina. As observações internas e as fotos enviadas não são públicas. Para controle de abuso, o endereço IP pode ser registrado de forma anonimizada.
      </p>
      <h2>WhatsApp</h2>
      <p>
        Ao optar por conversar pelo WhatsApp, a comunicação passa a seguir também os termos e a política de privacidade do próprio aplicativo. Abrir a conversa não envia mensagens automaticamente.
      </p>
      <h2>Seus direitos</h2>
      <p>Você pode solicitar acesso, correção ou exclusão dos seus dados a qualquer momento{contact.email ? ' pelo e-mail ' : ' pelos canais de contato informados no site'}{contact.email && <a className="text-snow underline" href={`mailto:${contact.email}`}>{contact.email}</a>}.</p>
      <p className="text-sm text-steel-400">Última atualização: {YEAR}.</p>
    </LegalShell>
  )
}

export function TermsPage() {
  const { data } = useSiteData()
  usePublicSeo(data.settings, { title: 'Termos de uso', path: '/termos' })
  const { business } = data.settings
  return (
    <LegalShell title="Termos de uso">
      {business.isDemo && (
        <p className="rounded-xl border border-warning/30 bg-warning/[0.07] px-4 py-3 text-sm text-warning">
          Modelo demonstrativo. Antes da publicação, revise este texto com a assessoria jurídica da oficina.
        </p>
      )}
      <h2>Solicitações de orçamento</h2>
      <p>
        O formulário deste site serve para solicitar um orçamento e iniciar o contato com a equipe da {business.name}. O envio não representa contratação de serviço, aprovação de orçamento ou agendamento confirmado.
      </p>
      <h2>Datas e horários</h2>
      <p>A data e o período informados são apenas preferências. A disponibilidade é confirmada manualmente pela equipe.</p>
      <h2>Orçamentos e valores</h2>
      <p>Nenhum serviço é executado sem aprovação prévia do orçamento. Valores exibidos no site, quando houver, são referências e podem variar conforme o diagnóstico do veículo.</p>
      <h2>Conteúdo</h2>
      <p>Imagens marcadas como ilustrativas não retratam necessariamente serviços realizados pela oficina.</p>
    </LegalShell>
  )
}

export function NotFoundPage() {
  return (
    <div className="flex min-h-[80vh] items-center bg-ink-950 pt-[72px]">
      <div className="container-x text-center">
        <p className="font-wide text-7xl font-extrabold text-accent">404</p>
        <h1 className="font-wide mt-4 text-2xl font-bold uppercase">Página não encontrada</h1>
        <p className="mt-3 text-steel-400">O endereço acessado não existe ou foi alterado.</p>
        <Link to="/" className="mt-8 inline-flex h-11 items-center rounded-full bg-accent px-6 text-sm font-semibold text-white hover:bg-accent-strong">
          Voltar ao início
        </Link>
      </div>
    </div>
  )
}
