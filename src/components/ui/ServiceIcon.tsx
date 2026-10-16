import {
  BatteryCharging,
  Car,
  CircleDot,
  ClipboardCheck,
  Cog,
  Disc,
  Droplet,
  FileText,
  Fuel,
  Gauge,
  Lightbulb,
  MessageSquare,
  ScanLine,
  ShieldCheck,
  Snowflake,
  Sparkles,
  Thermometer,
  UserCheck,
  Wrench,
  Zap,
  type LucideIcon,
} from 'lucide-react'

/** Ícones disponíveis para serviços e diferenciais (escolhidos no painel). */
export const ICONS: Record<string, { icon: LucideIcon; label: string }> = {
  'clipboard-check': { icon: ClipboardCheck, label: 'Checklist' },
  droplet: { icon: Droplet, label: 'Óleo / fluido' },
  'scan-line': { icon: ScanLine, label: 'Diagnóstico' },
  disc: { icon: Disc, label: 'Freio' },
  cog: { icon: Cog, label: 'Engrenagem' },
  thermometer: { icon: Thermometer, label: 'Temperatura' },
  zap: { icon: Zap, label: 'Elétrica' },
  snowflake: { icon: Snowflake, label: 'Ar-condicionado' },
  'circle-dot': { icon: CircleDot, label: 'Roda' },
  wrench: { icon: Wrench, label: 'Ferramenta' },
  gauge: { icon: Gauge, label: 'Painel' },
  battery: { icon: BatteryCharging, label: 'Bateria' },
  fuel: { icon: Fuel, label: 'Combustível' },
  lightbulb: { icon: Lightbulb, label: 'Iluminação' },
  car: { icon: Car, label: 'Veículo' },
  sparkles: { icon: Sparkles, label: 'Estética' },
  'shield-check': { icon: ShieldCheck, label: 'Segurança' },
  'file-text': { icon: FileText, label: 'Documento' },
  'user-check': { icon: UserCheck, label: 'Atendimento' },
  'message-square': { icon: MessageSquare, label: 'Comunicação' },
}

export function ServiceIcon({ name, className = 'size-5' }: { name: string; className?: string }) {
  const Icon = ICONS[name]?.icon ?? Wrench
  return <Icon className={className} strokeWidth={1.6} aria-hidden="true" />
}
