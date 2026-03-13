'use client';

import { useId } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { formatNumber } from '@/lib/format';

type MetricChartProps = {
  title: string;
  subtitle: string;
  data: Array<Record<string, number | string>>;
  primaryKey: string;
  primaryLabel: string;
  primaryColor: string;
  secondaryKey?: string;
  secondaryLabel?: string;
  secondaryColor?: string;
  mode?: 'area' | 'line';
};

function formatTick(value: number): string {
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}M`;
  }

  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(1)}K`;
  }

  return formatNumber(value);
}

export function MetricChart({
  title,
  subtitle,
  data,
  primaryKey,
  primaryLabel,
  primaryColor,
  secondaryKey,
  secondaryLabel,
  secondaryColor,
  mode = 'area',
}: MetricChartProps) {
  const chartId = useId().replace(/:/g, '');
  const Chart = mode === 'line' ? LineChart : AreaChart;
  const resolvedPrimaryColor = primaryColor;
  const resolvedSecondaryColor = secondaryColor ?? 'var(--chart-3)';

  if (data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{subtitle}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex h-[260px] items-center justify-center rounded-[calc(var(--radius)-0.25rem)] border border-dashed border-border/70 bg-muted/25 text-sm text-muted-foreground">
            No telemetry has been captured for this window yet.
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{subtitle}</CardDescription>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={260}>
          <Chart data={data}>
            <defs>
              <linearGradient id={`${chartId}-${primaryKey}`} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor={resolvedPrimaryColor} stopOpacity={0.35} />
                <stop offset="100%" stopColor={resolvedPrimaryColor} stopOpacity={0.04} />
              </linearGradient>
              {secondaryKey ? (
                <linearGradient id={`${chartId}-${secondaryKey}`} x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor={resolvedSecondaryColor} stopOpacity={0.28} />
                  <stop offset="100%" stopColor={resolvedSecondaryColor} stopOpacity={0.03} />
                </linearGradient>
              ) : null}
            </defs>
            <CartesianGrid stroke="hsl(220 18% 82% / 0.55)" vertical={false} />
            <XAxis
              dataKey="bucketStart"
              minTickGap={16}
              tick={{ fill: 'hsl(222 12% 39%)', fontSize: 12 }}
              tickFormatter={(value: string) =>
                new Intl.DateTimeFormat('en-US', { hour: 'numeric' }).format(new Date(value))
              }
              stroke="hsl(220 18% 82% / 0.6)"
            />
            <YAxis
              tick={{ fill: 'hsl(222 12% 39%)', fontSize: 12 }}
              tickFormatter={formatTick}
              stroke="hsl(220 18% 82% / 0.6)"
              width={64}
            />
            <Tooltip
              contentStyle={{
                background: 'hsla(0 0% 100% / 0.96)',
                border: '1px solid hsl(220 18% 82% / 0.8)',
                borderRadius: '16px',
                color: 'hsl(223 20% 18%)',
                boxShadow: '0 18px 50px -28px rgba(18, 23, 31, 0.35)',
              }}
              labelFormatter={(value: string) =>
                new Intl.DateTimeFormat('en-US', {
                  month: 'short',
                  day: 'numeric',
                  hour: 'numeric',
                }).format(new Date(value))
              }
            />
            <Legend wrapperStyle={{ color: 'hsl(222 12% 39%)', fontSize: 12 }} />
            {mode === 'line' ? (
              <>
                <Line
                  type="monotone"
                  dataKey={primaryKey}
                  name={primaryLabel}
                  stroke={resolvedPrimaryColor}
                  strokeWidth={2.5}
                  dot={false}
                />
                {secondaryKey && secondaryLabel ? (
                  <Line
                    type="monotone"
                    dataKey={secondaryKey}
                    name={secondaryLabel}
                    stroke={resolvedSecondaryColor}
                    strokeWidth={2}
                    dot={false}
                  />
                ) : null}
              </>
            ) : (
              <>
                <Area
                  type="monotone"
                  dataKey={primaryKey}
                  name={primaryLabel}
                  stroke={resolvedPrimaryColor}
                  fill={`url(#${chartId}-${primaryKey})`}
                  strokeWidth={2.5}
                />
                {secondaryKey && secondaryLabel ? (
                  <Area
                    type="monotone"
                    dataKey={secondaryKey}
                    name={secondaryLabel}
                    stroke={resolvedSecondaryColor}
                    fill={`url(#${chartId}-${secondaryKey})`}
                    strokeWidth={2}
                  />
                ) : null}
              </>
            )}
          </Chart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
