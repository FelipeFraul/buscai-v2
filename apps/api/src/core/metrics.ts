type CounterMap = Record<string, number>;
type TimerStats = { count: number; totalMs: number; avgMs: number };

const counters: CounterMap = {};
const timers: Record<string, TimerStats> = {};

export function incrementCounter(name: string, value = 1): void {
  counters[name] = (counters[name] ?? 0) + value;
}

export function recordTimer(name: string, durationMs: number): void {
  const current = timers[name] ?? { count: 0, totalMs: 0, avgMs: 0 };
  current.count += 1;
  current.totalMs += durationMs;
  current.avgMs = current.totalMs / current.count;
  timers[name] = current;
}

export function getMetricsSnapshot(): {
  counters: CounterMap;
  timers: Record<string, TimerStats>;
} {
  return {
    counters: { ...counters },
    timers: { ...timers },
  };
}
