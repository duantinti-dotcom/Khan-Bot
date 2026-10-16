import { forwardRef, type AnchorHTMLAttributes, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Spinner } from './Spinner'

type Variant = 'primary' | 'secondary' | 'ghost' | 'outline' | 'danger' | 'whatsapp'
type Size = 'sm' | 'md' | 'lg'

const base =
  'group/btn relative inline-flex items-center justify-center gap-2 rounded-full font-semibold whitespace-nowrap transition-[background-color,border-color,color,transform,box-shadow] duration-200 select-none disabled:pointer-events-none disabled:opacity-50 active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent'

const variants: Record<Variant, string> = {
  primary: 'bg-accent text-white hover:bg-accent-strong shadow-[0_8px_24px_-12px_var(--color-accent)]',
  secondary: 'bg-snow text-ink-950 hover:bg-white',
  outline: 'border border-ink-500 text-snow hover:border-steel-300 hover:bg-white/[0.04]',
  ghost: 'text-steel-200 hover:bg-white/[0.06] hover:text-snow',
  danger: 'bg-danger/10 text-danger border border-danger/30 hover:bg-danger/20',
  whatsapp: 'bg-[#1fa855] text-white hover:bg-[#1a9149]',
}

const sizes: Record<Size, string> = {
  sm: 'h-9 px-4 text-[0.8rem]',
  md: 'h-11 px-5 text-sm',
  lg: 'h-13 px-7 text-[0.95rem] tracking-wide',
}

export function buttonClass(variant: Variant = 'primary', size: Size = 'md', extra = '') {
  return `${base} ${variants[variant]} ${sizes[size]} ${extra}`
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  loading?: boolean
  icon?: ReactNode
  iconRight?: ReactNode
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading, icon, iconRight, className = '', children, disabled, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={buttonClass(variant, size, className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <Spinner className="size-4" /> : icon}
      {children}
      {!loading && iconRight}
    </button>
  )
})

interface LinkButtonProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  variant?: Variant
  size?: Size
  to?: string
  icon?: ReactNode
  iconRight?: ReactNode
}

export function LinkButton({ variant = 'primary', size = 'md', to, href, className = '', icon, iconRight, children, ...rest }: LinkButtonProps) {
  const cls = buttonClass(variant, size, className)
  if (to)
    return (
      <Link to={to} className={cls} {...rest}>
        {icon}
        {children}
        {iconRight}
      </Link>
    )
  return (
    <a href={href} className={cls} {...rest}>
      {icon}
      {children}
      {iconRight}
    </a>
  )
}

export function IconButton({
  label,
  className = '',
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={`inline-flex size-9 items-center justify-center rounded-full text-steel-300 transition-colors hover:bg-white/[0.07] hover:text-snow disabled:pointer-events-none disabled:opacity-40 ${className}`}
      {...rest}
    >
      {children}
    </button>
  )
}
