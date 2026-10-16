/** Aplica a cor de destaque configurada no painel às variáveis CSS. */
export function applyTheme(accent: string) {
  if (!/^#[0-9a-fA-F]{6}$/.test(accent)) return
  const root = document.documentElement
  root.style.setProperty('--brand-accent', accent)
  root.style.setProperty('--brand-accent-strong', shade(accent, -0.18))
}

function shade(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16)
  const ch = (shift: number) => {
    const c = (n >> shift) & 0xff
    const v = amount < 0 ? c * (1 + amount) : c + (255 - c) * amount
    return Math.max(0, Math.min(255, Math.round(v)))
  }
  return `#${[16, 8, 0].map((s) => ch(s).toString(16).padStart(2, '0')).join('')}`
}

/** Contraste aproximado (WCAG) entre a cor e o branco. */
export function contrastWithWhite(hex: string): number {
  const n = parseInt(hex.slice(1), 16)
  const lin = (c: number) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  const L = 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255)
  return 1.05 / (L + 0.05)
}
