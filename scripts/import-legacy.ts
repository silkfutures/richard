import { readFile } from "node:fs/promises";
import { sql } from "drizzle-orm";
import { getDb } from "../db";
import { assistantMessages, notes, projects, tasks } from "../db/schema";

type LegacyProject = {
  id: string; name: string; status: string; outcome: string; health: string;
  priority: number; progress: number; last_touched: number;
};
type LegacyTask = {
  id: number; title: string; project_id: string; status: string; priority: number;
  effort: number; due_date: string | null; planned_for: string | null;
  waiting_on: string | null; reviewed_at: number | null; review_state: string | null;
  review_note: string | null; created_at: number; completed_at: number | null;
};
type LegacyNote = { id: number; content: string; project_id: string; created_at: number };
type LegacyMessage = {
  id: number; role: string; content: string; action_json: string | null;
  action_status: string | null; created_at: number;
};
type LegacyData = {
  projects: LegacyProject[]; tasks: LegacyTask[]; notes: LegacyNote[];
  assistant_messages: LegacyMessage[];
};

const source = new URL("../migration/private-data.json", import.meta.url);
const data = JSON.parse(await readFile(source, "utf8")) as LegacyData;
const db = getDb();

if (data.projects.length) {
  await db.insert(projects).values(data.projects.map(item => ({
    id: item.id,
    name: item.name,
    status: item.status,
    outcome: item.outcome,
    health: item.health,
    priority: item.priority,
    progress: item.progress,
    lastTouched: new Date(item.last_touched),
  }))).onConflictDoNothing();
}

if (data.tasks.length) {
  await db.insert(tasks).values(data.tasks.map(item => ({
    id: item.id,
    title: item.title,
    projectId: item.project_id,
    status: item.status,
    priority: item.priority,
    effort: item.effort,
    dueDate: item.due_date,
    plannedFor: item.planned_for,
    waitingOn: item.waiting_on,
    reviewedAt: item.reviewed_at ? new Date(item.reviewed_at) : null,
    reviewState: item.review_state,
    reviewNote: item.review_note,
    createdAt: new Date(item.created_at),
    completedAt: item.completed_at ? new Date(item.completed_at) : null,
  }))).onConflictDoNothing();
}

if (data.notes.length) {
  await db.insert(notes).values(data.notes.map(item => ({
    id: item.id,
    content: item.content,
    projectId: item.project_id,
    createdAt: new Date(item.created_at),
  }))).onConflictDoNothing();
}

if (data.assistant_messages.length) {
  await db.insert(assistantMessages).values(data.assistant_messages.map(item => ({
    id: item.id,
    role: item.role,
    content: item.content,
    actionJson: item.action_json,
    actionStatus: item.action_status,
    createdAt: new Date(item.created_at),
  }))).onConflictDoNothing();
}

await db.execute(sql`SELECT setval(pg_get_serial_sequence('tasks', 'id'), COALESCE((SELECT MAX(id) FROM tasks), 1), true)`);
await db.execute(sql`SELECT setval(pg_get_serial_sequence('notes', 'id'), COALESCE((SELECT MAX(id) FROM notes), 1), true)`);
await db.execute(sql`SELECT setval(pg_get_serial_sequence('assistant_messages', 'id'), COALESCE((SELECT MAX(id) FROM assistant_messages), 1), true)`);

console.log(`Imported ${data.projects.length} projects, ${data.tasks.length} tasks, ${data.notes.length} notes and ${data.assistant_messages.length} Jarvis messages.`);
