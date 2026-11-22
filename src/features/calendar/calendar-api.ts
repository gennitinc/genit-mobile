import { api } from '@/lib/api';

export type EventTime = { dateTime?: string; date?: string; timeZone?: string };

export type CalendarEvent = {
  id: string;
  status?: string;
  summary?: string;
  description?: string;
  location?: string;
  start?: EventTime;
  end?: EventTime;
  attendees?: { email: string; displayName?: string; optional?: boolean; responseStatus?: string }[];
  htmlLink?: string;
  hangoutLink?: string;
};

export type GoogleCalendar = {
  id: string;
  summary: string;
  primary?: boolean;
  accessRole?: string;
  timeZone?: string;
  backgroundColor?: string;
};

export type EventInput = {
  calendarId?: string;
  summary: string;
  description?: string;
  location?: string;
  start: EventTime;
  end: EventTime;
  attendees?: { email: string }[];
  sendUpdates?: 'all' | 'externalOnly' | 'none';
};

const base = (integrationId: string) => `integrations/google_calendar/${integrationId}`;

export const fetchCalendars = (integrationId: string) =>
  api<{ calendars: GoogleCalendar[] }>(`${base(integrationId)}/calendars`).then((data) => data.calendars);

export const fetchEvents = (integrationId: string, query: { calendarId: string; q?: string; timeMin: string; timeMax: string }) =>
  api<{ events: CalendarEvent[] }>(`${base(integrationId)}/events`, {
    query: { ...query, maxResults: 2500, orderBy: 'startTime' },
  }).then((data) => data.events);

export const createEvent = (integrationId: string, input: EventInput) =>
  api<{ event: CalendarEvent }>(`${base(integrationId)}/events`, { body: input });

export const updateEvent = (integrationId: string, eventId: string, input: EventInput) =>
  api<{ event: CalendarEvent }>(`${base(integrationId)}/events/${encodeURIComponent(eventId)}`, { method: 'PUT', body: input });

export const deleteEvent = (integrationId: string, eventId: string, calendarId: string) =>
  api(`${base(integrationId)}/events/${encodeURIComponent(eventId)}`, {
    method: 'DELETE',
    query: { calendarId, sendUpdates: 'all' },
  });

export function isAllDay(event: CalendarEvent) {
  return !!event.start?.date && !event.start.dateTime;
}

/** All-day dates are calendar days, so parse them as local midnight, not UTC. */
export function parseDay(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}

export function dayKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function eventStart(event: CalendarEvent) {
  if (event.start?.dateTime) return new Date(event.start.dateTime);
  if (event.start?.date) return parseDay(event.start.date);
  return new Date(NaN);
}

export function eventEnd(event: CalendarEvent) {
  if (event.end?.dateTime) return new Date(event.end.dateTime);
  // Google's all-day end date is exclusive.
  if (event.end?.date) return new Date(parseDay(event.end.date).getTime() - 1);
  return eventStart(event);
}

/** Whether the event covers any part of the given local day. */
export function occursOn(event: CalendarEvent, day: Date) {
  const start = new Date(day);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return eventStart(event) < end && eventEnd(event) >= start;
}
