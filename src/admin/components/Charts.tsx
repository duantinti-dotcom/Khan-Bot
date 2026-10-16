import { useState } from 'react'
import { formatDate } from '../../lib/format'

/** Colunas por dia (uma série). Tooltip ao passar o mouse / focar e tabela acessível. */
export function DailyBars({ data }: { data: { day: string; count: number }[] }) {
  const [hover, setHover] = useState<number | null>(null)
  const max = Math.max(1, ...data.map((d) => d.count))
  const ticks = niceTicks(max)
  const top = ticks[ticks.length - 1]
  const H = 180

  return (
    <div>
      <div className="relative flex gap-3">
        <div className="relative w-6 shrink-0 text-right text-[0.68rem] text-steel-400" style={{ height: H }} aria-hidden="true">
          {ticks.map((t) => (
            <span key={t} className="absolute right-0 -translate-y-1/2 tabular-nums" style={{ top: H - (t / top) * H }}>
              {t}
            </span>
          ))}
        </div>
        <div className="relative flex-1" style={{ height: H }}>
          {ticks.map((t) => (
            <div key={t} className="absolute inset-x-0 border-t border-ink-700/70" style={{ top: H - (t / top) * H }} aria-hidden="true" />
          ))}
          <div className="absolute inset-0 flex items-end gap-[2px]" role="img" aria-label="Solicitações por dia">
            {data.map((d, i) => (
              <button
                key={d.day}
                type="button"
                className="group relative flex h-full flex-1 items-end focus-visible:outline-none"
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
                onFocus={() => setHover(i)}
                onBlur={() => setHover(null)}
                aria-label={`${formatDate(d.day)}: ${d.count} solicitações`}
              >
                <span
                  className={`block w-full rounded-t-[4px] transition-colors ${d.count ? (hover === i ? 'bg-snow' : 'bg-accent') : ''}`}
                  style={{ height: d.count ? Math.max(3, (d.count / top) * H) : 0 }}
                />
                {hover === i && (
                  <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 -translate-x-1/2 rounded-lg border border-ink-600 bg-ink-800 px-2.5 py-1.5 text-xs whitespace-nowrap text-snow shadow-xl">
                    <span className="block text-steel-400">{formatDate(d.day)}</span>
                    <span className="font-semibold tabular-nums">{d.count}</span> solicitaç{d.count === 1 ? 'ão' : 'ões'}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="mt-2 flex justify-between pl-9 text-[0.68rem] text-steel-400" aria-hidden="true">
        <span>{data[0] && formatDate(data[0].day)}</span>
        <span>{data.at(-1) && formatDate(data.at(-1)!.day)}</span>
      </div>
      <table className="sr-only">
        <caption>Solicitações por dia</caption>
        <thead>
          <tr>
            <th>Dia</th>
            <th>Solicitações</th>
          </tr>
        </thead>
        <tbody>
          {data.map((d) => (
            <tr key={d.day}>
              <td>{formatDate(d.day)}</td>
              <td>{d.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function RankBars({ data }: { data: { name: string; count: number }[] }) {
  const max = Math.max(1, ...data.map((d) => d.count))
  return (
    <ul className="grid gap-4">
      {data.map((d) => (
        <li key={d.name} title={`${d.name}: ${d.count}`}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="truncate text-steel-200">{d.name}</span>
            <span className="font-semibold tabular-nums">{d.count}</span>
          </div>
          <div className="mt-2 h-2 rounded-full bg-ink-800">
            <div className="h-full rounded-full bg-accent" style={{ width: `${(d.count / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  )
}

function niceTicks(max: number): number[] {
  const step = max <= 4 ? 1 : max <= 10 ? 2 : Math.ceil(max / 4 / 5) * 5
  const out: number[] = []
  for (let v = 0; v <= max + step - 1; v += step) out.push(v)
  if (out[out.length - 1] < max) out.push(out[out.length - 1] + step)
  return out
}
