import { index, integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const projects = pgTable("projects", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  status: text("status").notNull().default("active"),
  outcome: text("outcome").notNull().default(""),
  health: text("health").notNull().default("green"),
  priority: integer("priority").notNull().default(3),
  progress: integer("progress").notNull().default(0),
  lastTouched: timestamp("last_touched", { withTimezone: true }).notNull(),
});

export const tasks = pgTable("tasks", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  projectId: text("project_id").notNull().references(() => projects.id),
  status: text("status").notNull().default("open"),
  priority: integer("priority").notNull().default(3),
  effort: integer("effort").notNull().default(2),
  dueDate: text("due_date"),
  plannedFor: text("planned_for"),
  waitingOn: text("waiting_on"),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  reviewState: text("review_state"),
  reviewNote: text("review_note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
}, (table) => [index("idx_tasks_status_planned_for").on(table.status, table.plannedFor)]);

export const notes = pgTable("notes", {
  id: serial("id").primaryKey(),
  content: text("content").notNull(),
  projectId: text("project_id").notNull().references(() => projects.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
});

export const assistantMessages = pgTable("assistant_messages", {
  id: serial("id").primaryKey(),
  role: text("role").notNull(),
  content: text("content").notNull(),
  actionJson: text("action_json"),
  actionStatus: text("action_status"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
}, (table) => [index("idx_assistant_messages_action_status").on(table.actionStatus)]);
