import { Icon } from '@/components/icon';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { DateField } from '@/components/date-field';
import { ConfirmDrawer, Drawer, OptionsDrawer } from '@/components/drawer';
import { SelectField, Toggle } from '@/components/kit';
import { Banner, Button, Field } from '@/components/ui';
import { errorMessage } from '@/lib/api';
import { space, useColors } from '@/lib/theme';

import {
  type CalendarEvent,
  dayKey,
  eventEnd,
  eventStart,
  type EventInput,
  type GoogleCalendar,
  isAllDay,
} from './calendar-api';

type Values = {
  summary: string;
  description: string;
  location: string;
  start: Date;
  end: Date;
  allDay: boolean;
  guests: string;
  calendarId: string;
};

function initialValues(event: CalendarEvent | null, calendarId: string, day?: Date): Values {
  if (event) {
    return {
      summary: event.summary ?? '',
      description: event.description ?? '',
      location: event.location ?? '',
      start: eventStart(event),
      end: eventEnd(event),
      allDay: isAllDay(event),
      guests: (event.attendees ?? []).map((attendee) => attendee.email).join(', '),
      calendarId,
    };
  }
  const start = day ? new Date(day) : new Date();
  if (day) start.setHours(new Date().getHours() + 1, 0, 0, 0);
  else start.setMinutes(Math.ceil(start.getMinutes() / 30) * 30, 0, 0);
  return {
    summary: '',
    description: '',
    location: '',
    start,
    end: new Date(start.getTime() + 60 * 60_000),
    allDay: false,
    guests: '',
    calendarId,
  };
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function toInput(values: Values): EventInput {
  const guests = values.guests
    .split(',')
    .map((email) => email.trim())
    .filter(Boolean)
    .map((email) => ({ email }));
  // Google's all-day end date is exclusive, so a one-day event ends the next day.
  const endExclusive = new Date(values.end);
  endExclusive.setDate(endExclusive.getDate() + 1);
  return {
    calendarId: values.calendarId,
    summary: values.summary.trim(),
    description: values.description.trim() || undefined,
    location: values.location.trim() || undefined,
    start: values.allDay ? { date: dayKey(values.start) } : { dateTime: values.start.toISOString() },
    end: values.allDay ? { date: dayKey(endExclusive) } : { dateTime: values.end.toISOString() },
    attendees: guests.length ? guests : undefined,
    sendUpdates: 'all',
  };
}

export type EventDrawerState =
  | { mode: 'view'; event: CalendarEvent }
  | { mode: 'edit'; event: CalendarEvent }
  | { mode: 'create'; day?: Date };

export function EventDrawer({
  state,
  calendars,
  calendarId,
  onClose,
  onChangeMode,
  onSave,
  onDelete,
}: {
  state: EventDrawerState | null;
  calendars: GoogleCalendar[];
  calendarId: string;
  onClose: () => void;
  onChangeMode: (state: EventDrawerState) => void;
  onSave: (input: EventInput, event?: CalendarEvent) => Promise<unknown>;
  onDelete: (event: CalendarEvent) => Promise<unknown>;
}) {
  const colors = useColors();
  const [values, setValues] = useState<Values>(() => initialValues(null, calendarId));
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [calendarPicker, setCalendarPicker] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Fill the form whenever the drawer opens for a different event or mode.
  const [openedFor, setOpenedFor] = useState<EventDrawerState | null>(null);
  if (state !== openedFor) {
    setOpenedFor(state);
    if (state && state.mode !== 'view') {
      setError('');
      setValues(initialValues(state.mode === 'edit' ? state.event : null, calendarId, state.mode === 'create' ? state.day : undefined));
    }
  }

  const set = (patch: Partial<Values>) => setValues((current) => ({ ...current, ...patch }));
  const writable = calendars.filter((calendar) => calendar.accessRole === 'owner' || calendar.accessRole === 'writer');

  const save = async () => {
    const badGuest = values.guests
      .split(',')
      .map((email) => email.trim())
      .find((email) => email && !EMAIL.test(email));
    if (!values.summary.trim()) return setError('Give the event a title.');
    if (values.end < values.start) return setError('The event ends before it starts.');
    if (badGuest) return setError(`"${badGuest}" isn't a valid email address.`);
    setSaving(true);
    setError('');
    try {
      await onSave(toInput(values), state?.mode === 'edit' ? state.event : undefined);
      onClose();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setSaving(false);
    }
  };

  if (state?.mode === 'view') {
    const { event } = state;
    const allDay = isAllDay(event);
    const format: Intl.DateTimeFormatOptions = allDay
      ? { weekday: 'short', month: 'short', day: 'numeric' }
      : { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' };
    return (
      <>
        <Drawer
          visible
          onClose={onClose}
          title={event.summary || '(No title)'}
          footer={
            <View style={{ flexDirection: 'row', gap: space.sm }}>
              <Button title='Edit event' variant='secondary' flex onPress={() => onChangeMode({ mode: 'edit', event })} />
              <Button title='Delete' variant='danger' flex onPress={() => setConfirmDelete(true)} />
            </View>
          }
        >
          <InfoLine icon='time-outline' text={`${eventStart(event).toLocaleString(undefined, format)} – ${eventEnd(event).toLocaleString(undefined, format)}${allDay ? ' (all day)' : ''}`} />
          {event.location ? <InfoLine icon='location-outline' text={event.location} /> : null}
          {event.attendees?.length ? (
            <InfoLine
              icon='people-outline'
              text={event.attendees.map((a) => `${a.displayName || a.email}${a.responseStatus && a.responseStatus !== 'needsAction' ? ` (${a.responseStatus})` : ''}`).join('\n')}
            />
          ) : null}
          {event.description ? <Text style={{ fontSize: 15, lineHeight: 22, color: colors.text }}>{event.description}</Text> : null}
          {event.hangoutLink ? <Button title='Join video call' variant='secondary' small onPress={() => WebBrowser.openBrowserAsync(event.hangoutLink!)} /> : null}
          {event.htmlLink ? <Button title='Open in Google Calendar' variant='ghost' small onPress={() => WebBrowser.openBrowserAsync(event.htmlLink!)} /> : null}
        </Drawer>
        <ConfirmDrawer
          visible={confirmDelete}
          onClose={() => setConfirmDelete(false)}
          title='Delete event?'
          message="This deletes the event for everyone and notifies guests. It can't be undone."
          confirmLabel='Delete event'
          destructive
          onConfirm={async () => {
            await onDelete(event);
            onClose();
          }}
        />
      </>
    );
  }

  return (
    <>
      <Drawer
        visible={!!state}
        onClose={onClose}
        title={state?.mode === 'edit' ? 'Edit event' : 'New event'}
        tall
        footer={<Button title={state?.mode === 'edit' ? 'Save changes' : 'Create event'} loading={saving} onPress={save} />}
      >
        <Banner message={error} />
        <Field label='Title' value={values.summary} onChangeText={(summary) => set({ summary })} placeholder='Team sync' />
        <Toggle label='All day' value={values.allDay} onChange={(allDay) => set({ allDay })} />
        <DateField label='Starts' mode={values.allDay ? 'date' : 'datetime'} value={values.start} onChange={(start) => set({ start, end: start > values.end ? new Date(start.getTime() + 60 * 60_000) : values.end })} />
        <DateField label='Ends' mode={values.allDay ? 'date' : 'datetime'} value={values.end} minimumDate={values.start} onChange={(end) => set({ end })} />
        {writable.length > 1 ? (
          <SelectField label='Calendar' value={calendars.find((c) => c.id === values.calendarId)?.summary ?? 'Primary'} onPress={() => setCalendarPicker(true)} />
        ) : null}
        <Field label='Location' value={values.location} onChangeText={(location) => set({ location })} placeholder='Add a place or link' />
        <Field
          label='Guests'
          value={values.guests}
          onChangeText={(guests) => set({ guests })}
          placeholder='Emails, separated by commas'
          autoCapitalize='none'
          keyboardType='email-address'
        />
        <Field label='Notes' value={values.description} onChangeText={(description) => set({ description })} multiline />
      </Drawer>
      <OptionsDrawer
        visible={calendarPicker}
        onClose={() => setCalendarPicker(false)}
        title='Calendar'
        value={values.calendarId}
        options={writable.map((calendar) => ({ value: calendar.id, label: calendar.primary ? `${calendar.summary} (primary)` : calendar.summary }))}
        onSelect={(id) => set({ calendarId: id })}
      />
    </>
  );
}

function InfoLine({ icon, text }: { icon: 'time-outline' | 'location-outline' | 'people-outline'; text: string }) {
  const colors = useColors();
  return (
    <View style={{ flexDirection: 'row', gap: space.sm }}>
      <Icon name={icon} size={18} color={colors.textMuted} />
      <Text style={{ flex: 1, fontSize: 15, lineHeight: 21, color: colors.text }}>{text}</Text>
    </View>
  );
}
