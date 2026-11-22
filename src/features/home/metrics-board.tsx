import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { LineChart, Sparkline } from '@/components/charts';
import { Icon } from '@/components/icon';
import { LoadError } from '@/components/kit';
import type { PostStats } from '@/features/posts/posts-api';
import { compactNumber, shortDate } from '@/lib/format';
import { radius, space, useColors } from '@/lib/theme';

export type RangePreset = 7 | 30 | 90 | 'custom';

type MetricKey = 'drafted' | 'published' | 'projects' | 'engagement';

const METRICS: { key: MetricKey; label: string }[] = [
  { key: 'projects', label: 'Projects' },
  { key: 'published', label: 'Published' },
  { key: 'engagement', label: 'Engagement' },
  { key: 'drafted', label: 'Drafted' },
];

/** Tabular figures keep numbers from shifting as they change. */
const TABULAR = { fontVariant: ['tabular-nums' as const] };

/**
 * Change over the most recent half of the range against the half before it,
 * from the daily series. Shown only when each half has at least a week.
 */
function trend(values: number[]) {
  const half = Math.floor(values.length / 2);
  if (half < 7) return null;
  const sum = (list: number[]) => list.reduce((total, value) => total + value, 0);
  const recent = sum(values.slice(-half));
  const before = sum(values.slice(-2 * half, -half));
  if (before === 0) return recent === 0 ? { change: 0, days: half } : null;
  return { change: (recent - before) / before, days: half };
}

/** The date range as a segmented control. */
export function RangeControl({
  preset,
  onPreset,
  customLabel,
  onCustom,
}: {
  preset: RangePreset;
  onPreset: (days: 7 | 30 | 90) => void;
  customLabel: string;
  onCustom: () => void;
}) {
  const colors = useColors();
  const options: { key: RangePreset; label: string }[] = [
    { key: 7, label: '7D' },
    { key: 30, label: '30D' },
    { key: 90, label: '90D' },
    { key: 'custom', label: preset === 'custom' ? customLabel : 'Custom' },
  ];
  return (
    <View accessibilityRole='tablist' style={{ flexDirection: 'row', padding: 3, borderRadius: radius.sm + 2, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}>
      {options.map((option) => {
        const active = preset === option.key;
        return (
          <Pressable
            key={String(option.key)}
            accessibilityRole='tab'
            accessibilityState={{ selected: active }}
            accessibilityLabel={option.key === 'custom' ? `Custom range${preset === 'custom' ? `, ${customLabel}` : ''}` : `Last ${option.key} days`}
            onPress={() => (option.key === 'custom' ? onCustom() : onPreset(option.key))}
            style={{
              flexGrow: option.key === 'custom' ? 1.6 : 1,
              flexBasis: 0,
              flexDirection: 'row',
              gap: 5,
              alignItems: 'center',
              justifyContent: 'center',
              height: 32,
              borderRadius: radius.sm,
              backgroundColor: active ? colors.background : 'transparent',
              borderWidth: active ? 1 : 0,
              borderColor: colors.border,
            }}
          >
            {option.key === 'custom' ? <Icon name='calendar-outline' size={13} color={active ? colors.text : colors.textMuted} /> : null}
            <Text numberOfLines={1} style={{ fontSize: 13, fontWeight: active ? '600' : '500', color: active ? colors.text : colors.textMuted }}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function Delta({ values }: { values: number[] }) {
  const colors = useColors();
  const result = trend(values);
  if (!result) return <Text style={{ fontSize: 12, color: colors.textFaint }}> </Text>;
  const percent = Math.round(result.change * 100);
  return (
    <View
      accessible
      accessibilityLabel={`${percent === 0 ? 'No change' : `${percent > 0 ? 'Up' : 'Down'} ${Math.abs(percent)} percent`} versus the previous ${result.days} days`}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}
    >
      {percent !== 0 ? <Icon name='arrow-up' size={11} color={colors.text} style={percent < 0 ? { transform: [{ rotate: '180deg' }] } : undefined} /> : null}
      <Text style={[{ fontSize: 12, fontWeight: '600', color: colors.text }, TABULAR]}>{Math.abs(percent)}%</Text>
      <Text numberOfLines={1} style={{ fontSize: 12, color: colors.textFaint }}>
        vs prior {result.days}d
      </Text>
    </View>
  );
}

function Kpi({ label, value, values, caption, last, right }: { label: string; value?: number; values?: number[]; caption?: string; last?: boolean; right?: boolean }) {
  const colors = useColors();
  return (
    <View
      style={{
        width: '50%',
        padding: space.lg,
        gap: 6,
        borderColor: colors.border,
        borderRightWidth: right ? 0 : 1,
        borderBottomWidth: last ? 0 : 1,
      }}
    >
      <Text style={{ fontSize: 12.5, fontWeight: '500', color: colors.textMuted }}>{label}</Text>
      <Text style={[{ fontSize: 28, fontWeight: '600', letterSpacing: -0.8, color: colors.text }, TABULAR]}>{value === undefined ? '—' : compactNumber(value)}</Text>
      {values ? <Delta values={values} /> : <Text style={{ fontSize: 12, color: colors.textFaint }}>{caption ?? ' '}</Text>}
      {/* A flat line at zero says nothing, so only the chart is hidden; the card keeps its size. */}
      {values && values.length > 1 && values.some((point) => point !== 0) ? (
        <View style={{ marginTop: 4 }}>
          <Sparkline values={values} color={colors.textMuted} height={26} />
        </View>
      ) : (
        <View style={{ height: 30 }} />
      )}
    </View>
  );
}

/**
 * The home dashboard: four headline numbers in one ruled panel, and the
 * activity chart for one metric at a time. Neutral tones throughout; the
 * brand color is used only for the chart line.
 */
export function MetricsBoard({ stats, error, onRetry, channels }: { stats?: PostStats; error?: unknown; onRetry: () => void; channels: number }) {
  const colors = useColors();
  const [metric, setMetric] = useState<MetricKey>('projects');
  const activity = stats?.activity ?? [];
  const series = (key: MetricKey) => activity.map((day) => day[key]);
  const selected = METRICS.find((item) => item.key === metric)!;
  const total = series(metric).reduce((sum, value) => sum + value, 0);
  const panel = { borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, backgroundColor: colors.background, overflow: 'hidden' as const };

  if (error) return <LoadError error={error} onRetry={onRetry} />;

  return (
    <View style={{ gap: space.md }}>
      <View style={[panel, { flexDirection: 'row', flexWrap: 'wrap' }]}>
        <Kpi label='Posts drafted' value={stats?.drafted} values={series('drafted')} />
        <Kpi label='Active projects' value={stats?.activeProjects} values={series('projects')} right />
        <Kpi label='Engagement' value={stats?.engagement} values={series('engagement')} last />
        <Kpi label='Channels' value={channels} caption='Ready to publish' last right />
      </View>

      {activity.length > 1 ? (
        <View style={[panel, { padding: space.lg, gap: space.lg }]}>
          <View style={{ gap: 4 }}>
            <Text style={{ fontSize: 12.5, fontWeight: '500', color: colors.textMuted }}>Activity</Text>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: space.sm }}>
              <Text style={[{ fontSize: 28, fontWeight: '600', letterSpacing: -0.8, color: colors.text }, TABULAR]}>{compactNumber(total)}</Text>
              <Text style={{ fontSize: 13, color: colors.textMuted }}>
                {selected.label.toLowerCase()} · {shortDate(activity[0].date)} – {shortDate(activity[activity.length - 1].date)}
              </Text>
            </View>
          </View>

          <View accessibilityRole='tablist' style={{ flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border }}>
            {METRICS.map((item) => {
              const active = item.key === metric;
              return (
                <Pressable
                  key={item.key}
                  accessibilityRole='tab'
                  accessibilityState={{ selected: active }}
                  onPress={() => setMetric(item.key)}
                  hitSlop={{ top: 8, bottom: 4 }}
                  style={{ flex: 1, alignItems: 'center', marginBottom: -StyleSheet.hairlineWidth }}
                >
                  {/* The underline is only as wide as the label, not the whole tab. */}
                  <View style={{ paddingBottom: 10, borderBottomWidth: 1, borderColor: active ? colors.text : 'transparent' }}>
                    <Text numberOfLines={1} style={{ fontSize: 13, fontWeight: active ? '600' : '500', color: active ? colors.text : colors.textMuted }}>
                      {item.label}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>

          <LineChart
            legend={false}
            height={190}
            labels={activity.map((day) => shortDate(day.date))}
            series={[{ label: selected.label, color: colors.primary, values: series(metric) }]}
          />
        </View>
      ) : null}
    </View>
  );
}
