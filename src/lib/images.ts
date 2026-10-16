/**
 * Gera URLs otimizadas. Para imagens do Unsplash usa os parâmetros de
 * redimensionamento da própria CDN; para as demais devolve a URL original.
 */
export function optimizedImage(url: string, width: number, quality = 72): string {
  if (!url) return url
  if (url.startsWith('https://images.unsplash.com/')) {
    const base = url.split('?')[0]
    return `${base}?auto=format&fit=crop&w=${width}&q=${quality}`
  }
  return url
}

export function imageSrcSet(url: string, widths: number[]): string | undefined {
  if (!url.startsWith('https://images.unsplash.com/')) return undefined
  return widths.map((w) => `${optimizedImage(url, w)} ${w}w`).join(', ')
}

export const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp']
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024

export function validateImageFile(file: File, accepted = ACCEPTED_IMAGE_TYPES): string | null {
  if (!accepted.includes(file.type)) return 'Formato não suportado. Envie JPG, PNG ou WebP.'
  if (file.size > MAX_IMAGE_BYTES) return 'A imagem deve ter no máximo 5 MB.'
  return null
}

export function safeFileName(name: string): string {
  const ext = (name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5) || 'jpg'
  const base = name
    .replace(/\.[^.]+$/, '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
  return `${base || 'imagem'}.${ext}`
}
