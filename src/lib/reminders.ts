// Daily reminders: a calendar event (works everywhere, even when Lumen is closed)
// and a notification while Lumen is open or installed. Pure helpers.

const pad = (n: number) => String(n).padStart(2, "0");

/** "07:30" → the next date-time at that clock time, from `now`. */
export function nextAt(time: string, now: Date): Date {
  const [h, m] = time.split(":").map(Number);
  const t = new Date(now); t.setHours(h || 0, m || 0, 0, 0);
  if (t <= now) t.setDate(t.getDate() + 1);
  return t;
}

const stamp = (d: Date) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`;

/** An iCalendar file with a daily event at the chosen local time. */
export function dailyIcs(time: string, minutes: number, url: string, now: Date): string {
  const start = nextAt(time, now), end = new Date(start.getTime() + minutes * 60_000);
  const utc = now.toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
  return [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Lumen//Daily session//EN", "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:lumen-daily-${utc}@lumen`, `DTSTAMP:${utc}`,
    `DTSTART:${stamp(start)}`, `DTEND:${stamp(end)}`, "RRULE:FREQ=DAILY",
    "SUMMARY:Lumen: today's session", `DESCRIPTION:${minutes} minutes to grow a little. ${url}`, `URL:${url}`,
    "BEGIN:VALARM", "ACTION:DISPLAY", "DESCRIPTION:Lumen", "TRIGGER:PT0M", "END:VALARM",
    "END:VEVENT", "END:VCALENDAR", "",
  ].join("\r\n");
}

/** A link that opens Google Calendar with the daily event filled in. */
export function googleCalendarUrl(time: string, minutes: number, url: string, now: Date): string {
  const start = nextAt(time, now), end = new Date(start.getTime() + minutes * 60_000);
  const q = new URLSearchParams({ action: "TEMPLATE", text: "Lumen: today's session", dates: `${stamp(start)}/${stamp(end)}`, details: `${minutes} minutes to grow a little. ${url}`, recur: "RRULE:FREQ=DAILY" });
  return `https://calendar.google.com/calendar/render?${q}`;
}
