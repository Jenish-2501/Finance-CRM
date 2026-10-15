import React from 'react';

export interface MonthBucket {
  key: string;
  label: string;
}

/** Last `n` calendar months (oldest first), labels like "Aug". */
export function lastMonths(n: number, now = new Date()): MonthBucket[] {
  const out: MonthBucket[] = [];
  const base = new Date(now.getFullYear(), now.getMonth(), 1);
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(base.getFullYear(), base.getMonth() - i, 1);
    out.push({
      key: `${d.getFullYear()}-${d.getMonth()}`,
      label: d.toLocaleDateString(undefined, { month: 'short' }),
    });
  }
  return out;
}

export function monthKeyOf(iso: string): string | null {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${d.getMonth()}`;
}

/** Percent change of current vs previous. Null when previous is 0 (no base). */
export function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

/** ▲/▼/• badge comparing this month to the previous one. */
export const DeltaBadge: React.FC<{ current: number; previous: number; suffix?: string }> = ({
  current,
  previous,
  suffix = '',
}) => {
  const pct = pctChange(current, previous);
  if (pct === null) {
    return <span className="text-[11px] font-mono text-muted-foreground">• new{suffix}</span>;
  }
  if (Math.abs(pct) < 0.05) {
    return <span className="text-[11px] font-mono text-muted-foreground">• 0%{suffix}</span>;
  }
  const up = pct > 0;
  return (
    <span
      className={`text-[11px] font-mono font-semibold ${
        up ? 'text-emerald-700 dark:text-emerald-300' : 'text-destructive'
      }`}
    >
      {up ? '▲' : '▼'} {Math.abs(pct).toFixed(pct >= 100 || pct <= -100 ? 0 : 1)}%{suffix}
    </span>
  );
};

const W = 600;
const H = 220;
const PAD_L = 44;
const PAD_B = 26;
const PAD_T = 12;

function niceMax(raw: number): number {
  if (raw <= 0) return 1;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const nice = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10;
  return nice * mag;
}

const ChartShell: React.FC<{
  title: string;
  buckets: MonthBucket[];
  max: number;
  formatTick: (v: number) => string;
  children: (geom: { x0: number; x1: number; y: (v: number) => number; bw: number }) => React.ReactNode;
}> = ({ title, buckets, max, formatTick, children }) => {
  const plotW = W - PAD_L - 8;
  const plotH = H - PAD_T - PAD_B;
  const y = (v: number) => PAD_T + plotH - (Math.max(0, v) / max) * plotH;
  const slot = plotW / buckets.length;
  const gridVals = [0, max / 2, max];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={title} className="w-full h-auto">
      <title>{title}</title>
      {gridVals.map((g) => (
        <g key={g}>
          <line x1={PAD_L} x2={W - 8} y1={y(g)} y2={y(g)} className="stroke-border" strokeWidth={1} strokeDasharray={g === 0 ? undefined : '3 3'} />
          <text x={PAD_L - 5} y={y(g) + 3.5} textAnchor="end" fontSize={10} className="fill-muted-foreground font-mono">
            {formatTick(g)}
          </text>
        </g>
      ))}
      {buckets.map((b, i) => {
        const x0 = PAD_L + i * slot;
        return (
          <g key={b.key}>
            {children({ x0, x1: x0 + slot, y, bw: slot })}
            <text x={x0 + slot / 2} y={H - 8} textAnchor="middle" fontSize={10.5} className="fill-muted-foreground font-mono">
              {b.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
};

function Bar({ x, y, w, h, className }: { x: number; y: number; w: number; h: number; className: string }) {
  const cappedH = Math.max(0, h);
  return <rect x={x} y={y} width={w} height={cappedH} rx={2.5} className={className} />;
}

/** Two series side-by-side per month (e.g. sales vs collections). */
export const GroupedBars: React.FC<{
  title: string;
  buckets: MonthBucket[];
  a: number[];
  b: number[];
  formatTick: (v: number) => string;
  classA?: string;
  classB?: string;
}> = ({ title, buckets, a, b, formatTick, classA = 'fill-primary', classB = 'fill-emerald-500' }) => {
  const max = niceMax(Math.max(1, ...a, ...b));
  return (
    <ChartShell title={title} buckets={buckets} max={max} formatTick={formatTick}>
      {({ x0, x1, y, bw }) => {
        const i = Math.round((x0 - PAD_L) / bw);
        const gw = Math.min(34, bw * 0.52);
        const gap = 3;
        const wEach = (gw - gap) / 2;
        const cx = (x0 + x1) / 2;
        return (
          <g>
            <Bar x={cx - gw / 2} y={y(a[i] ?? 0)} w={wEach} h={y(0) - y(a[i] ?? 0)} className={classA} />
            <Bar x={cx - gw / 2 + wEach + gap} y={y(b[i] ?? 0)} w={wEach} h={y(0) - y(b[i] ?? 0)} className={classB} />
          </g>
        );
      }}
    </ChartShell>
  );
};

/** Single series per month; the current (last) month is highlighted. */
export const SingleBars: React.FC<{
  title: string;
  buckets: MonthBucket[];
  values: number[];
  formatTick: (v: number) => string;
  barClass?: string;
  lastClass?: string;
}> = ({ title, buckets, values, formatTick, barClass = 'fill-muted-foreground/40', lastClass = 'fill-primary' }) => {
  const max = niceMax(Math.max(1, ...values));
  return (
    <ChartShell title={title} buckets={buckets} max={max} formatTick={formatTick}>
      {({ x0, x1, y, bw }) => {
        const i = Math.round((x0 - PAD_L) / bw);
        const w = Math.min(34, bw * 0.5);
        const cx = (x0 + x1) / 2;
        const isLast = i === buckets.length - 1;
        return (
          <Bar
            x={cx - w / 2}
            y={y(values[i] ?? 0)}
            w={w}
            h={y(0) - y(values[i] ?? 0)}
            className={isLast ? lastClass : barClass}
          />
        );
      }}
    </ChartShell>
  );
};

/** Compact INR for axis ticks, e.g. ₹1.2L. Falls back to plain compact number. */
export function compactINR(v: number): string {
  try {
    return new Intl.NumberFormat('en-IN', { notation: 'compact', maximumFractionDigits: 1 }).format(v);
  } catch {
    return String(Math.round(v));
  }
}

export function compactNum(v: number): string {
  try {
    return new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(v);
  } catch {
    return String(Math.round(v));
  }
}
