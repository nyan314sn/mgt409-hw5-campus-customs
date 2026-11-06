import { useCallback, useEffect, useRef, useState } from 'react'

/** Calls `cb` every `ms` milliseconds; pass null to pause. Always calls the latest `cb`. */
export function useInterval(cb: () => void, ms: number | null) {
  const ref = useRef(cb)
  useEffect(() => {
    ref.current = cb
  })
  useEffect(() => {
    if (ms === null) return
    const id = window.setInterval(() => ref.current(), ms)
    return () => window.clearInterval(id)
  }, [ms])
}

/** Current time, re-rendered every `ms`. */
export function useNow(ms = 1000): number {
  const [now, setNow] = useState(() => Date.now())
  useInterval(() => setNow(Date.now()), ms)
  return now
}

const reduceMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/** A number that glides to its target, for gauges and counters. Until `ready` (real data
 *  has arrived) it jumps instead, so the first reading doesn't sweep up from zero. */
export function useAnimatedNumber(target: number, ms = 1200, ready = true): number {
  const [value, setValue] = useState(target)
  const from = useRef(target)
  const primed = useRef(false)
  useEffect(() => {
    if (!ready || !primed.current || reduceMotion()) {
      primed.current = ready
      setValue(target)
      from.current = target
      return
    }
    const start = performance.now()
    const begin = from.current
    let raf = 0
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / ms)
      const eased = 1 - Math.pow(1 - p, 3)
      const v = begin + (target - begin) * eased
      setValue(v)
      from.current = v
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, ms, ready])
  return value
}

/** useState backed by localStorage (per-browser conveniences only). */
export function useStored<T>(key: string, initial: T): [T, (v: T) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = window.localStorage.getItem(key)
      return raw === null ? initial : (JSON.parse(raw) as T)
    } catch {
      return initial
    }
  })
  const set = useCallback(
    (v: T) => {
      setValue(v)
      try {
        window.localStorage.setItem(key, JSON.stringify(v))
      } catch {
        /* storage blocked: keep the in-memory value */
      }
    },
    [key],
  )
  return [value, set]
}
