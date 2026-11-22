import { useState } from 'react';
import { type LayoutChangeEvent, Text, View } from 'react-native';
import Svg, { Defs, LinearGradient, Path, Stop, Text as SvgText } from 'react-native-svg';

import { space, useColors } from '@/lib/theme';

export function Sparkline({ values: daily, color, height = 28, maxPoints = 12 }: { values: number[]; color?: string; height?: number; maxPoints?: number }) {
  const colors = useColors();
  const [width, setWidth] = useState(0);
  const onLayout = (event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width);
  // Grouped like the activity chart, so a month of daily counts draws as a calm trend line.
  const size = Math.max(1, Math.ceil(daily.length / maxPoints));
  const values = Array.from({ length: Math.ceil(daily.length / size) }, (_, i) => daily.slice(i * size, i * size + size).reduce((sum, value) => sum + value, 0));
  const max = Math.max(...values, 1);
  const points = values.map((value, i) => ({ x: 1 + ((width - 2) * i) / Math.max(1, values.length - 1), y: height - 2 - (value / max) * (height - 4) }));
  return (
    <View onLayout={onLayout} style={{ height }} accessible={false}>
      {width > 0 && values.length > 1 ? (
        <Svg width={width} height={height}>
          <Path d={smoothPath(points)} stroke={color ?? colors.primary} strokeWidth={1.75} strokeLinecap='round' strokeLinejoin='round' fill='none' />
        </Svg>
      ) : null}
    </View>
  );
}

export type ChartSeries = { label: string; color: string; values: number[] };

type Point = { x: number; y: number };

/** A smooth curve through the points that never overshoots them (monotone cubic, Fritsch–Carlson). */
function smoothPath(points: Point[]) {
  if (points.length < 2) return '';
  const n = points.length;
  const dx: number[] = [];
  const slope: number[] = [];
  for (let i = 0; i < n - 1; i += 1) {
    dx.push(points[i + 1].x - points[i].x);
    slope.push((points[i + 1].y - points[i].y) / (dx[i] || 1));
  }
  const tangent = points.map((_, i) => {
    if (i === 0) return slope[0];
    if (i === n - 1) return slope[n - 2];
    return slope[i - 1] * slope[i] <= 0 ? 0 : (slope[i - 1] + slope[i]) / 2;
  });
  for (let i = 0; i < n - 1; i += 1) {
    if (slope[i] === 0) {
      tangent[i] = 0;
      tangent[i + 1] = 0;
      continue;
    }
    const a = tangent[i] / slope[i];
    const b = tangent[i + 1] / slope[i];
    const h = Math.hypot(a, b);
    if (h > 3) {
      tangent[i] = (3 / h) * a * slope[i];
      tangent[i + 1] = (3 / h) * b * slope[i];
    }
  }
  let d = `M${points[0].x.toFixed(1)},${points[0].y.toFixed(1)}`;
  for (let i = 0; i < n - 1; i += 1) {
    const third = dx[i] / 3;
    const c1 = { x: points[i].x + third, y: points[i].y + tangent[i] * third };
    const c2 = { x: points[i + 1].x - third, y: points[i + 1].y - tangent[i + 1] * third };
    d += ` C${c1.x.toFixed(1)},${c1.y.toFixed(1)} ${c2.x.toFixed(1)},${c2.y.toFixed(1)} ${points[i + 1].x.toFixed(1)},${points[i + 1].y.toFixed(1)}`;
  }
  return d;
}

/** A round top for the y axis, so it reads in 4 even steps (0, 35k, 70k…). */
function niceTop(max: number) {
  if (max <= 4) return 4;
  const rough = max / 4;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  // Whole-number steps only, so small counts read 0, 6, 12… rather than 0, 7.5, 15.
  const step =
    [1, 1.5, 2, 2.5, 3, 3.5, 4, 5, 6, 7.5, 8, 10]
      .map((m) => m * magnitude)
      .filter((m) => Number.isInteger(m))
      .find((m) => m >= rough) ?? 10 * magnitude;
  return step * 4;
}

function compact(value: number) {
  if (value >= 1_000_000) return `${+(value / 1_000_000).toFixed(1)}m`;
  if (value >= 1000) return `${+(value / 1000).toFixed(1)}k`;
  return String(Math.round(value));
}

/**
 * Daily activity as smooth lines over soft gradient areas, with the values on
 * the left, dates along the bottom and a colored legend at the top right.
 */
export function LineChart({ series: daily, labels: dailyLabels, height = 200, maxPoints = 12, legend = true }: { series: ChartSeries[]; labels: string[]; height?: number; maxPoints?: number; legend?: boolean }) {
  const colors = useColors();
  const [width, setWidth] = useState(0);
  // Long ranges are summed into at most `maxPoints` periods, so the curves stay smooth and readable.
  const size = Math.max(1, Math.ceil(dailyLabels.length / maxPoints));
  const labels = dailyLabels.filter((_, index) => index % size === 0);
  const series = daily.map((line) => ({
    ...line,
    values: labels.map((_, bucket) => line.values.slice(bucket * size, bucket * size + size).reduce((sum, value) => sum + value, 0)),
  }));
  const top = niceTop(Math.max(0, ...series.flatMap((line) => line.values)));
  const ticks = [0, 1, 2, 3, 4].map((step) => (top / 4) * step);
  const summary = series.map((line) => `${line.label} ${line.values.reduce((a, b) => a + b, 0)}`).join(', ');

  const axisWidth = Math.max(...ticks.map((tick) => compact(tick).length)) * 7 + 8;
  const plotTop = 8;
  const plotBottom = height - 22;
  const plotLeft = axisWidth;
  const plotRight = width - 6;
  const count = Math.max(...series.map((line) => line.values.length), 2);
  const xAt = (index: number) => plotLeft + ((plotRight - plotLeft) * index) / (count - 1);
  const yAt = (value: number) => plotBottom - (value / top) * (plotBottom - plotTop);
  // Up to five evenly spaced dates along the bottom, always the first and the last.
  const labelCount = labels.length <= 5 ? labels.length : ([5, 4, 3].find((k) => (labels.length - 1) % (k - 1) === 0) ?? 5);
  const shownLabels = [...new Set(Array.from({ length: labelCount }, (_, i) => Math.round((i * (labels.length - 1)) / Math.max(1, labelCount - 1))))].map((index) => ({ label: labels[index], index }));

  return (
    <View accessible accessibilityLabel={`Activity chart. Totals: ${summary}`} style={{ gap: space.sm }}>
      {legend ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', columnGap: space.md, rowGap: 4 }}>
          {series.map((line) => (
            <View key={line.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: line.color }} />
              <Text style={{ fontSize: 12.5, color: line.color }}>{line.label}</Text>
            </View>
          ))}
        </View>
      ) : null}
      <View onLayout={(event) => setWidth(event.nativeEvent.layout.width)} style={{ height }}>
        {width > 0 ? (
          <Svg width={width} height={height}>
            <Defs>
              {series.map((line, index) => (
                <LinearGradient key={line.label} id={`area-${index}`} x1='0' y1='0' x2='0' y2='1'>
                  <Stop offset='0' stopColor={line.color} stopOpacity={0.18} />
                  <Stop offset='1' stopColor={line.color} stopOpacity={0} />
                </LinearGradient>
              ))}
            </Defs>
            {ticks.map((tick) => (
              <SvgText key={tick} x={0} y={yAt(tick) + 4} fontSize={11} fill={colors.textFaint}>
                {compact(tick)}
              </SvgText>
            ))}
            {series.map((line, index) => {
              const points = line.values.map((value, i) => ({ x: xAt(i), y: yAt(value) }));
              if (points.length < 2) return null;
              const curve = smoothPath(points);
              const area = `${curve} L${points[points.length - 1].x.toFixed(1)},${plotBottom} L${points[0].x.toFixed(1)},${plotBottom} Z`;
              return <Path key={`a-${line.label}`} d={area} fill={`url(#area-${index})`} />;
            })}
            {series.map((line) => {
              const points = line.values.map((value, i) => ({ x: xAt(i), y: yAt(value) }));
              if (points.length < 2) return null;
              return <Path key={`l-${line.label}`} d={smoothPath(points)} stroke={line.color} strokeWidth={2.5} strokeLinecap='round' strokeLinejoin='round' fill='none' />;
            })}
            {shownLabels.map(({ label, index }, i) => (
              <SvgText
                key={`${label}-${index}`}
                x={xAt(index)}
                y={height - 4}
                fontSize={11}
                fill={colors.textFaint}
                textAnchor={i === 0 ? 'start' : i === shownLabels.length - 1 ? 'end' : 'middle'}
              >
                {label}
              </SvgText>
            ))}
          </Svg>
        ) : null}
      </View>
    </View>
  );
}

/** Horizontal bars, e.g. post metrics or a funnel. */
export function BarList({ items, color }: { items: { label: string; value: number }[]; color?: string }) {
  const colors = useColors();
  const max = Math.max(1, ...items.map((item) => item.value));
  return (
    <View style={{ gap: space.sm }}>
      {items.map((item) => (
        <View key={item.label} style={{ gap: 4 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={{ fontSize: 13, color: colors.textMuted }}>{item.label}</Text>
            <Text style={{ fontSize: 13, fontWeight: '600', color: colors.text }}>{item.value.toLocaleString()}</Text>
          </View>
          <View style={{ height: 8, borderRadius: 4, backgroundColor: colors.surfacePressed, overflow: 'hidden' }}>
            <View style={{ width: `${(item.value / max) * 100}%`, height: '100%', backgroundColor: color ?? colors.primary }} />
          </View>
        </View>
      ))}
    </View>
  );
}
