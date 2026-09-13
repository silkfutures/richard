import { desc, eq, ne } from "drizzle-orm";
import { gateway, generateText, Output } from "ai";
import { z } from "zod";
import { getDb } from "../../../db";
import { assistantMessages, notes, projects, tasks } from "../../../db/schema";

const actionSchema = z.object({
  type: z.enum(["add_task", "add_priority", "prioritise_task", "complete_task", "add_note", "draft_email", "calendar_event"]),
  summary: z.string().min(1).max(180),
  projectId: z.string().nullable(),
  taskId: z.number().int().nullable(),
  title: z.string().nullable(),
  priority: z.number().int().min(1).max(5).nullable(),
  dueDate: z.string().nullable(),
  recipientName: z.string().nullable(),
  recipientEmail: z.string().nullable(),
  subject: z.string().nullable(),
  body: z.string().nullable(),
  start: z.string().nullable(),
  end: z.string().nullable(),
  location: z.string().nullable(),
  notes: z.string().nullable(),
});

const answerSchema = z.object({
  reply: z.string().min(1).max(1600),
  proposal: actionSchema.nullable(),
});

type JarvisAction = z.infer<typeof actionSchema>;
type ProjectRow = typeof projects.$inferSelect;
type TaskRow = typeof tasks.$inferSelect;
type NoteRow = typeof notes.$inferSelect;

type Context = {
  projectRows: ProjectRow[];
  taskRows: TaskRow[];
  noteRows: NoteRow[];
  history: Array<{ role: string; content: string; actionJson: string | null; actionStatus: string | null }>;
};

export async function GET(request: Request) {
  const url = new URL(request.url);
  const today = validDate(url.searchParams.get("today")) || new Date().toISOString().slice(0, 10);
  const timezone = url.searchParams.get("timezone") || "Europe/London";
  const context = await loadContext();
  return stateResponse(context, today, timezone, aiKey(), false);
}

export async function POST(request: Request) {
  const body = await request.json() as { message?: string; today?: string; timezone?: string };
  const message = body.message?.trim().slice(0, 5000) || "";
  if (!message) return Response.json({ error: "Say or type something first." }, { status: 400 });

  const today = validDate(body.today) || new Date().toISOString().slice(0, 10);
  const timezone = body.timezone || "Europe/London";
  const db = getDb();
  const [pending] = await db.select().from(assistantMessages).where(eq(assistantMessages.actionStatus, "pending")).orderBy(desc(assistantMessages.id)).limit(1);

  await addMessage("user", message);

  if (isYes(message)) {
    if (!pending?.actionJson) {
      await addMessage("assistant", "There isn’t an action waiting for confirmation. Tell me what you want to do and I’ll prepare it first.");
      return stateResponse(await loadContext(), today, timezone, aiKey(), false);
    }
    const proposal = parseAction(pending.actionJson);
    if (!proposal) {
      await db.update(assistantMessages).set({ actionStatus: "cancelled" }).where(eq(assistantMessages.id, pending.id));
      await addMessage("assistant", "That pending action is no longer valid, so I left your dashboard unchanged. Tell me what you want and I’ll prepare it again.");
      return stateResponse(await loadContext(), today, timezone, aiKey(), false);
    }
    try {
      const result = await executeAction(proposal, today);
      await db.update(assistantMessages).set({ actionStatus: "completed" }).where(eq(assistantMessages.id, pending.id));
      await addMessage("assistant", result);
      return stateResponse(await loadContext(), today, timezone, aiKey(), true);
    } catch (error) {
      console.error("Jarvis action failed", error);
      await addMessage("assistant", "I couldn’t complete that action, so I haven’t marked it as done. Nothing else was changed. Please try again.");
      return stateResponse(await loadContext(), today, timezone, aiKey(), false, 500);
    }
  }

  if (isNo(message) && pending) {
    await db.update(assistantMessages).set({ actionStatus: "cancelled" }).where(eq(assistantMessages.id, pending.id));
    await addMessage("assistant", "Cancelled. I didn’t change anything.");
    return stateResponse(await loadContext(), today, timezone, aiKey(), false);
  }

  const context = await loadContext();
  const key = aiKey();
  const generated = key
    ? await generateReply(message, context, today, timezone, pending?.actionJson ? parseAction(pending.actionJson) : null)
    : fallbackReply(message, context, today, timezone);

  let proposal = normaliseProposal(generated.proposal, context);
  let reply = generated.reply.trim();
  if (generated.proposal && !proposal) {
    reply = "I’m not confident enough about where that belongs. Which project should I use: Silkfutures, Set Pace, Silkcrayon, Codex ISO, Music or Personal?";
  }
  if (proposal && !/say yes|yes to confirm/i.test(reply)) reply = `${reply}\n\nSay yes to confirm, or no to cancel.`;

  if (proposal && pending) {
    await db.update(assistantMessages).set({ actionStatus: "superseded" }).where(eq(assistantMessages.id, pending.id));
  }
  await addMessage("assistant", reply, proposal ? JSON.stringify(proposal) : null, proposal ? "pending" : null);
  return stateResponse(await loadContext(), today, timezone, key, false);
}

async function loadContext(): Promise<Context> {
  const db = getDb();
  const [projectRows, taskRows, noteRows, historyRows] = await Promise.all([
    db.select().from(projects).orderBy(desc(projects.priority)),
    db.select().from(tasks).where(ne(tasks.status, "archived")).orderBy(desc(tasks.id)),
    db.select().from(notes).orderBy(desc(notes.id)).limit(50),
    db.select({ role: assistantMessages.role, content: assistantMessages.content, actionJson: assistantMessages.actionJson, actionStatus: assistantMessages.actionStatus })
      .from(assistantMessages).orderBy(desc(assistantMessages.id)).limit(40),
  ]);
  return { projectRows, taskRows, noteRows, history: historyRows.reverse() };
}

async function addMessage(role: "user" | "assistant", content: string, actionJson: string | null = null, actionStatus: string | null = null) {
  const db = getDb();
  await db.insert(assistantMessages).values({ role, content, actionJson, actionStatus, createdAt: new Date() });
}

async function stateResponse(context: Context, today: string, timezone: string, key: string | null, refreshDashboard: boolean, status = 200) {
  const db = getDb();
  const rows = await db.select().from(assistantMessages).orderBy(desc(assistantMessages.id)).limit(60);
  const messages = rows.reverse().map((row) => ({
    id: row.id,
    role: row.role,
    content: row.content,
    proposal: row.actionJson ? parseAction(row.actionJson) : null,
    actionStatus: row.actionStatus,
    createdAt: row.createdAt,
  }));
  return Response.json({ messages, briefing: makeBriefing(context, today, timezone), aiEnabled: !!key, refreshDashboard }, { status });
}

async function generateReply(message: string, context: Context, today: string, timezone: string, pending: JarvisAction | null) {
  const openTasks = context.taskRows.filter((task) => task.status === "open").map((task) => ({
    id: task.id,
    title: task.title,
    projectId: task.projectId,
    priority: task.priority,
    effort: task.effort,
    dueDate: task.dueDate,
    plannedFor: task.plannedFor,
    waitingOn: task.waitingOn,
    reviewState: task.reviewState,
    reviewNote: task.reviewNote,
    createdAt: toIso(task.createdAt),
  }));
  const recentDone = context.taskRows.filter((task) => task.status === "done" && task.completedAt).slice(0, 30).map((task) => ({
    id: task.id,
    title: task.title,
    projectId: task.projectId,
    completedAt: toIso(task.completedAt),
  }));
  const recentNotes = context.noteRows.slice(0, 50).map((note) => ({ projectId: note.projectId, content: note.content, createdAt: toIso(note.createdAt) }));
  const conversation = context.history.slice(-16).map((item) => ({ role: item.role, content: item.content, pendingAction: item.actionStatus === "pending" ? parseAction(item.actionJson || "") : null }));

  try {
    const { output } = await generateText({
      model: gateway("openai/gpt-6-astra-fast"),
      output: Output.object({ schema: answerSchema }),
      maxOutputTokens: 1100,
      system: `You are Rich, short for Richard, inside Nathan's private Command Centre. You are a calm, sharp personal chief of staff, not a generic productivity coach.

Ground every answer in the supplied project outcomes, current phases, roadmaps, tasks, notes and history. Be concise, practical and use British English. Explain why a recommendation matters. Recommend no more than three actions at once. Never invent completed work, dates, email addresses, contacts, commitments or access to services. When Nathan asks for the obvious next move, reason from the project's roadmap and what was most recently completed, then identify the smallest action that genuinely advances the current phase.

You may answer questions without a proposal. When Nathan explicitly asks to change something, return exactly one proposal and ask for confirmation. The app will only execute it after Nathan says yes. Never say an action has happened before confirmation.

Available proposal types:
- add_task: create a new open task in a project.
- add_priority: create a new task directly in today's priority list.
- prioritise_task: move an existing open task to today's priority list; use its real taskId.
- complete_task: mark an existing open task complete; use its real taskId. If Nathan says he has done something that clearly matches an open task, offer this before treating it as established history.
- add_note: save context to a project.
- draft_email: write a complete email draft for review. This does not send it or read Gmail.
- calendar_event: prepare an Apple Calendar event. Use local ISO values like YYYY-MM-DDTHH:mm. This does not silently add it; iOS gives final confirmation.

Only use exact project IDs from the supplied project list. If the project is genuinely unclear, ask which project and return no proposal. If a calendar date or time is unclear, ask. If an email recipient or purpose is unclear, ask. Do not default ambiguous work to Personal. If a pending proposal is supplied and Nathan adjusts it, return a corrected replacement proposal.`,
      prompt: `Current local date: ${today}
Timezone: ${timezone}

PROJECTS
${JSON.stringify(context.projectRows.map((project) => ({ id: project.id, name: project.name, status: project.status, outcome: project.outcome, currentPhase: project.currentPhase, roadmap: project.roadmap, health: project.health, priority: project.priority, progress: project.progress })))}

OPEN TASKS
${JSON.stringify(openTasks)}

RECENTLY COMPLETED
${JSON.stringify(recentDone)}

RECENT PROJECT NOTES
${JSON.stringify(recentNotes)}

RECENT CONVERSATION
${JSON.stringify(conversation)}

CURRENT PENDING PROPOSAL
${JSON.stringify(pending)}

Nathan says: ${message}`,
    });
    return output;
  } catch (error) {
    console.error("Jarvis AI generation failed", error);
    return fallbackReply(message, context, today, timezone);
  }
}

function fallbackReply(message: string, context: Context, today: string, timezone: string): z.infer<typeof answerSchema> {
  const lower = message.toLowerCase();
  const open = context.taskRows.filter((task) => task.status === "open");
  const sorted = [...open].sort((a, b) => scoreTask(b, context.projectRows, today) - scoreTask(a, context.projectRows, today));
  const projectName = (id: string) => context.projectRows.find((project) => project.id === id)?.name || id;

  if (/agenda|what(?:'s| is) on today|today(?:'s)? (?:plan|list|priorit)/i.test(message)) {
    const planned = sorted.filter((task) => task.plannedFor === today);
    if (!planned.length) {
      const next = sorted[0];
      return { reply: next ? `Nothing has been deliberately placed in Today yet. My strongest next suggestion is “${next.title}” for ${projectName(next.projectId)} because ${reasonFor(next, today).toLowerCase()}.` : "Your task list is clear. There is nothing on today’s agenda yet.", proposal: null };
    }
    const lines = planned.slice(0, 5).map((task, index) => `${index + 1}. ${task.title} — ${projectName(task.projectId)}`);
    return { reply: `You have ${planned.length} priorit${planned.length === 1 ? "y" : "ies"} today:\n\n${lines.join("\n")}\n\nStart with “${planned[0].title}” because ${reasonFor(planned[0], today).toLowerCase()}.`, proposal: null };
  }

  if (/yesterday|recap|what did i do/i.test(lower)) {
    const yesterday = offsetDate(today, -1);
    const completed = context.taskRows.filter((task) => task.status === "done" && task.completedAt && dateInZone(task.completedAt, timezone) === yesterday);
    if (!completed.length) return { reply: "Nothing was marked complete yesterday. That may mean the day was genuinely quiet, or simply that finished work wasn’t ticked off.", proposal: null };
    const lines = completed.map((task) => `• ${task.title} — ${projectName(task.projectId)}`);
    return { reply: `Yesterday you completed ${completed.length} thing${completed.length === 1 ? "" : "s"}:\n\n${lines.join("\n")}`, proposal: null };
  }

  if (/what should i do|what(?:'s| is) next|where (?:do|should) i start|suggest/i.test(lower)) {
    const next = sorted[0];
    return { reply: next ? `Start with “${next.title}” for ${projectName(next.projectId)}. ${reasonFor(next, today)}. Once that is closed, ask me again and I’ll recalculate.` : "There is nothing open right now. Capture the next commitment or idea and I’ll help place it.", proposal: null };
  }

  if (/avoid|avoiding|stale|old tasks?|been on (?:the )?list/i.test(lower)) {
    const old = open.filter((task) => task.reviewState === "avoiding" || daysOpen(task, today) >= 7).sort((a, b) => daysOpen(b, today) - daysOpen(a, today));
    if (!old.length) return { reply: "Nothing currently meets the seven-day review threshold, and you haven’t marked anything as avoided.", proposal: null };
    const lines = old.slice(0, 5).map((task) => `• ${task.title} — ${projectName(task.projectId)}, ${daysOpen(task, today)} days${task.reviewState === "avoiding" ? ", marked as avoided" : ""}`);
    return { reply: `These deserve an honest decision rather than automatic urgency:\n\n${lines.join("\n")}\n\nAsk me about one of them and we can decide whether to do it, clarify it, unblock it or drop it.`, proposal: null };
  }

  const selectedProject = projectFromText(message, context.projectRows);
  if (/draft|write|compose/i.test(lower) && /email|e-mail|message/i.test(lower)) {
    const recipient = message.match(/\bto\s+([A-Z][a-zA-Z'-]+)/)?.[1] || null;
    const topic = message.split(/\babout\b|\bregarding\b/i)[1]?.trim() || "the task we need to move forward";
    if (!recipient) return { reply: "Who is the email for, and what outcome do you want from it?", proposal: null };
    const draft = `Hi ${recipient},\n\nI wanted to get in touch about ${topic}. Could you let me know the best next step from your side?\n\nThanks,\nNathan`;
    return { reply: `I’ve prepared a concise draft to ${recipient}.`, proposal: { type: "draft_email", summary: `Prepare email to ${recipient}`, projectId: selectedProject?.id || null, taskId: null, title: null, priority: null, dueDate: null, recipientName: recipient, recipientEmail: null, subject: sentenceCase(topic), body: draft, start: null, end: null, location: null, notes: null } };
  }

  const priorityRequest = /\b(priority list|today(?:'s)? list)\b/i.test(message) && /\b(add|put|move)\b/i.test(message);
  const existing = open.find((task) => lower.includes(task.title.toLowerCase()) || task.title.toLowerCase().includes(lower.replace(/^(please\s+)?(add|put|move)\s+/i, "").trim()));
  if (priorityRequest && existing) {
    return { reply: `I can move “${existing.title}” into Today.`, proposal: blankAction({ type: "prioritise_task", summary: `Move ${existing.title} to Today`, projectId: existing.projectId, taskId: existing.id, title: existing.title }) };
  }

  const changeRequest = /\b(add|create|save|put|remember|file)\b/i.test(message) && /\b(task|to[- ]?do|priority|list|note)\b/i.test(message);
  if (changeRequest) {
    if (!selectedProject) return { reply: "Which project should I file that under: Silkfutures, Set Pace, Silkcrayon, Codex ISO, Music or Personal?", proposal: null };
    const isNote = /\bnote\b/i.test(message);
    const clean = cleanActionText(message, selectedProject.name);
    const type = isNote ? "add_note" : priorityRequest ? "add_priority" : "add_task";
    return { reply: `${isNote ? "I can save that note" : priorityRequest ? "I can add that directly to Today" : "I can add that to your to-do list"} under ${selectedProject.name}.`, proposal: blankAction({ type, summary: `${isNote ? "Save note" : "Add task"}: ${clean}`, projectId: selectedProject.id, title: clean, priority: priorityRequest ? 4 : 3, notes: isNote ? clean : null }) };
  }

  if (/calendar|schedule|appointment|meeting/i.test(lower)) {
    return { reply: "Tell me the event title, date, start time and—if relevant—end time. I’ll prepare it for Apple Calendar and ask you to confirm.", proposal: null };
  }

  return { reply: "I can already read your live tasks and history. Ask “What’s on today?”, “Recap yesterday” or “What should I do next?”. Once the AI connection is switched on, I’ll also understand open-ended planning and write more context-aware emails.", proposal: null };
}

function normaliseProposal(proposal: JarvisAction | null, context: Context) {
  if (!proposal) return null;
  const projectIds = new Set(context.projectRows.map((project) => project.id));
  const requiresProject = ["add_task", "add_priority", "add_note"].includes(proposal.type);
  if (requiresProject && (!proposal.projectId || !projectIds.has(proposal.projectId))) return null;
  if (proposal.projectId && !projectIds.has(proposal.projectId)) proposal = { ...proposal, projectId: null };
  if (["add_task", "add_priority", "add_note"].includes(proposal.type) && !proposal.title?.trim()) return null;
  if (["prioritise_task", "complete_task"].includes(proposal.type) && (!proposal.taskId || !context.taskRows.some((task) => task.id === proposal.taskId && task.status === "open"))) return null;
  if (proposal.type === "draft_email" && (!proposal.recipientName?.trim() || !proposal.subject?.trim() || !proposal.body?.trim())) return null;
  if (proposal.type === "calendar_event" && (!proposal.title?.trim() || !validLocalDateTime(proposal.start))) return null;
  return proposal;
}

async function executeAction(action: JarvisAction, today: string) {
  const db = getDb();
  const projectName = async (id: string) => (await db.select({ name: projects.name }).from(projects).where(eq(projects.id, id)).limit(1))[0]?.name || id;

  if (action.type === "prioritise_task" && action.taskId) {
    const [task] = await db.select().from(tasks).where(eq(tasks.id, action.taskId)).limit(1);
    if (!task || task.status !== "open") throw new Error("Task is unavailable");
    await db.update(tasks).set({ plannedFor: today }).where(eq(tasks.id, task.id));
    await db.update(projects).set({ lastTouched: new Date() }).where(eq(projects.id, task.projectId));
    return `Done — “${task.title}” is now on Today’s priority list.`;
  }

  if (action.type === "complete_task" && action.taskId) {
    const [task] = await db.select().from(tasks).where(eq(tasks.id, action.taskId)).limit(1);
    if (!task || task.status !== "open") throw new Error("Task is unavailable");
    const now = new Date();
    await db.update(tasks).set({ status: "done", completedAt: now }).where(eq(tasks.id, task.id));
    await db.update(projects).set({ lastTouched: now }).where(eq(projects.id, task.projectId));
    return `Done — I marked “${task.title}” complete. I can now reassess the roadmap and recommend the strongest next move.`;
  }

  if ((action.type === "add_task" || action.type === "add_priority") && action.projectId && action.title) {
    const plannedFor = action.type === "add_priority" ? today : null;
    await db.insert(tasks).values({ title: action.title.trim(), projectId: action.projectId, priority: action.priority || 3, effort: 2, dueDate: validDate(action.dueDate) || null, plannedFor, createdAt: new Date() });
    await db.update(projects).set({ lastTouched: new Date() }).where(eq(projects.id, action.projectId));
    return `Done — I added “${action.title.trim()}” to ${action.type === "add_priority" ? "Today’s priority list" : `the ${await projectName(action.projectId)} to-do list`}.`;
  }

  if (action.type === "add_note" && action.projectId && action.title) {
    await db.insert(notes).values({ content: action.title.trim(), projectId: action.projectId, createdAt: new Date() });
    await db.update(projects).set({ lastTouched: new Date() }).where(eq(projects.id, action.projectId));
    return `Done — I saved that to ${await projectName(action.projectId)} notes.`;
  }

  if (action.type === "draft_email") return "Draft ready. Review it below; I haven’t sent anything.";
  if (action.type === "calendar_event") return "Calendar event ready. Open it below and Apple Calendar will ask for its final confirmation.";
  throw new Error("Unsupported action");
}

function makeBriefing(context: Context, today: string, timezone: string) {
  const open = context.taskRows.filter((task) => task.status === "open");
  const sorted = [...open].sort((a, b) => scoreTask(b, context.projectRows, today) - scoreTask(a, context.projectRows, today));
  const todayTasks = sorted.filter((task) => task.plannedFor === today);
  const doneToday = context.taskRows.filter((task) => task.status === "done" && task.completedAt && dateInZone(task.completedAt, timezone) === today);
  const focus = todayTasks[0] || sorted[0];
  const project = focus ? context.projectRows.find((item) => item.id === focus.projectId) : null;
  return {
    headline: todayTasks.length ? `${todayTasks.length} priorit${todayTasks.length === 1 ? "y is" : "ies are"} lined up.` : open.length ? "Today is still yours to shape." : "Everything open is clear.",
    detail: todayTasks.length ? `${doneToday.length} completed today. Ask me to rethink the order at any point.` : open.length ? "Nothing is locked into Today yet. I can recommend the strongest place to start." : "There are no open tasks competing for your attention.",
    todayCount: todayTasks.length,
    doneToday: doneToday.length,
    openCount: open.length,
    focus: focus ? { title: focus.title, projectName: project?.name || focus.projectId, reason: reasonFor(focus, today) } : null,
  };
}

function scoreTask(task: TaskRow, projectRows: ProjectRow[], today: string) {
  const due = task.dueDate ? (task.dueDate < today ? 80 : task.dueDate === today ? 70 : 0) : 0;
  const planned = task.plannedFor === today ? 100 : 0;
  const project = (projectRows.find((item) => item.id === task.projectId)?.priority || 3) * 3;
  const loop = /send|reply|speak|email|call|deliver|invoice|submit/i.test(task.title) ? 8 : 0;
  const state = task.reviewState === "blocked" ? -50 : task.reviewState === "unclear" ? -25 : task.reviewState === "avoiding" ? 5 : 0;
  return planned + due + task.priority * 10 + project + loop + state - task.effort;
}

function daysOpen(task: TaskRow, today: string) { return Math.max(0, Math.floor((new Date(`${today}T23:59:59Z`).getTime() - task.createdAt.getTime()) / 86400000)); }

function reasonFor(task: TaskRow, today: string) {
  if (task.plannedFor === today) return "You deliberately chose it for today";
  if (task.dueDate && task.dueDate <= today) return "It is due now";
  if (task.reviewState === "avoiding") return "You previously marked it as something you may be avoiding";
  if (/send|reply|speak|email|call|deliver|invoice|submit/i.test(task.title)) return "It closes an open loop for someone else";
  if (task.priority >= 4) return "It carries high priority in an important project";
  return "It currently has the strongest mix of importance and momentum";
}

function projectFromText(text: string, projectRows: ProjectRow[]) {
  const lower = text.toLowerCase();
  return projectRows.find((project) => lower.includes(project.name.toLowerCase()) || (project.id === "silkfutures" && lower.includes("silk futures")) || (project.id === "silkcrayon" && lower.includes("silk crayon")) || (project.id === "set-pace" && lower.includes("setpace")) || (project.id === "codex-iso" && lower.includes("codexiso"))) || null;
}

function cleanActionText(text: string, projectName: string) {
  return text
    .replace(/^(please\s+)?(can you\s+)?(add|create|save|put|remember|file)\s+/i, "")
    .replace(/\b(to|in|under|for)\s+(my\s+)?(priority list|today(?:'s)? list|to[- ]?do list|tasks?|notes?)\b/gi, "")
    .replace(new RegExp(`\\b(to|in|under|for)\\s+${escapeRegex(projectName)}\\b`, "i"), "")
    .replace(new RegExp(`\\b${escapeRegex(projectName)}\\b`, "i"), "")
    .replace(/\s+/g, " ").replace(/^[\s,:-]+|[\s,:-]+$/g, "").trim() || text.trim();
}

function blankAction(values: Partial<JarvisAction> & Pick<JarvisAction, "type" | "summary">): JarvisAction {
  return {
    type: values.type,
    summary: values.summary,
    projectId: values.projectId ?? null,
    taskId: values.taskId ?? null,
    title: values.title ?? null,
    priority: values.priority ?? null,
    dueDate: values.dueDate ?? null,
    recipientName: values.recipientName ?? null,
    recipientEmail: values.recipientEmail ?? null,
    subject: values.subject ?? null,
    body: values.body ?? null,
    start: values.start ?? null,
    end: values.end ?? null,
    location: values.location ?? null,
    notes: values.notes ?? null,
  };
}

function aiKey() {
  return process.env.AI_GATEWAY_API_KEY?.trim() || process.env.VERCEL_OIDC_TOKEN?.trim() || (process.env.VERCEL === "1" ? "vercel-oidc" : null);
}

function parseAction(value: string) {
  try { return actionSchema.parse(JSON.parse(value)); } catch { return null; }
}

function isYes(value: string) { return /^(yes|yes please|yep|yeah|do it|go ahead|confirm|please do|add it|make it so)[.!]?$/i.test(value.trim()); }
function isNo(value: string) { return /^(no|no thanks|no thank you|cancel|don['’]t|leave it|stop)[.!]?$/i.test(value.trim()); }
function validDate(value?: string | null) { return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null; }
function validLocalDateTime(value?: string | null) { return !!value && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value); }
function offsetDate(value: string, days: number) { const date = new Date(`${value}T12:00:00Z`); date.setUTCDate(date.getUTCDate() + days); return date.toISOString().slice(0, 10); }
function toIso(value: Date | null) { return value ? value.toISOString() : null; }
function dateInZone(value: Date, timezone: string) { try { const parts = new Intl.DateTimeFormat("en-GB", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(value); const get = (type: string) => parts.find((part) => part.type === type)?.value || ""; return `${get("year")}-${get("month")}-${get("day")}`; } catch { return value.toISOString().slice(0, 10); } }
function sentenceCase(value: string) { const clean = value.replace(/[.]+$/, "").trim(); return clean ? clean[0].toUpperCase() + clean.slice(1) : "Quick question"; }
function escapeRegex(value: string) { return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
