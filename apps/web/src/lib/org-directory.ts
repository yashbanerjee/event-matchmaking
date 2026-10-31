import {
  formatEventDate,
  isoToEventDateTime,
} from '@/lib/event-schedule';

export type TableAssignment = {
  placeName: string;
  location: string | null;
  startsAt: string;
  endsAt: string;
  allDay: boolean;
};

export type MeetingStats = {
  upcoming: number;
  confirmed: number;
  completed: number;
  nextStartsAt: string | null;
};

export function formatNextMeeting(iso?: string | null) {
  if (!iso) return '—';
  const { date, time } = isoToEventDateTime(iso);
  if (!date) return '—';
  return `${formatEventDate(date, 'short')} · ${time}`;
}

export function formatTableWindow(assignment: TableAssignment) {
  const start = isoToEventDateTime(assignment.startsAt);
  const end = isoToEventDateTime(assignment.endsAt);
  if (start.date && end.date && start.date !== end.date) {
    return `${formatEventDate(start.date, 'short')} – ${formatEventDate(end.date, 'short')}`;
  }
  if (assignment.allDay) {
    return start.date ? formatEventDate(start.date, 'short') : 'All day';
  }
  if (!start.date) return '—';
  return `${formatEventDate(start.date, 'short')} · ${start.time}–${end.time}`;
}
