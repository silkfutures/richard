import { desc, eq, ne } from "drizzle-orm";
import { getDb } from "../../../db";
import { notes, projects, tasks } from "../../../db/schema";

const initialProjects = [
  ["silkfutures", "Silkfutures", "active", "Build the strongest youth development engine in Cardiff", "Silkfutures 2.0 and Alchemy relaunch", "Build a committed core through the 24-week Alchemy pathway, Benny-led Discovery Sessions and the five-stage progression model.", "green", 5, 72],
  ["set-pace", "Set Pace", "active", "Restart the season around Love in Motion", "Rebuilding the season around Love in Motion", "Create a sustainable rhythm across juniors, adults and the run club, then strengthen the community through shared challenges and events.", "amber", 4, 48],
  ["silkcrayon", "Silkcrayon", "maintain", "Keep the studio booked and operating cleanly", "Stabilising the new booking and studio operating system", "Complete the client journey from discovery and booking through payment, delivery and return visits, then develop the strongest artists through Silk Records.", "green", 4, 61],
  ["codex-iso", "Codex ISO", "building", "Launch the first collection of essential texts", "Building the first trustworthy collection", "Establish the complete-edition production pipeline, grow towards 100 then 500 titles, and build the Map of Truth discovery layer.", "amber", 3, 28],
  ["music", "Music", "maintain", "Create without turning the weekly challenge into a burden", "Reconnecting output with an authentic artist identity", "Finish the strongest existing music, clarify the artistic world and build genuine audience depth before expanding into community products.", "amber", 2, 22],
  ["personal", "Personal", "active", "Build a stable home, body and financial base", "Building a stable physical, financial and domestic base", "Protect recovery and health, create financial clarity and build routines that support the next creative and business season.", "green", 4, 55],
] as const;

async function seedIfEmpty() {
  const db = getDb();
  const existing = await db.select({ id: projects.id }).from(projects).limit(1);
  if (existing.length) return;
  const now = new Date();
  await db.insert(projects).values(initialProjects.map(([id, name, status, outcome, currentPhase, roadmap, health, priority, progress]) => ({ id, name, status, outcome, currentPhase, roadmap, health, priority, progress, lastTouched: now })));
}

export async function GET() {
  await seedIfEmpty();
  const db = getDb();
  const existingTasks = await db.select().from(tasks).where(ne(tasks.status, "archived"));
  for (const task of existingTasks) {
    const explicitProject = explicitProjectFrom(task.title);
    if (explicitProject && explicitProject !== task.projectId) {
      await db.update(tasks).set({ projectId: explicitProject }).where(eq(tasks.id, task.id));
    }
  }
  const [projectRows, taskRows, noteRows] = await Promise.all([
    db.select().from(projects).orderBy(desc(projects.priority)),
    db.select().from(tasks).where(ne(tasks.status, "archived")).orderBy(desc(tasks.priority), desc(tasks.id)),
    db.select().from(notes).orderBy(desc(notes.id)),
  ]);
  return Response.json({ projects: projectRows, tasks: taskRows, notes: noteRows });
}

function explicitProjectFrom(text: string) {
  const lower = text.toLowerCase();
  if (lower.includes("silkfutures") || lower.includes("silk futures")) return "silkfutures";
  if (lower.includes("silkcrayon") || lower.includes("silk crayon")) return "silkcrayon";
  if (lower.includes("set pace") || lower.includes("setpace")) return "set-pace";
  if (lower.includes("codex iso") || lower.includes("codexiso")) return "codex-iso";
  return null;
}

function understand(text: string) {
  const lower = text.toLowerCase();
  const projectRules: [string, string[]][] = [
    ["silkfutures", ["silkfutures", "silk futures", "young people", "youth", "grant", "funder", "mentor", "act learner"]],
    ["set-pace", ["set pace", "setpace", "workout", "run club", "juniors", "hyrox", "ross"]],
    ["silkcrayon", ["silkcrayon", "studio", "session", "voiceover", "voice over", "recorded", "mix", "master", "client", "booking"]],
    ["codex-iso", ["codex", "book", "pdf", "text", "apocrypha", "store"]],
    ["music", ["song", "release", "music", "verse", "video", "artist", "spotify"]],
    ["personal", ["house", "home", "car", "money", "bank", "health", "gym", "family", "personal"]],
  ];
  const explicitId = explicitProjectFrom(text);
  const explicit = explicitId ? projectRules.find(([id]) => id === explicitId) : undefined;
  const matches = projectRules.map(([id, words]) => ({ id, hits: words.filter(word => lower.includes(word)).length })).filter(x => x.hits > 0).sort((a,b) => b.hits-a.hits);
  const projectId = explicit?.[0] ?? matches[0]?.id ?? "personal";
  const confidence = explicit ? "high" : !matches.length || (matches[1] && matches[0].hits === matches[1].hits) ? "low" : "medium";
  const isNote = /^(note|idea|thought|remember|reference)\s*[:\-]/i.test(text) || /\b(an idea|might be useful|for reference)\b/i.test(text);
  const urgent = /\b(today|urgent|asap|overdue|now|before|deadline)\b/i.test(text);
  const closesLoop = /\b(send|reply|respond|email|call|deliver|approve|invoice|pay|submit|voice\s?over)\b/i.test(text);
  const priority = urgent ? 5 : closesLoop ? 4 : 3;
  const dueDate = /\btoday\b/i.test(text) ? new Date().toISOString().slice(0,10) : null;
  const reason = urgent ? "Time-sensitive" : closesLoop ? "Closes an open loop for someone else" : "Important next action";
  const wantsEmail = /\b(email|e-mail|speak to|message|contact|reply to|send to)\b/i.test(text);
  return { projectId, kind: isNote ? "note" : "task", priority, dueDate, reason, confidence, wantsEmail };
}

export async function POST(request: Request) {
  await seedIfEmpty();
  const body = await request.json() as { action?: string; id?: number; title?: string; text?: string; kind?: "task"|"note"; projectId?: string; priority?: number; effort?: number; dueDate?: string | null; plannedFor?: string | null; waitingOn?: string | null; decision?: string; reviewedAt?: string | null; reviewState?: string | null; reviewNote?: string | null; status?: string; createdAt?: string | null; completedAt?: string | null };
  const db = getDb();
  if (body.action === "toggle" && body.id) {
    const [current] = await db.select().from(tasks).where(eq(tasks.id, body.id)).limit(1);
    if (!current) return Response.json({ error: "Task not found" }, { status: 404 });
    const done = current.status !== "done";
    await db.update(tasks).set({ status: done ? "done" : "open", completedAt: done ? new Date() : null }).where(eq(tasks.id, body.id));
    await db.update(projects).set({ lastTouched: new Date() }).where(eq(projects.id, current.projectId));
    return Response.json({ ok: true });
  }
  if (body.action === "archive" && body.id) {
    await db.update(tasks).set({ status: "archived" }).where(eq(tasks.id, body.id));
    return Response.json({ ok: true });
  }
  if (body.action === "delete_note" && body.id) {
    await db.delete(notes).where(eq(notes.id, body.id));
    return Response.json({ ok: true });
  }
  if (body.action === "restore" && body.id) {
    const restoreDone = body.status === "done";
    await db.update(tasks).set({ status: restoreDone ? "done" : "open", completedAt: restoreDone ? new Date(body.completedAt || Date.now()) : null }).where(eq(tasks.id, body.id));
    return Response.json({ ok: true });
  }
  if (body.action === "schedule" && body.id) {
    await db.update(tasks).set({ plannedFor: body.plannedFor || null }).where(eq(tasks.id, body.id));
    return Response.json({ ok: true });
  }
  if (body.action === "review" && body.id && body.decision) {
    const [current] = await db.select().from(tasks).where(eq(tasks.id, body.id)).limit(1);
    if (!current) return Response.json({ error: "Task not found" }, { status: 404 });
    const now = new Date();
    const today = body.plannedFor || now.toISOString().slice(0, 10);
    if (body.decision === "drop") {
      await db.update(tasks).set({ status: "archived", reviewedAt: now, reviewState: "dropped", reviewNote: body.reviewNote?.trim() || null }).where(eq(tasks.id, body.id));
    } else {
      await db.update(tasks).set({
        reviewedAt: now,
        reviewState: body.decision,
        reviewNote: body.reviewNote?.trim() || null,
        plannedFor: body.decision === "today" ? today : current.plannedFor,
      }).where(eq(tasks.id, body.id));
    }
    await db.update(projects).set({ lastTouched: now }).where(eq(projects.id, current.projectId));
    return Response.json({ ok: true });
  }
  if (body.action === "edit" && body.id && body.title?.trim() && body.projectId) {
    await db.update(tasks).set({ title: body.title.trim(), projectId: body.projectId, priority: body.priority ?? 3, dueDate: body.dueDate || null, plannedFor: body.plannedFor || null }).where(eq(tasks.id, body.id));
    return Response.json({ ok: true });
  }
  if (body.action === "analyse" && body.text?.trim()) {
    return Response.json(understand(body.text.trim()));
  }
  if (body.action === "capture" && body.text?.trim()) {
    const text = body.text.trim();
    const inferred = understand(text);
    const result = { ...inferred, projectId: body.projectId || inferred.projectId, kind: body.kind || inferred.kind };
    if (result.kind === "note") {
      const [note] = await db.insert(notes).values({ content: text.replace(/^(note|idea|thought|remember|reference)\s*[:\-]\s*/i, ""), projectId: result.projectId, createdAt: new Date() }).returning();
      await db.update(projects).set({ lastTouched: new Date() }).where(eq(projects.id, result.projectId));
      return Response.json({ kind: "note", item: note, projectId: result.projectId, reason: "Filed as a project note" }, { status: 201 });
    }
    const cleanTitle = text.replace(/^(task|todo)\s*[:\-]\s*/i, "");
    const [task] = await db.insert(tasks).values({ title: cleanTitle, projectId: result.projectId, priority: result.priority, effort: 2, dueDate: result.dueDate, plannedFor: body.plannedFor || null, createdAt: new Date() }).returning();
    await db.update(projects).set({ lastTouched: new Date() }).where(eq(projects.id, result.projectId));
    return Response.json({ kind: "task", item: task, projectId: result.projectId, reason: result.reason }, { status: 201 });
  }
  if (!body.title?.trim() || !body.projectId) return Response.json({ error: "Task and project are required" }, { status: 400 });
  const [task] = await db.insert(tasks).values({
    title: body.title.trim(),
    projectId: body.projectId,
    status: body.status || "open",
    priority: body.priority ?? 3,
    effort: body.effort ?? 2,
    dueDate: body.dueDate || null,
    plannedFor: body.plannedFor || null,
    waitingOn: body.waitingOn || null,
    reviewedAt: body.reviewedAt ? new Date(body.reviewedAt) : null,
    reviewState: body.reviewState || null,
    reviewNote: body.reviewNote || null,
    createdAt: body.createdAt ? new Date(body.createdAt) : new Date(),
    completedAt: body.completedAt ? new Date(body.completedAt) : null,
  }).returning();
  await db.update(projects).set({ lastTouched: new Date() }).where(eq(projects.id, body.projectId));
  return Response.json({ task }, { status: 201 });
}
