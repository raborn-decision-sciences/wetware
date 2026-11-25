/* Wetware core: calendar reminders (.ics).
 *
 * Browsers can't schedule a notification for tomorrow without a push server,
 * and this app has no server. A calendar file does the job instead: one daily
 * repeating "contract" reminder at a time you choose, plus one-off events for
 * Safehouse dead drops and diagnostics retests that are coming due. Times are
 * written as floating local times, so the calendar shows them in your zone.
 */
(function (root) {
  'use strict';
  const WW = (root.WW = root.WW || {});

  const pad = (n) => String(n).padStart(2, '0');
  /** Floating local date-time, e.g. 20261124T190000. */
  const local = (d) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`;
  const utc = (d) => `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
  /** RFC 5545 text escaping. */
  const esc = (s) => String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

  /**
   * opts: { time: 'HH:MM' (daily reminder, or null for none), events: [{ at: ms, title, description }], now: ms }
   * Returns the .ics text (CRLF line endings).
   */
  function calendar(opts) {
    const now = new Date(opts.now || Date.now());
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Wetware//Reminders//EN', 'CALSCALE:GREGORIAN'];
    const event = (uid, start, mins, title, desc, rrule) => {
      const end = new Date(start.getTime() + mins * 60000);
      lines.push('BEGIN:VEVENT', `UID:${uid}@wetware.local`, `DTSTAMP:${utc(now)}`, `DTSTART:${local(start)}`, `DTEND:${local(end)}`, `SUMMARY:${esc(title)}`);
      if (desc) lines.push(`DESCRIPTION:${esc(desc)}`);
      if (rrule) lines.push(`RRULE:${rrule}`);
      lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${esc(title)}`, 'TRIGGER:PT0M', 'END:VALARM', 'END:VEVENT');
    };
    if (opts.time && /^\d{1,2}:\d{2}$/.test(opts.time)) {
      const [hh, mm] = opts.time.split(':').map(Number);
      const first = new Date(now);
      first.setHours(hh, mm, 0, 0);
      if (first <= now) first.setDate(first.getDate() + 1);
      event('daily-contract', first, 15, 'Wetware: daily contract', 'Rook has today’s contract ready. About 12–15 minutes.', 'FREQ=DAILY');
    }
    for (const e of opts.events || []) {
      if (!Number.isFinite(e.at) || e.at < now.getTime() - 864e5) continue;
      event(`${e.uid || e.at}`, new Date(e.at), 10, e.title, e.description || '', null);
    }
    lines.push('END:VCALENDAR');
    return lines.join('\r\n') + '\r\n';
  }

  WW.reminders = { calendar, esc };
})(globalThis);
