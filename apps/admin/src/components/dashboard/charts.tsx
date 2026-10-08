"use client";

import type React from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

/**
 * Chart palette. The categorical slots are the validated default set (fixed order, never cycled);
 * `BRAND` is the one series colour used for money/revenue so it always reads as "revenue".
 * Colour follows the entity (order type, payment method, ...), never its rank.
 */
export const BRAND = "#ED2320";
export const CATEGORICAL = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#4a3aa7", "#e34948"] as const;
/** One-hue red ramp for part-to-whole slices — alternating dark/light so neighbours always separate; the legend carries identity. */
const RED_RAMP = ["#ED2320", "#7F1210", "#F58A87", "#B3201C", "#FAC4C2", "#D4413D"] as const;
const INK = "#0b0b0b";
const INK_2 = "#52514e";
const MUTED = "#898781";
const GRID = "#e1e0d9";
const AXIS = "#c3c2b7";
const DEEMPHASIS = "#d9d8d3";

export const TYPE_META: Record<string, { label: string; color: string }> = {
  ONLINE_DELIVERY: { label: "Online Delivery", color: RED_RAMP[0] },
  ONLINE_PICKUP: { label: "Online Pickup", color: RED_RAMP[1] },
  DINE_IN: { label: "Dine-in", color: RED_RAMP[2] },
  WALK_IN: { label: "Walk-in", color: RED_RAMP[3] },
  TAKEAWAY: { label: "Takeaway", color: RED_RAMP[4] },
  DELIVERY: { label: "POS Delivery", color: RED_RAMP[5] },
};

export const PAYMENT_META: Record<string, { label: string; color: string }> = {
  COD: { label: "Cash on Delivery", color: RED_RAMP[0] },
  ONLINE: { label: "Online Payment", color: RED_RAMP[1] },
  CASH: { label: "Cash", color: RED_RAMP[2] },
  CARD: { label: "Card", color: RED_RAMP[3] },
  QR: { label: "QR", color: RED_RAMP[4] },
};

export const STATUS_LABEL: Record<string, string> = {
  PENDING: "Pending",
  CONFIRMED: "Confirmed",
  PREPARING: "Preparing",
  READY: "Ready",
  OUT_FOR_DELIVERY: "Out for Delivery",
  DELIVERED: "Delivered",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
  REFUNDED: "Refunded",
};

/** Paisa -> compact rupee label for axes ("Rs 12k"). */
export function compactMoney(paisa: number): string {
  const n = paisa / 100;
  if (n >= 1_000_000) return `Rs ${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `Rs ${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}k`;
  return `Rs ${Math.round(n)}`;
}

function money(paisa: number): string {
  return `Rs. ${Math.round(paisa / 100).toLocaleString()}`;
}

const axisTick = { fill: MUTED, fontSize: 11 } as const;

type TooltipRow = { label: string; value: string; color?: string };

/** Recharts passes a loose payload type; this is the shape the charts here put in it. */
function ChartTooltip({
  active,
  payload,
  title,
  rows,
}: {
  active?: boolean;
  payload?: ReadonlyArray<{ payload: Record<string, unknown> }>;
  title: (p: Record<string, unknown>) => string;
  rows: (p: Record<string, unknown>) => TooltipRow[];
}) {
  const point = payload?.[0]?.payload;
  if (!active || !point) return null;
  return (
    <div className="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-xs shadow-lg">
      <p className="mb-1 font-semibold text-neutral-900">{title(point)}</p>
      {rows(point).map((r) => (
        <p key={r.label} className="flex items-center justify-between gap-4 text-neutral-600">
          <span className="flex items-center gap-1.5">
            {r.color && <span className="h-2 w-2 rounded-full" style={{ background: r.color }} />}
            {r.label}
          </span>
          <span className="font-semibold tabular-nums text-neutral-900">{r.value}</span>
        </p>
      ))}
    </div>
  );
}

export function ChartCard({
  title,
  subtitle,
  icon,
  className = "",
  children,
}: {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`rounded-xl border border-neutral-200 bg-white p-4 ${className}`}>
      <div className="flex flex-wrap items-baseline gap-x-2">
        {icon}
        <h3 className="text-sm font-semibold text-neutral-800">{title}</h3>
        {subtitle && <span className="text-xs text-neutral-400">{subtitle}</span>}
      </div>
      <div className="mt-3">{children}</div>
    </div>
  );
}

export function EmptyChart({ message = "No orders in this range." }: { message?: string }) {
  return <p className="flex h-40 items-center justify-center text-sm text-neutral-400">{message}</p>;
}

// ---------------------------------------------------------------------------------------------

export type TrendPoint = { key: string; revenue: number; orders: number };

function formatTrendKey(key: string, granularity: "hour" | "day"): string {
  if (granularity === "hour") {
    const h = Number(key);
    return `${h % 12 === 0 ? 12 : h % 12} ${h < 12 ? "AM" : "PM"}`;
  }
  const [y, m, d] = key.split("-").map(Number) as [number, number, number];
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** Revenue over time — one series, so one colour and no legend (the title names it). */
export function RevenueTrendChart({ data, granularity }: { data: TrendPoint[]; granularity: "hour" | "day" }) {
  if (data.every((p) => p.revenue === 0)) return <EmptyChart />;
  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="revFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={BRAND} stopOpacity={0.18} />
              <stop offset="100%" stopColor={BRAND} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis
            dataKey="key"
            tickFormatter={(k: string) => formatTrendKey(k, granularity)}
            tick={axisTick}
            axisLine={{ stroke: AXIS }}
            tickLine={false}
            minTickGap={24}
          />
          <YAxis tickFormatter={compactMoney} tick={axisTick} axisLine={false} tickLine={false} width={56} />
          <Tooltip
            cursor={{ stroke: AXIS, strokeWidth: 1 }}
            content={
              <ChartTooltip
                title={(p) => formatTrendKey(String(p.key), granularity)}
                rows={(p) => [
                  { label: "Revenue", value: money(Number(p.revenue)), color: BRAND },
                  { label: "Orders", value: String(p.orders) },
                ]}
              />
            }
          />
          <Area
            type="monotone"
            dataKey="revenue"
            stroke={BRAND}
            strokeWidth={2}
            fill="url(#revFill)"
            dot={false}
            activeDot={{ r: 5, fill: BRAND, stroke: "#ffffff", strokeWidth: 2 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Orders over time as thin columns with rounded tops. */
export function OrdersTrendChart({ data, granularity }: { data: TrendPoint[]; granularity: "hour" | "day" }) {
  if (data.every((p) => p.orders === 0)) return <EmptyChart />;
  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis
            dataKey="key"
            tickFormatter={(k: string) => formatTrendKey(k, granularity)}
            tick={axisTick}
            axisLine={{ stroke: AXIS }}
            tickLine={false}
            minTickGap={24}
          />
          <YAxis allowDecimals={false} tick={axisTick} axisLine={false} tickLine={false} width={32} />
          <Tooltip
            cursor={{ fill: "rgba(11,11,11,0.04)" }}
            content={
              <ChartTooltip
                title={(p) => formatTrendKey(String(p.key), granularity)}
                rows={(p) => [{ label: "Orders", value: String(p.orders), color: BRAND }]}
              />
            }
          />
          <Bar dataKey="orders" fill={BRAND} radius={[4, 4, 0, 0]} maxBarSize={18} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------

export type Slice = { key: string; label: string; value: number; color: string };

/**
 * Part-to-whole donut, <= 6 slices. The legend doubles as the data table (label, count, share), so
 * identity never relies on colour alone.
 */
export function DonutChart({ slices, centerLabel, formatValue }: { slices: Slice[]; centerLabel: string; formatValue?: (v: number) => string }) {
  const total = slices.reduce((s, x) => s + x.value, 0);
  if (total === 0) return <EmptyChart />;
  const fmt = formatValue ?? ((v: number) => String(v));
  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row">
      <div className="relative h-40 w-40 shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={slices}
              dataKey="value"
              nameKey="label"
              innerRadius={50}
              outerRadius={74}
              paddingAngle={slices.length > 1 ? 2 : 0}
              stroke="#ffffff"
              strokeWidth={2}
              startAngle={90}
              endAngle={-270}
            >
              {slices.map((s) => (
                <Cell key={s.key} fill={s.color} />
              ))}
            </Pie>
            <Tooltip
              content={
                <ChartTooltip
                  title={(p) => String(p.label)}
                  rows={(p) => [
                    { label: "Orders", value: fmt(Number(p.value)), color: String(p.color) },
                    { label: "Share", value: `${Math.round((Number(p.value) / total) * 100)}%` },
                  ]}
                />
              }
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xl font-semibold text-neutral-900">{fmt(total)}</span>
          <span className="text-[11px] text-neutral-400">{centerLabel}</span>
        </div>
      </div>
      <ul className="w-full min-w-0 space-y-1.5 text-sm">
        {slices.map((s) => (
          <li key={s.key} className="flex items-center justify-between gap-3">
            <span className="flex min-w-0 items-center gap-2 text-neutral-600">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: s.color }} />
              <span className="truncate">{s.label}</span>
            </span>
            <span className="shrink-0 tabular-nums text-neutral-900">
              <span className="font-semibold">{fmt(s.value)}</span>
              <span className="ml-1.5 text-xs text-neutral-400">{Math.round((s.value / total) * 100)}%</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------

export type BarRow = { key: string; label: string; value: number; color?: string; extra?: string };

/** Horizontal ranked bars with a direct value label on each bar (<= ~10 rows). */
export function HorizontalBars({
  rows,
  color = BRAND,
  formatValue,
  valueLabel,
}: {
  rows: BarRow[];
  color?: string;
  formatValue?: (v: number) => string;
  valueLabel: string;
}) {
  if (rows.length === 0 || rows.every((r) => r.value === 0)) return <EmptyChart />;
  const fmt = formatValue ?? ((v: number) => String(v));
  const height = Math.max(120, rows.length * 34 + 16);
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} layout="vertical" margin={{ top: 0, right: 56, left: 0, bottom: 0 }} barCategoryGap={8}>
          <XAxis type="number" hide />
          <YAxis
            type="category"
            dataKey="label"
            width={120}
            tick={{ fill: INK_2, fontSize: 12 }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v: string) => (v.length > 17 ? `${v.slice(0, 16)}…` : v)}
          />
          <Tooltip
            cursor={{ fill: "rgba(11,11,11,0.04)" }}
            content={
              <ChartTooltip
                title={(p) => String(p.label)}
                rows={(p) => [
                  { label: valueLabel, value: fmt(Number(p.value)), color: String(p.color ?? color) },
                  ...(p.extra ? [{ label: "", value: String(p.extra) }] : []),
                ]}
              />
            }
          />
          <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={16}>
            {rows.map((r) => (
              <Cell key={r.key} fill={r.color ?? color} />
            ))}
            <LabelList dataKey="value" position="right" formatter={(v: number) => fmt(v)} style={{ fill: INK, fontSize: 12, fontWeight: 600 }} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Bars are red; cancelled/refunded drop to neutral ink so the unsuccessful outcomes read apart from the rest. */
export const STATUS_BAR_COLOR = (status: string) => (status === "CANCELLED" || status === "REFUNDED" ? INK_2 : BRAND);

// ---------------------------------------------------------------------------------------------

/** Orders by hour of day — emphasis form: the peak hour in the accent, the rest recede. */
export function PeakHoursChart({ data }: { data: { hour: number; orders: number }[] }) {
  const peak = Math.max(...data.map((d) => d.orders));
  if (peak === 0) return <EmptyChart />;
  const peakHour = data.find((d) => d.orders === peak)!.hour;
  const hourLabel = (h: number) => `${h % 12 === 0 ? 12 : h % 12}${h < 12 ? "a" : "p"}`;
  return (
    <div>
      <p className="text-xs text-neutral-500">
        Busiest hour: <span className="font-semibold text-neutral-900">{hourLabel(peakHour)}</span> ({peak} orders)
      </p>
      <div className="mt-2 h-52">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis dataKey="hour" tickFormatter={hourLabel} tick={axisTick} axisLine={{ stroke: AXIS }} tickLine={false} interval={2} />
            <YAxis allowDecimals={false} tick={axisTick} axisLine={false} tickLine={false} width={32} />
            <Tooltip
              cursor={{ fill: "rgba(11,11,11,0.04)" }}
              content={
                <ChartTooltip
                  title={(p) => `${hourLabel(Number(p.hour))} – ${hourLabel((Number(p.hour) + 1) % 24)}`}
                  rows={(p) => [{ label: "Orders", value: String(p.orders), color: Number(p.hour) === peakHour ? BRAND : MUTED }]}
                />
              }
            />
            <Bar dataKey="orders" radius={[4, 4, 0, 0]} maxBarSize={16}>
              {data.map((d) => (
                <Cell key={d.hour} fill={d.hour === peakHour ? BRAND : DEEMPHASIS} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
