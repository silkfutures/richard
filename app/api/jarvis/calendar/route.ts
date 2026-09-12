import { eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { assistantMessages } from "../../../../db/schema";

type CalendarAction = { type?: string; summary?: string; title?: string | null; start?: string | null; end?: string | null; location?: string | null; notes?: string | null };

export async function GET(request: Request) {
  const id = Number(new URL(request.url).searchParams.get("id"));
  if (!Number.isInteger(id) || id < 1) return new Response("Invalid calendar event", { status: 400 });

  const db = getDb();
  const [message] = await db.select().from(assistantMessages).where(eq(assistantMessages.id, id)).limit(1);
  if (!message?.actionJson || message.actionStatus !== "completed") return new Response("Calendar event is not ready", { status: 404 });

  let action: CalendarAction;
  try { action = JSON.parse(message.actionJson) as CalendarAction; } catch { return new Response("Invalid calendar event", { status: 400 }); }
  if (action.type !== "calendar_event" || !action.title || !action.start) return new Response("Invalid calendar event", { status: 400 });

  const end = action.end || addHour(action.start);
  const calendar = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Nathan Command Centre//Jarvis//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:jarvis-${message.id}@command-centre`,
    `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "")}`,
    `DTSTART:${icsLocal(action.start)}`,
    `DTEND:${icsLocal(end)}`,
    `SUMMARY:${escapeIcs(action.title)}`,
    action.location ? `LOCATION:${escapeIcs(action.location)}` : "",
    action.notes ? `DESCRIPTION:${escapeIcs(action.notes)}` : "",
    "END:VEVENT",
    "END:VCALENDAR",
  ].filter(Boolean).join("\r\n");

  return new Response(calendar, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `inline; filename="${filename(action.title)}.ics"`,
      "Cache-Control": "private, no-store",
    },
  });
}

function addHour(value: string) { const date = new Date(value); date.setHours(date.getHours() + 1); return date.toISOString().slice(0, 16); }
function icsLocal(value: string) { return `${value.slice(0, 16).replace(/[-:]/g, "")}00`; }
function escapeIcs(value: string) { return value.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;"); }
function filename(value: string) { return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50) || "event"; }
