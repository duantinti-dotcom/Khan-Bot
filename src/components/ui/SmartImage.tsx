import { useState, type ImgHTMLAttributes } from 'react'
import { imageSrcSet, optimizedImage } from '../../lib/images'

interface SmartImageProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'> {
  src: string
  width?: number
  widths?: number[]
}

/**
 * Imagem otimizada com fallback visual: se a foto não carregar, mostra uma
 * composição neutra na identidade da marca em vez de um ícone quebrado.
 */
export function SmartImage({ src, width = 1200, widths, alt = '', className = '', sizes, ...rest }: SmartImageProps) {
  const [failed, setFailed] = useState(false)
  if (!src || failed) {
    return (
      <div
        role={alt ? 'img' : undefined}
        aria-label={alt || undefined}
        className={`grid-bg relative overflow-hidden bg-gradient-to-br from-ink-800 via-ink-900 to-ink-950 ${className}`}
      >
        <svg viewBox="0 0 64 64" className="absolute top-1/2 left-1/2 w-1/5 max-w-24 -translate-x-1/2 -translate-y-1/2 opacity-[0.12]" aria-hidden="true">
          <path d="M12 16h11l9 21 9-21h11L37.5 48h-11z" fill="#fff" />
        </svg>
      </div>
    )
  }
  return (
    <img
      src={optimizedImage(src, width)}
      srcSet={widths ? imageSrcSet(src, widths) : undefined}
      sizes={sizes}
      alt={alt}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
      className={className}
      {...rest}
    />
  )
}
