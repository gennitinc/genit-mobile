import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTabBarSpace } from '@/components/glass-tab-bar';
import { PullRefresh } from '@/components/pull-refresh';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { OptionsDrawer } from '@/components/drawer';
import { Empty, IconButton, LoadError, Loading, Page, SearchField, Segmented } from '@/components/kit';
import { Icon } from '@/components/icon';
import {
  type CalendarEvent,
  createEvent,
  dayKey,
  deleteEvent,
  eventEnd,
  eventStart,
  fetchCalendars,
  fetchEvents,
  isAllDay,
  occursOn,
  updateEvent,
} from '@/features/calendar/calendar-api';
import { EventDrawer, type EventDrawerState } from '@/features/calendar/event-drawer';
import { IntegrationDrawer } from '@/features/integrations/integration-drawer';
import { CATALOG, useIntegrations } from '@/features/integrations/integrations-api';
import { addDays, startOfDay, timeOnly } from '@/lib/format';
import { radius, space, useColors } from '@/lib/theme';

type CalendarView = 'month' | 'week' | 'day';

const GOOGLE_CALENDAR = CATALOG.find((item) => item.platform === 'google_calendar')!;
const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function rangeFor(view: CalendarView, anchor: Date) {
  if (view === 'day') {
    const start = startOfDay(anchor);
    return { start, end: addDays(start, 1) };
  }
  if (view === 'week') {
    const start = startOfDay(addDays(anchor, -anchor.getDay()));
    return { start, end: addDays(start, 7) };
  }
  // Month view shows whole weeks, so fetch the leading and trailing days too.
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const start = addDays(first, -first.getDay());
  const last = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
  const end = addDays(last, 7 - last.getDay());
  return { start, end };
}

function step(view: CalendarView, anchor: Date, direction: 1 | -1) {
  if (view === 'day') return addDays(anchor, direction);
  if (view === 'week') return addDays(anchor, 7 * direction);
  return new Date(anchor.getFullYear(), anchor.getMonth() + direction, 1);
}

function title(view: CalendarView, anchor: Date) {
  if (view === 'day') return anchor.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  if (view === 'week') {
    const { start, end } = rangeFor('week', anchor);
    return `${start.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${addDays(end, -1).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
  }
  return anchor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

export default function CalendarScreen() {
  const colors = useColors();
  const tabBarSpace = useTabBarSpace();
  const queryClient = useQueryClient();
  const integrations = useIntegrations();
  const account = integrations.activeFor('google_calendar')[0];
  const [connectOpen, setConnectOpen] = useState(false);

  const [view, setView] = useState<CalendarView>('month');
  const [anchor, setAnchor] = useState(() => new Date());
  const [selectedDay, setSelectedDay] = useState(() => startOfDay(new Date()));
  const [calendarId, setCalendarId] = useState('primary');
  const [calendarPicker, setCalendarPicker] = useState(false);
  const [search, setSearch] = useState('');
  const [drawer, setDrawer] = useState<EventDrawerState | null>(null);

  const range = useMemo(() => rangeFor(view, anchor), [view, anchor]);

  const accountId = account?._id ?? '';

  const calendars = useQuery({
    queryKey: ['calendar', account?._id, 'calendars'],
    queryFn: () => fetchCalendars(accountId),
    enabled: !!account,
  });

  const eventsKey = ['calendar', account?._id, 'events', calendarId, range.start.toISOString(), range.end.toISOString(), search.trim()];
  const events = useQuery({
    queryKey: eventsKey,
    queryFn: () =>
      fetchEvents(accountId, {
        calendarId,
        q: search.trim() || undefined,
        timeMin: range.start.toISOString(),
        timeMax: range.end.toISOString(),
      }),
    enabled: !!account,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['calendar', account?._id, 'events'] });

  const save = useMutation({
    mutationFn: ({ input, event }: { input: Parameters<typeof createEvent>[1]; event?: CalendarEvent }) =>
      event ? updateEvent(accountId, event.id, input) : createEvent(accountId, input),
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: (event: CalendarEvent) => deleteEvent(accountId, event.id, calendarId),
    onSuccess: invalidate,
  });

  const list = (events.data ?? []).filter((event) => event.status !== 'cancelled');
  const sorted = [...list].sort((a, b) => eventStart(a).getTime() - eventStart(b).getTime());

  if (integrations.isLoading) return <Page title='Calendar'><Loading /></Page>;

  if (!account) {
    return (
      <Page title='Calendar'>
        <Empty
          icon='calendar-outline'
          title='Connect Google Calendar'
          message='See and manage your brand events here.'
          action={{ label: 'Connect Google Calendar', onPress: () => setConnectOpen(true) }}
        />
        <IntegrationDrawer item={connectOpen ? GOOGLE_CALENDAR : null} onClose={() => setConnectOpen(false)} />
      </Page>
    );
  }

  const calendarName = calendars.data?.find((c) => c.id === calendarId)?.summary ?? 'Primary';
  const dayEvents = (day: Date) => sorted.filter((event) => occursOn(event, day));

  return (
    <Page
      title='Calendar'
      subtitle={`${list.length} event${list.length === 1 ? '' : 's'} in view`}
      actions={<IconButton icon='add' label='New event' onPress={() => setDrawer({ mode: 'create', day: view === 'month' ? selectedDay : undefined })} />}
    >
      <ScrollView showsVerticalScrollIndicator={false} showsHorizontalScrollIndicator={false}
        refreshControl={<PullRefresh onRefresh={() => events.refetch()} />}
        contentContainerStyle={{ paddingHorizontal: space.page, paddingBottom: tabBarSpace, gap: space.md }}
        keyboardShouldPersistTaps='handled'
      >
        <Segmented<CalendarView>
          value={view}
          onChange={setView}
          options={[
            { value: 'month', label: 'Month' },
            { value: 'week', label: 'Week' },
            { value: 'day', label: 'Day' },
          ]}
        />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
          <View style={{ flex: 1 }}>
            <SearchField value={search} onChange={setSearch} placeholder='Search events' />
          </View>
          {(calendars.data?.length ?? 0) > 1 ? (
            <Pressable
              accessibilityRole='button'
              accessibilityLabel={`Calendar: ${calendarName}`}
              onPress={() => setCalendarPicker(true)}
              style={({ pressed }) => ({
                width: 52,
                height: 52,
                alignItems: 'center',
                justifyContent: 'center',
                borderWidth: 1,
                borderRadius: radius.md,
                borderColor: colors.border,
                backgroundColor: pressed ? colors.surfacePressed : colors.background,
              })}
            >
              <Icon name='calendar-outline' size={20} color={colors.text} />
            </Pressable>
          ) : null}
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
          <IconButton icon='chevron-back' label='Previous' onPress={() => setAnchor(step(view, anchor, -1))} />
          <Text style={{ flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '600', color: colors.text }}>{title(view, anchor)}</Text>
          <IconButton icon='chevron-forward' label='Next' onPress={() => setAnchor(step(view, anchor, 1))} />
        </View>
        <Pressable accessibilityRole='button' onPress={() => (setAnchor(new Date()), setSelectedDay(startOfDay(new Date())))} style={{ alignSelf: 'center' }}>
          <Text style={{ fontSize: 14, fontWeight: '600', color: colors.primary }}>Today</Text>
        </Pressable>

        {events.isError ? <LoadError error={events.error} onRetry={events.refetch} /> : null}
        {events.isLoading ? <Loading /> : null}

        {view === 'month' ? (
          <>
            <MonthGrid
              anchor={anchor}
              start={range.start}
              selected={selectedDay}
              countFor={(day) => dayEvents(day).length}
              onSelect={setSelectedDay}
              onOpenDay={(day) => (setAnchor(day), setSelectedDay(day), setView('day'))}
            />
            <DayAgenda day={selectedDay} events={dayEvents(selectedDay)} onOpen={(event) => setDrawer({ mode: 'view', event })} />
          </>
        ) : view === 'week' ? (
          Array.from({ length: 7 }, (_, index) => addDays(range.start, index)).map((day) => (
            <DayAgenda key={dayKey(day)} day={day} events={dayEvents(day)} onOpen={(event) => setDrawer({ mode: 'view', event })} compact />
          ))
        ) : (
          <DayAgenda day={startOfDay(anchor)} events={dayEvents(anchor)} onOpen={(event) => setDrawer({ mode: 'view', event })} />
        )}
      </ScrollView>

      <OptionsDrawer
        visible={calendarPicker}
        onClose={() => setCalendarPicker(false)}
        title='Calendar'
        value={calendarId}
        options={(calendars.data ?? []).map((calendar) => ({ value: calendar.id, label: calendar.primary ? `${calendar.summary} (primary)` : calendar.summary }))}
        onSelect={setCalendarId}
      />

      <EventDrawer
        state={drawer}
        calendars={calendars.data ?? []}
        calendarId={calendarId}
        onClose={() => setDrawer(null)}
        onChangeMode={setDrawer}
        onSave={(input, event) => save.mutateAsync({ input, event })}
        onDelete={(event) => remove.mutateAsync(event)}
      />
    </Page>
  );
}

function MonthGrid({
  anchor,
  start,
  selected,
  countFor,
  onSelect,
  onOpenDay,
}: {
  anchor: Date;
  start: Date;
  selected: Date;
  countFor: (day: Date) => number;
  onSelect: (day: Date) => void;
  onOpenDay: (day: Date) => void;
}) {
  const colors = useColors();
  const today = dayKey(new Date());
  const days = Array.from({ length: 42 }, (_, index) => addDays(start, index)).filter(
    (day, index) => index < 35 || day.getMonth() === anchor.getMonth()
  );
  return (
    <View>
      <View style={{ flexDirection: 'row' }}>
        {WEEKDAYS.map((label, index) => (
          <Text key={index} style={{ flex: 1, textAlign: 'center', fontSize: 12, color: colors.textFaint }}>
            {label}
          </Text>
        ))}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {days.map((day) => {
          const key = dayKey(day);
          const isSelected = key === dayKey(selected);
          const count = countFor(day);
          const outside = day.getMonth() !== anchor.getMonth();
          return (
            <Pressable
              key={key}
              accessibilityRole='button'
              accessibilityLabel={`${day.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}, ${count} event${count === 1 ? '' : 's'}`}
              accessibilityState={{ selected: isSelected }}
              onPress={() => onSelect(day)}
              onLongPress={() => onOpenDay(day)}
              style={{ width: `${100 / 7}%`, height: 48, alignItems: 'center', justifyContent: 'center', gap: 3 }}
            >
              <View
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 16,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: isSelected ? colors.primary : 'transparent',
                  borderWidth: key === today && !isSelected ? 1 : 0,
                  borderColor: colors.primary,
                }}
              >
                <Text style={{ fontSize: 15, color: isSelected ? colors.onPrimary : outside ? colors.textFaint : colors.text }}>{day.getDate()}</Text>
              </View>
              <View style={{ height: 5, flexDirection: 'row', gap: 2 }}>
                {Array.from({ length: Math.min(count, 3) }, (_, index) => (
                  <View key={index} style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: colors.primary }} />
                ))}
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function DayAgenda({ day, events, onOpen, compact }: { day: Date; events: CalendarEvent[]; onOpen: (event: CalendarEvent) => void; compact?: boolean }) {
  const colors = useColors();
  const isToday = dayKey(day) === dayKey(new Date());
  return (
    <View style={{ gap: space.sm }}>
      <Text style={{ fontSize: 13, fontWeight: '600', color: isToday ? colors.primary : colors.textMuted }}>
        {day.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}
      </Text>
      {events.length === 0 ? (
        compact ? null : <Text style={{ fontSize: 14, color: colors.textFaint }}>No events</Text>
      ) : (
        events.map((event) => (
          <Pressable
            key={`${event.id}-${dayKey(day)}`}
            accessibilityRole='button'
            onPress={() => onOpen(event)}
            style={({ pressed }) => ({
              flexDirection: 'row',
              gap: space.md,
              padding: space.md,
              borderRadius: radius.md,
              borderLeftWidth: 3,
              borderLeftColor: colors.primary,
              backgroundColor: pressed ? colors.surfacePressed : colors.surface,
            })}
          >
            <Text style={{ width: 64, fontSize: 13, color: colors.textMuted }}>
              {isAllDay(event) ? 'All day' : `${timeOnly(eventStart(event))}\n${timeOnly(eventEnd(event))}`}
            </Text>
            <View style={{ flex: 1, gap: 2 }}>
              <Text numberOfLines={2} style={{ fontSize: 15, fontWeight: '600', color: colors.text }}>
                {event.summary || '(No title)'}
              </Text>
              {event.location ? (
                <Text numberOfLines={1} style={{ fontSize: 13, color: colors.textMuted }}>
                  {event.location}
                </Text>
              ) : null}
            </View>
          </Pressable>
        ))
      )}
    </View>
  );
}
