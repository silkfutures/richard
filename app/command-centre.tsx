"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  AudioLines,
  AlertCircle,
  ArrowRight,
  Brain,
  CalendarCheck,
  Check,
  ChevronLeft,
  ChevronRight,
  Circle,
  Clock3,
  Command,
  Copy,
  FileText,
  Layers3,
  ListTodo,
  Mail,
  Mic,
  Moon,
  MoreHorizontal,
  Pencil,
  Plus,
  PhoneCall,
  RotateCcw,
  Send,
  Sparkles,
  Square,
  Sun,
  Sunrise,
  Target,
  Trophy,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";

type DayView = "morning" | "day" | "evening";
type Screen = "day" | "projects" | "progress" | "jarvis" | "notes";
type Project = { id: string; name: string; status: string; outcome: string; currentPhase: string; roadmap: string; health: string; priority: number; progress: number; lastTouched: string };
type Task = { id: number; title: string; projectId: string; status: string; priority: number; effort: number; dueDate: string | null; plannedFor: string | null; waitingOn: string | null; reviewedAt: string | null; reviewState: string | null; reviewNote: string | null; createdAt: string; completedAt: string | null };
type Note = { id: number; content: string; projectId: string; createdAt: string };
type Analysis = { kind: "task" | "note"; projectId: string; priority: number; reason: string; confidence: "high" | "medium" | "low"; wantsEmail: boolean } | null;
type CaptureResult = { kind: "task" | "note"; projectId: string; wantsEmail: boolean } | null;
type ReviewDecision = "today" | "keep" | "avoiding" | "blocked" | "unclear" | "drop";
type JarvisAction = {
  type: "add_task" | "add_priority" | "prioritise_task" | "complete_task" | "add_note" | "draft_email" | "calendar_event";
  summary: string;
  projectId: string | null;
  taskId: number | null;
  title: string | null;
  priority: number | null;
  dueDate: string | null;
  recipientName: string | null;
  recipientEmail: string | null;
  subject: string | null;
  body: string | null;
  start: string | null;
  end: string | null;
  location: string | null;
  notes: string | null;
};
type JarvisMessage = { id: number; role: "user" | "assistant"; content: string; proposal: JarvisAction | null; actionStatus: string | null; createdAt: string };
type JarvisBriefing = { headline: string; detail: string; todayCount: number; doneToday: number; openCount: number; focus: { title: string; projectName: string; reason: string } | null };
type RealtimeStatus = "idle" | "connecting" | "listening" | "thinking" | "speaking" | "error";
type RealtimeOutput = { type?: string; name?: string; call_id?: string; arguments?: string };
type RealtimeEvent = {
  type?: string;
  transcript?: string;
  delta?: string;
  response?: { output?: RealtimeOutput[] };
  error?: { message?: string };
};

type SpeechResult = { 0?: { transcript?: string }; isFinal?: boolean; length: number };
type SpeechEvent = { resultIndex: number; results: ArrayLike<SpeechResult> };
type SpeechError = { error?: string };
type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort?: () => void;
  onstart: (() => void) | null;
  onresult: ((event: SpeechEvent) => void) | null;
  onspeechend: (() => void) | null;
  onend: (() => void) | null;
  onerror: ((event: SpeechError) => void) | null;
};
type SpeechConstructor = new () => SpeechRecognitionLike;

export default function CommandCentre() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [screen, setScreen] = useState<Screen>("day");
  const [view, setView] = useState<DayView>(() => dayView());
  const [deleteTarget, setDeleteTarget] = useState<Task | null>(null);
  const [deleteNoteTarget, setDeleteNoteTarget] = useState<Note | null>(null);
  const [editTarget, setEditTarget] = useState<Task | null>(null);
  const [reviewTarget, setReviewTarget] = useState<Task | null>(null);
  const [lastDeleted, setLastDeleted] = useState<Task | null>(null);
  const [quickCaptureOpen, setQuickCaptureOpen] = useState(false);
  const today = localDate(new Date());
  const tomorrow = dateOffset(today, 1);

  const load = async () => {
    const response = await fetch("/api/dashboard");
    const data = await response.json();
    setProjects(data.projects || []);
    setTasks(data.tasks || []);
    setNotes(data.notes || []);
    setLoading(false);
  };

  useEffect(() => {
    let active = true;
    fetch("/api/dashboard").then((response) => response.json()).then((data) => {
      if (!active) return;
      setProjects(data.projects || []);
      setTasks(data.tasks || []);
      setNotes(data.notes || []);
      setLoading(false);
    });
    return () => { active = false; };
  }, []);

  const open = useMemo(() => tasks.filter((task) => task.status === "open"), [tasks]);
  const staleTasks = useMemo(() => open.filter((task) => needsReview(task, today)), [open, today]);
  const currentOpen = useMemo(() => open.filter((task) => !needsReview(task, today)), [open, today]);
  const doneToday = useMemo(() => tasks.filter((task) => task.status === "done" && task.completedAt && localDate(new Date(task.completedAt)) === today), [tasks, today]);
  const sorted = useMemo(() => [...currentOpen].sort((a, b) => taskScore(b, projects, today) - taskScore(a, projects, today)), [currentOpen, projects, today]);
  const plannedToday = sorted.filter((task) => task.plannedFor === today);
  const suggestionPool = sorted.filter((task) => task.plannedFor !== today && (!task.plannedFor || task.plannedFor < today));
  const dayQueue = sorted.filter((task) => task.plannedFor !== today);
  const todayThree = [...plannedToday.slice(0, 3), ...suggestionPool.slice(0, Math.max(0, 3 - plannedToday.length))].slice(0, 3);
  const focus = todayThree[0] || dayQueue[0];
  const plannedTomorrow = sorted.filter((task) => task.plannedFor === tomorrow);
  const projectName = (id: string) => projects.find((project) => project.id === id)?.name || id;

  async function action(actionName: string, id: number, extra: Record<string, unknown> = {}) {
    if (actionName === "schedule") setTasks((current) => current.map((task) => task.id === id ? { ...task, plannedFor: (extra.plannedFor as string | null) || null } : task));
    if (actionName === "toggle") setTasks((current) => current.map((task) => task.id === id ? { ...task, status: task.status === "done" ? "open" : "done", completedAt: task.status === "done" ? null : new Date().toISOString() } : task));
    if (actionName === "archive") setTasks((current) => current.filter((task) => task.id !== id));
    const response = await post({ action: actionName, id, ...extra });
    if (!response.ok) { await load(); return; }
    await load();
  }

  async function remove() {
    if (!deleteTarget) return;
    const task = deleteTarget;
    setDeleteTarget(null);
    await action("archive", task.id);
    showUndo(task);
  }

  async function removeNote() {
    if (!deleteNoteTarget) return;
    const note = deleteNoteTarget;
    setDeleteNoteTarget(null);
    setNotes((current) => current.filter((item) => item.id !== note.id));
    const response = await post({ action: "delete_note", id: note.id });
    if (!response.ok) await load();
  }

  function showUndo(task: Task) {
    setLastDeleted(task);
    window.setTimeout(() => setLastDeleted((current) => current?.id === task.id ? null : current), 7000);
  }

  async function saveReview(task: Task, decision: ReviewDecision, reviewNote: string) {
    setReviewTarget(null);
    await action("review", task.id, { decision, reviewNote: reviewNote || null, plannedFor: today });
    if (decision === "drop") showUndo(task);
  }

  async function lockToday() {
    await Promise.all(todayThree.map((task) => post({ action: "schedule", id: task.id, plannedFor: today })));
    await load();
  }

  function goDay(nextView: DayView = view) {
    setScreen("day");
    setView(nextView);
  }

  const shared = { projects, projectName, onAction: action, onEdit: setEditTarget, onDelete: setDeleteTarget, onSaved: load };

  return <div className="min-h-screen bg-[#f2f3f5] pb-24 text-[#171a1f] lg:pb-0">
    <DesktopNav screen={screen} view={view} onDay={goDay} setScreen={setScreen} />
    <main className="lg:pl-64"><div className="mx-auto max-w-[1320px] px-4 py-5 sm:px-7 lg:px-9 lg:py-8">
      <Header screen={screen} view={view} />
      {screen === "day" && <ViewSwitch view={view} setView={goDay} />}
      <div key={`${screen}-${view}`} className="cc-page">
        {screen === "day" && view === "morning" && <Morning {...shared} tasks={todayThree} chosenCount={plannedToday.length} staleTasks={staleTasks} focus={focus} loading={loading} today={today} onLock={lockToday} onReview={setReviewTarget} />}
        {screen === "day" && view === "day" && <Day {...shared} priorityTasks={plannedToday} suggestions={suggestionPool.slice(0, Math.max(0, 3 - plannedToday.length))} queueTasks={dayQueue} staleTasks={staleTasks} doneCount={doneToday.length} today={today} onReview={setReviewTarget} />}
        {screen === "day" && view === "evening" && <Evening {...shared} tasks={sorted} staleTasks={staleTasks} tomorrowTasks={plannedTomorrow} done={doneToday} tomorrow={tomorrow} onReview={setReviewTarget} />}
        {screen === "projects" && <ProjectsView {...shared} tasks={tasks} notes={notes} today={today} onDeleteNote={setDeleteNoteTarget} />}
        {screen === "progress" && <ProgressView projects={projects} tasks={tasks} notes={notes} today={today} />}
        {screen === "jarvis" && <JarvisView projects={projects} today={today} onSaved={load} />}
        {screen === "notes" && <NotesView projects={projects} notes={notes} today={today} onSaved={load} onDeleteNote={setDeleteNoteTarget} />}
      </div>
    </div></main>
    <button onClick={() => setQuickCaptureOpen(true)} className="quick-add" aria-label="Quick add"><Plus size={26} /></button>
    <MobileNav screen={screen} onDay={() => goDay(view)} setScreen={setScreen} />
    {lastDeleted && <div className="fixed bottom-24 left-1/2 z-40 flex w-[calc(100%-2rem)] max-w-md -translate-x-1/2 items-center justify-between gap-4 rounded-2xl bg-[#171b21] px-4 py-3 text-sm text-white shadow-2xl lg:bottom-6"><span>Removed “{short(lastDeleted.title, 28)}”</span><button className="flex shrink-0 items-center gap-1 font-semibold text-[#b7a7ff]" onClick={async () => { await action("restore", lastDeleted.id, { status: lastDeleted.status, completedAt: lastDeleted.completedAt }); setLastDeleted(null); }}><RotateCcw size={15} />Undo</button></div>}
    <AlertDialog open={!!deleteTarget} onOpenChange={(openDialog) => !openDialog && setDeleteTarget(null)}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Remove this task?</AlertDialogTitle><AlertDialogDescription>{deleteTarget?.status === "done" ? "It will be removed from this project’s history. You’ll have a few seconds to undo this." : "It will leave your active list. You’ll have a few seconds to undo this."}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Keep it</AlertDialogCancel><AlertDialogAction variant="destructive" onClick={remove}>Remove task</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
    <AlertDialog open={!!deleteNoteTarget} onOpenChange={(openDialog) => !openDialog && setDeleteNoteTarget(null)}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Delete this note?</AlertDialogTitle><AlertDialogDescription>This removes it permanently from the project history and Notes.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Keep it</AlertDialogCancel><AlertDialogAction variant="destructive" onClick={removeNote}>Delete note</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
    {editTarget && <EditTask key={editTarget.id} task={editTarget} projects={projects} onClose={() => setEditTarget(null)} onSave={async (data) => { await action("edit", editTarget.id, data); setEditTarget(null); }} />}
    {reviewTarget && <ReviewTask key={reviewTarget.id} task={reviewTarget} projectName={projectName(reviewTarget.projectId)} today={today} onClose={() => setReviewTarget(null)} onSave={(decision, note) => saveReview(reviewTarget, decision, note)} />}
    <Dialog open={quickCaptureOpen} onOpenChange={setQuickCaptureOpen}><DialogContent className="border-0 bg-transparent p-0 shadow-none sm:max-w-lg [&>button]:text-white"><DialogHeader className="sr-only"><DialogTitle>Quick add</DialogTitle><DialogDescription>Add a task or note from anywhere in Command Centre.</DialogDescription></DialogHeader>{quickCaptureOpen && <Capture projects={projects} defaultPlan={today} onSaved={load} />}</DialogContent></Dialog>
  </div>;
}

type Shared = { projects: Project[]; projectName: (id: string) => string; onAction: (action: string, id: number, extra?: Record<string, unknown>) => Promise<void>; onEdit: (task: Task) => void; onDelete: (task: Task) => void; onSaved: () => Promise<void> };

function Morning(props: Shared & { tasks: Task[]; chosenCount: number; staleTasks: Task[]; focus?: Task; loading: boolean; today: string; onLock: () => void; onReview: (task: Task) => void }) {
  const suggestedCount = Math.max(0, props.tasks.length - Math.min(props.chosenCount, 3));
  return <div className="grid gap-5 xl:grid-cols-[1.08fr_.92fr]">
    <div className="space-y-5"><Capture projects={props.projects} defaultPlan={props.today} onSaved={props.onSaved} /><section className="panel"><SectionHead eyebrow="Choose before you react" title="Your three for today" aside={props.chosenCount ? `${Math.min(props.chosenCount, 3)} chosen · ${suggestedCount} suggested` : "My recommendation"} />{props.loading ? <p className="empty">Finding the clearest shape for your day…</p> : props.tasks.length ? <div className="space-y-2">{props.tasks.map((task, index) => <PlanChoiceRow key={task.id} task={task} projectName={props.projectName} rank={index + 1} targetDate={props.today} targetLabel="Today" referenceDate={props.today} onAction={props.onAction} onEdit={props.onEdit} onDelete={props.onDelete} />)}</div> : <Empty text="Empty your head above. Your day will take shape here." />}{props.tasks.some((task) => task.plannedFor !== props.today) && <Button onClick={props.onLock} className="mt-4 w-full rounded-xl bg-[#171b21]">{props.chosenCount ? "Add suggestions to Today" : "Use these three today"}<CalendarCheck /></Button>}</section><NeedsDecision tasks={props.staleTasks} projectName={props.projectName} today={props.today} onReview={props.onReview} /></div>
    <div className="space-y-5"><FocusCard task={props.focus} projectName={props.projectName} today={props.today} onAction={props.onAction} /><Principle title="A good morning is a closed decision loop." text="Capture what is pulling at you, choose three meaningful outcomes, then begin before opening more inputs." /></div>
  </div>;
}

function Day(props: Shared & { priorityTasks: Task[]; suggestions: Task[]; queueTasks: Task[]; staleTasks: Task[]; doneCount: number; today: string; onReview: (task: Task) => void }) {
  const futureDates = props.queueTasks.map((task) => task.plannedFor).filter((date): date is string => !!date && date > props.today).sort();
  const nextDate = futureDates[0];
  const nextBatch = nextDate ? props.queueTasks.filter((task) => task.plannedFor === nextDate) : [];
  async function scheduleMany(items: Task[]) {
    await Promise.all(items.map((task) => post({ action: "schedule", id: task.id, plannedFor: props.today })));
    await props.onSaved();
  }
  return <div className="space-y-5">
    <PriorityList tasks={props.priorityTasks} suggestions={props.suggestions} nextBatch={nextBatch} nextDate={nextDate} today={props.today} projectName={props.projectName} onAction={props.onAction} onAddSuggestions={() => scheduleMany(props.suggestions)} onBringNext={() => scheduleMany(nextBatch)} />
    <GroupedQueue tasks={props.queueTasks} projects={props.projects} referenceDate={props.today} targetDate={props.today} targetLabel="Today" onAction={props.onAction} onEdit={props.onEdit} onDelete={props.onDelete} />
    <NeedsDecision tasks={props.staleTasks} projectName={props.projectName} today={props.today} onReview={props.onReview} />
    <div className="grid gap-5 md:grid-cols-2"><section className="panel"><SectionHead eyebrow="Momentum" title={`${props.doneCount} completed today`} /><p className="text-sm leading-6 text-zinc-500">The aim is not to clear your entire life. It is to keep promises, close loops and move the right work forward.</p></section><Principle title="New thought? Use the + button." text="Capture it without losing your place, then return to the priority already in front of you." /></div>
  </div>;
}

function GroupedQueue({ tasks, projects, referenceDate, targetDate, targetLabel, eyebrow = "Everything else", title = "Working queue", emptyText = "Your working queue is clear.", onAction, onEdit, onDelete }: { tasks: Task[]; projects: Project[]; referenceDate: string; targetDate: string; targetLabel: string; eyebrow?: string; title?: string; emptyText?: string } & Pick<Shared, "onAction" | "onEdit" | "onDelete">) {
  const groups = projects.map((project) => ({ project, tasks: tasks.filter((task) => task.projectId === project.id) })).filter((group) => group.tasks.length);
  return <section className="panel">
    <SectionHead eyebrow={eyebrow} title={title} aside={`${tasks.length} open`} />
    <p className="-mt-2 mb-5 text-sm leading-6 text-zinc-500">Organised by project. Swipe a task left or tap <span className="font-semibold text-violet-700">+ {targetLabel}</span> to move it to that priority list.</p>
    {groups.length ? <div className="space-y-6">{groups.map((group) => <div key={group.project.id}>
      <div className="mb-2 flex items-center justify-between"><div className="flex items-center gap-2"><span className={`size-2 rounded-full ${healthColour(group.project.health)}`} /><h3 className="font-semibold">{group.project.name}</h3></div><span className="text-xs text-zinc-400">{group.tasks.length}</span></div>
      <div className="space-y-2">{group.tasks.map((task) => <QueueTaskRow key={task.id} task={task} referenceDate={referenceDate} targetDate={targetDate} targetLabel={targetLabel} onAction={onAction} onEdit={onEdit} onDelete={onDelete} />)}</div>
    </div>)}</div> : <Empty text={emptyText} />}
  </section>;
}

function QueueTaskRow({ task, referenceDate, targetDate, targetLabel, onAction, onEdit, onDelete }: { task: Task; referenceDate: string; targetDate: string; targetLabel: string; onAction: Shared["onAction"]; onEdit: (task: Task) => void; onDelete: (task: Task) => void }) {
  const [offset, setOffset] = useState(0);
  const offsetRef = useRef(0);
  const touch = useRef<{ x: number; y: number; horizontal: boolean } | null>(null);
  const ignoreClickUntil = useRef(0);

  function touchStart(event: React.TouchEvent<HTMLDivElement>) {
    const point = event.touches[0];
    offsetRef.current = 0;
    setOffset(0);
    touch.current = { x: point.clientX, y: point.clientY, horizontal: false };
  }

  function touchMove(event: React.TouchEvent<HTMLDivElement>) {
    if (!touch.current) return;
    const point = event.touches[0];
    const distanceX = point.clientX - touch.current.x;
    const distanceY = point.clientY - touch.current.y;
    if (!touch.current.horizontal && Math.abs(distanceX) > 8 && Math.abs(distanceX) > Math.abs(distanceY) * 1.2) touch.current.horizontal = true;
    if (!touch.current.horizontal) return;
    event.preventDefault();
    const nextOffset = Math.max(-104, Math.min(0, distanceX));
    offsetRef.current = nextOffset;
    setOffset(nextOffset);
  }

  function touchEnd() {
    const shouldPlan = offsetRef.current <= -60;
    if (Math.abs(offsetRef.current) > 6) ignoreClickUntil.current = Date.now() + 500;
    offsetRef.current = 0;
    setOffset(0);
    touch.current = null;
    if (shouldPlan) void onAction("schedule", task.id, { plannedFor: targetDate });
  }

  function touchCancel() {
    offsetRef.current = 0;
    setOffset(0);
    touch.current = null;
  }

  return <div className="swipe-shell">
    <div className="swipe-action"><ArrowRight size={16} className="rotate-180" /><span>{targetLabel}</span></div>
    <div
      className="interactive-row swipe-card flex items-center gap-2 rounded-2xl border border-zinc-200 bg-white p-3"
      style={{ transform: `translateX(${offset}px)` }}
      onTouchStart={touchStart}
      onTouchMove={touchMove}
      onTouchEnd={touchEnd}
      onTouchCancel={touchCancel}
      onClickCapture={(event) => { if (Date.now() < ignoreClickUntil.current) { event.preventDefault(); event.stopPropagation(); } }}
    >
      <div className="min-w-0 flex-1"><p className="text-sm font-medium leading-5">{task.title}</p><div className="mt-1 flex flex-wrap gap-1.5 text-xs text-zinc-400"><span className={daysOpen(task, referenceDate) >= 7 ? "font-medium text-amber-600" : ""}>{taskAgeLabel(task, referenceDate)}</span>{task.plannedFor && <span>· {formatPlanDate(task.plannedFor, referenceDate)}</span>}{task.dueDate && <span className={task.dueDate <= referenceDate ? "text-red-500" : ""}>· Due {task.dueDate}</span>}{task.reviewState && ["blocked", "unclear", "avoiding"].includes(task.reviewState) && <span className="text-amber-600">· {reviewLabel(task.reviewState)}</span>}</div></div>
      <button onClick={() => onAction("schedule", task.id, { plannedFor: targetDate })} className="flex shrink-0 items-center gap-1 rounded-xl bg-violet-100 px-3 py-2 text-xs font-semibold text-violet-800 hover:bg-violet-600 hover:text-white"><Plus size={14} />{targetLabel}</button>
      <TaskMenu task={task} tomorrow={targetLabel === "Tomorrow" ? targetDate : undefined} onAction={onAction} onEdit={onEdit} onDelete={onDelete} />
    </div>
  </div>;
}

function CompletedToday({ tasks, projects, onAction }: { tasks: Task[]; projects: Project[]; onAction: Shared["onAction"] }) {
  const groups = projects.map((project) => ({ project, tasks: tasks.filter((task) => task.projectId === project.id).sort((a, b) => dateValue(b.completedAt) - dateValue(a.completedAt)) })).filter((group) => group.tasks.length);
  return <section className="panel"><SectionHead eyebrow="Today’s record" title="What you actually completed" aside={`${tasks.length} done`} />{groups.length ? <div className="space-y-5">{groups.map((group) => <div key={group.project.id}><div className="mb-2 flex items-center gap-2"><span className={`size-2 rounded-full ${healthColour(group.project.health)}`} /><h3 className="text-sm font-semibold">{group.project.name}</h3></div><div className="space-y-2">{group.tasks.map((task) => <div key={task.id} className="flex items-center gap-3 rounded-2xl border border-emerald-100 bg-emerald-50/70 p-3"><div className="grid size-7 shrink-0 place-items-center rounded-full bg-emerald-500 text-white"><Check size={14} /></div><div className="min-w-0 flex-1"><p className="text-sm font-medium leading-5 text-zinc-800">{task.title}</p><p className="mt-1 text-xs text-emerald-700/70">Completed {task.completedAt ? formatTime(task.completedAt) : "today"}</p></div><button onClick={() => onAction("toggle", task.id)} className="flex shrink-0 items-center gap-1 rounded-xl border border-emerald-200 bg-white px-3 py-2 text-xs font-semibold text-emerald-800 hover:bg-emerald-100" aria-label={`Put ${task.title} back on the to-do list`}><RotateCcw size={14} />Put back</button></div>)}</div></div>)}</div> : <Empty text="Nothing has been marked complete today yet. This record will fill as you close tasks." />}</section>;
}

function Evening(props: Shared & { tasks: Task[]; staleTasks: Task[]; tomorrowTasks: Task[]; done: Task[]; tomorrow: string; onReview: (task: Task) => void }) {
  const today = dateOffset(props.tomorrow, -1);
  const remaining = props.tasks.filter((task) => task.plannedFor !== props.tomorrow);
  return <div className="space-y-5">
    <section className="overflow-hidden rounded-[22px] bg-[#171b21] text-white"><div className="p-6"><p className="text-sm font-semibold text-[#b7a7ff]">Close the day</p><h2 className="mt-2 text-2xl font-semibold">{props.done.length ? `You completed ${props.done.length} ${props.done.length === 1 ? "thing" : "things"} today.` : "Today is ready to be closed."}</h2><p className="mt-2 text-sm leading-6 text-white/50">See the work you moved, then choose the few things tomorrow should inherit.</p></div></section>
    <div className="grid items-start gap-5 xl:grid-cols-[1.08fr_.92fr]">
      <CompletedToday tasks={props.done} projects={props.projects} onAction={props.onAction} />
      <section className="panel"><SectionHead eyebrow="Tomorrow" title="Your opening three" aside={`${props.tomorrowTasks.length}/3 chosen`} />{props.tomorrowTasks.length ? <div className="space-y-2">{props.tomorrowTasks.slice(0, 3).map((task, index) => <PlanChoiceRow key={task.id} task={task} projectName={props.projectName} rank={index + 1} targetDate={props.tomorrow} targetLabel="Tomorrow" referenceDate={today} onAction={props.onAction} onEdit={props.onEdit} onDelete={props.onDelete} />)}</div> : <p className="empty">Swipe left on an open loop, or tap “Tomorrow”, and it will appear here.</p>}{props.tomorrowTasks.length > 3 && <p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">You’ve chosen more than three. Trim this down so tomorrow stays believable.</p>}</section>
    </div>
    <GroupedQueue tasks={remaining} projects={props.projects} referenceDate={today} targetDate={props.tomorrow} targetLabel="Tomorrow" eyebrow="Open loops" title="What should tomorrow inherit?" emptyText="Everything unfinished has either been planned or cleared." onAction={props.onAction} onEdit={props.onEdit} onDelete={props.onDelete} />
    <NeedsDecision tasks={props.staleTasks} projectName={props.projectName} today={today} onReview={props.onReview} />
    <div className="grid gap-5 xl:grid-cols-[1.08fr_.92fr]"><Capture projects={props.projects} defaultPlan={props.tomorrow} compact onSaved={props.onSaved} /><Principle title="Your mind is allowed to stop now." text="Anything unfinished is either planned, deliberately left open, or no longer worth carrying." /></div>
  </div>;
}

function Capture({ projects, defaultPlan, compact = false, initialKind = "task", onSaved }: { projects: Project[]; defaultPlan: string; compact?: boolean; initialKind?: "task" | "note"; onSaved: () => Promise<void> }) {
  const [text, setText] = useState("");
  const [kind, setKind] = useState<"task" | "note">(initialKind);
  const [analysis, setAnalysis] = useState<Analysis>(null);
  const [projectId, setProjectId] = useState("");
  const [saving, setSaving] = useState(false);
  const [listening, setListening] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState<"idle" | "starting" | "listening" | "finishing" | "error">("idle");
  const [voiceMessage, setVoiceMessage] = useState<string | null>(null);
  const [saved, setSaved] = useState<CaptureResult>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const baseTextRef = useRef("");
  const finalSpeechRef = useRef("");
  const heardSpeechRef = useRef(false);
  const voiceErrorRef = useRef(false);
  const projectName = (id: string) => projects.find((project) => project.id === id)?.name || id;

  useEffect(() => () => recognitionRef.current?.abort?.(), []);

  async function review() {
    if (!text.trim()) return;
    setSaving(true);
    const response = await post({ action: "analyse", text });
    const data = await response.json();
    setAnalysis(data);
    setProjectId(data.projectId);
    setSaving(false);
  }

  async function save() {
    if (!text.trim() || !projectId) return;
    setSaving(true);
    const response = await post({ action: "capture", text, kind, projectId, plannedFor: kind === "task" && analysis?.priority === 5 ? defaultPlan : null });
    const data = await response.json();
    setSaved({ kind: data.kind, projectId: data.projectId, wantsEmail: analysis?.wantsEmail || false });
    setText("");
    setAnalysis(null);
    setProjectId("");
    setVoiceMessage(null);
    setSaving(false);
    await onSaved();
  }

  function listen() {
    if (recognitionRef.current && listening) {
      setVoiceStatus("finishing");
      recognitionRef.current.stop();
      return;
    }
    const speechWindow = window as typeof window & { SpeechRecognition?: SpeechConstructor; webkitSpeechRecognition?: SpeechConstructor };
    const Recognition = speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition;
    if (!Recognition) {
      setVoiceStatus("error");
      setVoiceMessage("Voice capture isn’t available here. Tap inside the box and use the microphone on your iPhone keyboard instead.");
      return;
    }
    const recognition = new Recognition();
    baseTextRef.current = text.trim();
    finalSpeechRef.current = "";
    heardSpeechRef.current = false;
    voiceErrorRef.current = false;
    setVoiceMessage(null);
    setVoiceStatus("starting");
    setListening(true);
    recognition.lang = navigator.language?.startsWith("en") ? navigator.language : "en-GB";
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognition.onstart = () => setVoiceStatus("listening");
    recognition.onresult = (event) => {
      heardSpeechRef.current = true;
      let interim = "";
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        const words = result[0]?.transcript?.trim() || "";
        if (!words) continue;
        if (result.isFinal) finalSpeechRef.current = `${finalSpeechRef.current} ${words}`.trim();
        else interim = `${interim} ${words}`.trim();
      }
      const spoken = `${finalSpeechRef.current} ${interim}`.trim();
      setText([baseTextRef.current, spoken].filter(Boolean).join(" "));
      setAnalysis(null);
    };
    recognition.onspeechend = () => { setVoiceStatus("finishing"); recognition.stop(); };
    recognition.onerror = (event) => { voiceErrorRef.current = true; setListening(false); setVoiceStatus("error"); setVoiceMessage(voiceErrorMessage(event.error)); };
    recognition.onend = () => {
      recognitionRef.current = null;
      setListening(false);
      if (voiceErrorRef.current) return;
      setVoiceStatus("idle");
      if (!heardSpeechRef.current) setVoiceMessage("I didn’t receive any words. On iPhone, tap inside the box and use the keyboard microphone — that dictation is more reliable.");
    };
    recognitionRef.current = recognition;
    try { recognition.start(); } catch { recognitionRef.current = null; setListening(false); setVoiceStatus("error"); setVoiceMessage("The microphone could not start. Tap inside the box and use the keyboard microphone instead."); }
  }

  const voiceActive = listening || voiceStatus === "starting" || voiceStatus === "finishing";
  const voiceCopy = voiceStatus === "starting" ? "Starting microphone…" : voiceStatus === "listening" ? "Listening — your words will appear as you speak. Tap stop when finished." : voiceStatus === "finishing" ? "Finishing your words…" : null;

  return <section className={`rounded-[22px] bg-[#191d23] text-white shadow-lg ${compact ? "p-5" : "p-5 sm:p-6"}`}><div className="mb-3 flex items-center justify-between"><div className="flex items-center gap-2 text-sm font-semibold text-[#b7a7ff]"><Brain size={18} />Capture what’s in your head</div>{saved && <button onClick={() => setSaved(null)} className="text-white/40" aria-label="Capture another"><X size={16} /></button>}</div>{!saved ? <><div className="relative"><Textarea value={text} onChange={(event) => { setText(event.target.value); setAnalysis(null); setVoiceMessage(null); }} placeholder={compact ? "New thought, task or note…" : "Type or speak freely. You’ll review it before anything is saved."} className={`${compact ? "min-h-20" : "min-h-28"} resize-none border-white/10 bg-white/[.07] px-4 py-4 pr-14 text-base leading-7 text-white placeholder:text-white/30`} /><button type="button" onClick={listen} aria-label={voiceActive ? "Stop recording" : "Record your thought"} className={`absolute bottom-3 right-3 grid size-10 place-items-center rounded-full transition ${voiceActive ? "bg-red-500 text-white" : "bg-white/10 hover:bg-white/20"}`}>{voiceActive ? <Square size={15} fill="currentColor" /> : <Mic size={18} />}</button></div>{(voiceCopy || voiceMessage) && <p aria-live="polite" className={`mt-2 text-sm leading-5 ${voiceMessage ? "text-amber-200" : "text-white/55"}`}>{voiceCopy || voiceMessage}</p>}<div className="mt-3 flex gap-2"><Choice active={kind === "task"} onClick={() => setKind("task")} icon={<ListTodo />}>To-do</Choice><Choice active={kind === "note"} onClick={() => setKind("note")} icon={<FileText />}>Note</Choice></div>{!analysis ? <div className="mt-4 flex items-center justify-between gap-3"><p className="hidden text-sm text-white/40 sm:block">Nothing is filed without your confirmation.</p><Button onClick={review} disabled={saving || !text.trim()} className="ml-auto rounded-xl bg-[#8065f3]">{saving ? "Thinking…" : "Review"}<ArrowRight /></Button></div> : <div className="mt-4 rounded-2xl border border-white/10 bg-white/[.06] p-4"><label className="mb-2 block text-sm text-white/60">Project {analysis.confidence === "low" && <span className="text-amber-300">— I’m unsure, please choose</span>}</label><div className="flex flex-col gap-3 sm:flex-row"><Select value={projectId} onValueChange={(value) => setProjectId(value || projectId)}><SelectTrigger className="flex-1 border-white/10 bg-white/10 text-white"><SelectValue /></SelectTrigger><SelectContent>{projects.map((project) => <SelectItem key={project.id} value={project.id}>{project.name}</SelectItem>)}</SelectContent></Select><Button onClick={save} disabled={saving || !projectId} className="rounded-xl bg-emerald-400 text-zinc-950 hover:bg-emerald-300">Save {kind}<Check /></Button></div><p className="mt-3 text-sm text-white/40">{analysis.reason} · {analysis.priority >= 5 ? "Urgent" : analysis.priority >= 4 ? "High priority" : "Normal priority"}</p></div>}</> : <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-4"><div className="flex items-center gap-2 text-sm"><Check size={17} className="text-emerald-400" />Saved to <b>{projectName(saved.projectId)}</b></div>{saved.wantsEmail && <div className="mt-3 border-t border-white/10 pt-3"><p className="flex items-center gap-2 text-sm"><Mail size={16} />Would drafting the message help close this now?</p><button onClick={() => navigator.clipboard.writeText("Draft an email based on my latest Command Centre task. Search Gmail for the recipient and relevant context, then create a draft for my approval. Do not send it.")} className="mt-3 rounded-lg bg-white/10 px-3 py-2 text-sm font-semibold hover:bg-white/20">Copy request for ChatGPT</button></div>}</div>}</section>;
}

function JarvisView({ projects, today, onSaved }: { projects: Project[]; today: string; onSaved: () => Promise<void> }) {
  const [messages, setMessages] = useState<JarvisMessage[]>([]);
  const [briefing, setBriefing] = useState<JarvisBriefing | null>(null);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [aiEnabled, setAiEnabled] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState<"idle" | "starting" | "listening" | "finishing" | "error">("idle");
  const [voiceMessage, setVoiceMessage] = useState<string | null>(null);
  const [realtimeAvailable, setRealtimeAvailable] = useState(false);
  const [realtimeStatus, setRealtimeStatus] = useState<RealtimeStatus>("idle");
  const [liveCaption, setLiveCaption] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const baseTextRef = useRef("");
  const finalSpeechRef = useRef("");
  const latestSpeechRef = useRef("");
  const heardSpeechRef = useRef(false);
  const voiceErrorRef = useRef(false);
  const threadRef = useRef<HTMLDivElement | null>(null);
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);
  const liveStreamRef = useRef<MediaStream | null>(null);
  const liveAudioRef = useRef<HTMLAudioElement | null>(null);
  const handledCallsRef = useRef(new Set<string>());
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/London";

  useEffect(() => {
    let active = true;
    Promise.all([
      fetch(`/api/jarvis?today=${encodeURIComponent(today)}&timezone=${encodeURIComponent(timezone)}`).then((response) => response.json()),
      fetch("/api/jarvis/realtime").then((response) => response.json()).catch(() => ({ available: false })),
    ])
      .then(([data, realtime]) => {
        if (!active) return;
        setMessages(data.messages || []);
        setBriefing(data.briefing || null);
        setAiEnabled(!!data.aiEnabled);
        setRealtimeAvailable(!!realtime.available);
        setLoading(false);
      })
      .catch(() => { if (active) { setError("Rich couldn’t load your Command Centre. Try again in a moment."); setLoading(false); } });
    return () => {
      active = false;
      recognitionRef.current?.abort?.();
      if (recorderRef.current?.state === "recording") recorderRef.current.stop();
      mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
      dataChannelRef.current?.close();
      peerRef.current?.close();
      liveStreamRef.current?.getTracks().forEach((track) => track.stop());
      if (liveAudioRef.current) liveAudioRef.current.srcObject = null;
    };
  }, [today, timezone]);

  useEffect(() => {
    const thread = threadRef.current;
    if (thread) thread.scrollTo({ top: thread.scrollHeight, behavior: "smooth" });
  }, [messages, sending]);

  async function ask(value = input) {
    const message = value.trim();
    if (!message || sending) return;
    setInput("");
    setError(null);
    setVoiceMessage(null);
    setSending(true);
    setMessages((current) => [...current, { id: -Date.now(), role: "user", content: message, proposal: null, actionStatus: null, createdAt: new Date().toISOString() }]);
    try {
      const response = await fetch("/api/jarvis", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message, today, timezone }) });
      const data = await response.json();
      if (data.messages) setMessages(data.messages);
      if (data.briefing) setBriefing(data.briefing);
      setAiEnabled(!!data.aiEnabled);
      if (!response.ok && !data.messages) setError(data.error || "Rich couldn’t answer that. Your dashboard was not changed.");
      if (data.refreshDashboard) await onSaved();
    } catch {
      setError("Rich lost the connection. Your dashboard was not changed — try sending that again.");
    } finally {
      setSending(false);
    }
  }

  function stopLiveVoice(nextStatus: RealtimeStatus = "idle") {
    dataChannelRef.current?.close();
    dataChannelRef.current = null;
    peerRef.current?.close();
    peerRef.current = null;
    liveStreamRef.current?.getTracks().forEach((track) => track.stop());
    liveStreamRef.current = null;
    if (liveAudioRef.current) liveAudioRef.current.srcObject = null;
    handledCallsRef.current.clear();
    setLiveCaption(null);
    setRealtimeStatus(nextStatus);
  }

  async function completeRealtimeTool(output: RealtimeOutput) {
    const callId = output.call_id;
    if (!callId || handledCallsRef.current.has(callId) || !dataChannelRef.current) return;
    handledCallsRef.current.add(callId);
    setRealtimeStatus("thinking");
    let message = "";
    try {
      const args = JSON.parse(output.arguments || "{}") as { message?: string };
      message = args.message?.trim() || "";
    } catch {
      message = "";
    }

    let spokenReply = "I didn’t catch that properly. Please say it again.";
    try {
      if (!message) throw new Error("Missing spoken request");
      const response = await fetch("/api/jarvis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, today, timezone }),
      });
      const data = await response.json();
      if (!response.ok && !data.messages) throw new Error(data.error || "Rich could not answer");
      if (data.messages) {
        setMessages(data.messages);
        const lastAssistant = [...data.messages].reverse().find((item: JarvisMessage) => item.role === "assistant");
        if (lastAssistant?.content) spokenReply = lastAssistant.content;
      }
      if (data.briefing) setBriefing(data.briefing);
      if (data.refreshDashboard) await onSaved();
    } catch {
      spokenReply = "I lost the dashboard connection for a moment. Nothing was changed. Please try that again.";
    }

    const channel = dataChannelRef.current;
    if (!channel || channel.readyState !== "open") return;
    channel.send(JSON.stringify({
      type: "conversation.item.create",
      item: { type: "function_call_output", call_id: callId, output: JSON.stringify({ reply: spokenReply }) },
    }));
    channel.send(JSON.stringify({
      type: "response.create",
      response: { instructions: "Speak the tool reply naturally and faithfully. Do not add facts or claim any further action." },
    }));
  }

  function handleRealtimeEvent(event: RealtimeEvent) {
    if (event.type === "input_audio_buffer.speech_started") {
      setRealtimeStatus("listening");
      setLiveCaption("Listening…");
    } else if (event.type === "input_audio_buffer.speech_stopped") {
      setRealtimeStatus("thinking");
      setLiveCaption("Thinking…");
    } else if (event.type === "conversation.item.input_audio_transcription.completed" && event.transcript) {
      setLiveCaption(`You: ${event.transcript}`);
    } else if (event.type === "response.output_audio.delta") {
      setRealtimeStatus("speaking");
    } else if (event.type === "response.output_audio_transcript.done" && event.transcript) {
      setLiveCaption(`Rich: ${event.transcript}`);
    } else if (event.type === "response.done") {
      const calls = event.response?.output?.filter((item) => item.type === "function_call" && item.name === "consult_command_centre") || [];
      if (calls.length) calls.forEach((call) => void completeRealtimeTool(call));
      else setRealtimeStatus("listening");
    } else if (event.type === "error") {
      setError(event.error?.message || "The live conversation hit a problem. End it and try again.");
      setRealtimeStatus("error");
    }
  }

  async function startLiveVoice() {
    if (realtimeStatus !== "idle" && realtimeStatus !== "error") {
      stopLiveVoice();
      return;
    }
    if (!realtimeAvailable) {
      setError("Live voice is built, but its secure OpenAI connection still needs to be switched on.");
      return;
    }
    setError(null);
    setLiveCaption("Starting a private voice session…");
    setRealtimeStatus("connecting");
    try {
      const peer = new RTCPeerConnection();
      peerRef.current = peer;
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      liveStreamRef.current = stream;
      stream.getTracks().forEach((track) => peer.addTrack(track, stream));

      peer.ontrack = (event) => {
        const audio = liveAudioRef.current;
        if (!audio) return;
        audio.srcObject = event.streams[0];
        void audio.play().catch(() => setError("Tap the screen once to allow Rich to speak."));
      };
      peer.onconnectionstatechange = () => {
        if (peer.connectionState === "failed") {
          setError("The live voice connection dropped. Please start it again.");
          stopLiveVoice("error");
        }
      };

      const channel = peer.createDataChannel("oai-events");
      dataChannelRef.current = channel;
      channel.onopen = () => {
        setRealtimeStatus("listening");
        setLiveCaption("I’m listening. Speak naturally.");
      };
      channel.onmessage = (messageEvent) => {
        try { handleRealtimeEvent(JSON.parse(messageEvent.data) as RealtimeEvent); } catch { /* Ignore malformed service events. */ }
      };
      channel.onerror = () => {
        setError("The live conversation connection failed. Please try again.");
        stopLiveVoice("error");
      };

      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      const response = await fetch("/api/jarvis/realtime", {
        method: "POST",
        headers: { "Content-Type": "application/sdp" },
        body: offer.sdp || "",
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(data.error || "Rich couldn’t start live voice.");
      }
      await peer.setRemoteDescription({ type: "answer", sdp: await response.text() });
    } catch (startError) {
      stopLiveVoice("error");
      setError(startError instanceof Error ? startError.message : "Rich couldn’t start live voice. Please try again.");
    }
  }

  async function recordWithServer() {
    try {
      baseTextRef.current = input.trim();
      audioChunksRef.current = [];
      setVoiceMessage(null);
      setVoiceStatus("starting");
      setListening(true);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      const preferred = ["audio/mp4", "audio/webm;codecs=opus", "audio/webm"].find((type) => MediaRecorder.isTypeSupported(type));
      const recorder = new MediaRecorder(stream, preferred ? { mimeType: preferred } : undefined);
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => { if (event.data.size) audioChunksRef.current.push(event.data); };
      recorder.onstart = () => setVoiceStatus("listening");
      recorder.onerror = () => { setListening(false); setVoiceStatus("error"); setVoiceMessage("The recording stopped unexpectedly. Check microphone access and try again."); };
      recorder.onstop = async () => {
        recorderRef.current = null;
        setVoiceStatus("finishing");
        stream.getTracks().forEach((track) => track.stop());
        mediaStreamRef.current = null;
        const blob = new Blob(audioChunksRef.current, { type: recorder.mimeType || "audio/webm" });
        audioChunksRef.current = [];
        try {
          const form = new FormData();
          form.append("audio", blob, recorder.mimeType.includes("mp4") ? "thought.m4a" : "thought.webm");
          const response = await fetch("/api/jarvis/transcribe", { method: "POST", body: form });
          const data = await response.json();
          if (!response.ok || !data.text) throw new Error(data.error || "No transcript");
          const transcript = [baseTextRef.current, String(data.text).trim()].filter(Boolean).join(" ");
          setInput(transcript);
          setVoiceStatus("idle");
          if (messages.some((message) => message.actionStatus === "pending") && /^(yes|yes please|yep|yeah|do it|go ahead|confirm|no|no thanks|cancel)[.!]?$/i.test(String(data.text).trim())) void ask(String(data.text).trim());
        } catch (recordingError) {
          setVoiceStatus("error");
          setVoiceMessage(recordingError instanceof Error ? recordingError.message : "I couldn’t turn that recording into text. Try again.");
        } finally {
          setListening(false);
        }
      };
      recorder.start();
    } catch {
      mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
      recorderRef.current = null;
      setListening(false);
      setVoiceStatus("error");
      setVoiceMessage("Microphone access was denied. Allow it in iPhone Settings, or use the keyboard microphone.");
    }
  }

  function listen() {
    if (recorderRef.current?.state === "recording") {
      setVoiceStatus("finishing");
      recorderRef.current.stop();
      return;
    }
    if (recognitionRef.current && listening) {
      setVoiceStatus("finishing");
      recognitionRef.current.stop();
      return;
    }
    if (aiEnabled && typeof MediaRecorder !== "undefined" && !!navigator.mediaDevices?.getUserMedia) {
      void recordWithServer();
      return;
    }
    const speechWindow = window as typeof window & { SpeechRecognition?: SpeechConstructor; webkitSpeechRecognition?: SpeechConstructor };
    const Recognition = speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition;
    if (!Recognition) {
      setVoiceStatus("error");
      setVoiceMessage("Voice isn’t available here. Tap the box and use the microphone on your iPhone keyboard instead.");
      return;
    }
    const recognition = new Recognition();
    baseTextRef.current = input.trim();
    finalSpeechRef.current = "";
    latestSpeechRef.current = "";
    heardSpeechRef.current = false;
    voiceErrorRef.current = false;
    setVoiceMessage(null);
    setVoiceStatus("starting");
    setListening(true);
    recognition.lang = navigator.language?.startsWith("en") ? navigator.language : "en-GB";
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognition.onstart = () => setVoiceStatus("listening");
    recognition.onresult = (event) => {
      heardSpeechRef.current = true;
      let interim = "";
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        const words = result[0]?.transcript?.trim() || "";
        if (!words) continue;
        if (result.isFinal) finalSpeechRef.current = `${finalSpeechRef.current} ${words}`.trim();
        else interim = `${interim} ${words}`.trim();
      }
      const transcript = [baseTextRef.current, finalSpeechRef.current, interim].filter(Boolean).join(" ");
      latestSpeechRef.current = transcript;
      setInput(transcript);
    };
    recognition.onspeechend = () => { setVoiceStatus("finishing"); recognition.stop(); };
    recognition.onerror = (event) => { voiceErrorRef.current = true; setListening(false); setVoiceStatus("error"); setVoiceMessage(voiceErrorMessage(event.error)); };
    recognition.onend = () => {
      recognitionRef.current = null;
      setListening(false);
      if (voiceErrorRef.current) return;
      setVoiceStatus("idle");
      if (!heardSpeechRef.current) setVoiceMessage("I didn’t receive any words. Tap the box and use the iPhone keyboard microphone instead.");
      else if (messages.some((message) => message.actionStatus === "pending") && /^(yes|yes please|yep|yeah|do it|go ahead|confirm|no|no thanks|cancel)[.!]?$/i.test(latestSpeechRef.current.trim())) void ask(latestSpeechRef.current);
    };
    recognitionRef.current = recognition;
    try { recognition.start(); } catch { recognitionRef.current = null; setListening(false); setVoiceStatus("error"); setVoiceMessage("The microphone could not start. Use the microphone on your iPhone keyboard instead."); }
  }

  const voiceActive = listening || voiceStatus === "starting" || voiceStatus === "finishing";
  const voiceCopy = voiceStatus === "starting" ? "Starting microphone…" : voiceStatus === "listening" ? "Listening — speak naturally, then tap stop." : voiceStatus === "finishing" ? "Finishing your words…" : null;
  const visibleMessages = messages.length ? messages : [{ id: 0, role: "assistant" as const, content: "I’m ready. Ask what’s on today, request a recap, or tell me what you want changed. I’ll always ask before I act.", proposal: null, actionStatus: null, createdAt: new Date().toISOString() }];
  const liveActive = realtimeStatus !== "idle" && realtimeStatus !== "error";
  const realtimeLabel = realtimeStatus === "connecting" ? "Connecting…" : realtimeStatus === "listening" ? "Listening" : realtimeStatus === "thinking" ? "Thinking" : realtimeStatus === "speaking" ? "Speaking" : realtimeStatus === "error" ? "Try again" : "Start voice";

  return <div className="grid items-start gap-5 xl:grid-cols-[1.3fr_.7fr]">
    <section className="overflow-hidden rounded-[24px] border border-zinc-200 bg-white shadow-[0_10px_35px_rgba(26,20,54,.08)]">
      <div className="relative overflow-hidden bg-[#171b21] p-5 text-white sm:p-6">
        <div className="jarvis-glow" />
        <div className="relative flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3">
            <div className="jarvis-orb grid size-11 shrink-0 place-items-center rounded-2xl bg-[#7659e8] text-white"><Brain size={21} /></div>
            <div><p className="text-xs font-semibold uppercase tracking-[.16em] text-[#b9a9ff]">Live briefing</p><h2 className="mt-1 text-2xl font-semibold">{briefing?.headline || "Reading your Command Centre…"}</h2><p className="mt-2 max-w-xl text-sm leading-6 text-white/55">{briefing?.detail || "Your current priorities, recent work and project context are loading."}</p></div>
          </div>
          <span className={`hidden shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold sm:block ${aiEnabled ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-300" : "border-amber-300/20 bg-amber-300/10 text-amber-200"}`}>{aiEnabled ? "AI connected" : "Core mode"}</span>
        </div>
        {briefing?.focus && <div className="relative mt-5 rounded-2xl border border-white/10 bg-white/[.06] p-4"><p className="text-[11px] font-semibold uppercase tracking-[.15em] text-white/40">Strongest move now</p><p className="mt-1 font-semibold leading-6">{briefing.focus.title}</p><p className="mt-1 text-xs leading-5 text-white/45">{briefing.focus.projectName} · {briefing.focus.reason}</p></div>}
        <div className={`relative mt-4 overflow-hidden rounded-2xl border p-4 transition ${liveActive ? "border-violet-300/40 bg-violet-400/15" : "border-white/10 bg-white/[.05]"}`}>
          <div className="flex items-center gap-3">
            <div className={`grid size-11 shrink-0 place-items-center rounded-full transition ${liveActive ? "bg-emerald-400 text-zinc-950 shadow-[0_0_28px_rgba(52,211,153,.35)]" : "bg-white/10 text-white/70"}`}>{liveActive ? <AudioLines className={realtimeStatus === "speaking" || realtimeStatus === "listening" ? "animate-pulse" : ""} size={20} /> : <PhoneCall size={19} />}</div>
            <div className="min-w-0 flex-1"><p className="text-sm font-semibold">Live conversation</p><p className="mt-0.5 truncate text-xs text-white/45">{liveCaption || (realtimeAvailable ? "One tap, then talk naturally. Interrupt whenever you need." : "Ready to activate once the secure voice connection is added.")}</p></div>
            <Button type="button" onClick={() => void startLiveVoice()} disabled={realtimeStatus === "connecting"} className={`shrink-0 rounded-xl ${liveActive ? "bg-red-500 text-white hover:bg-red-400" : "bg-white text-zinc-950 hover:bg-violet-100"}`}>{liveActive ? <Square size={14} fill="currentColor" /> : <Mic size={16} />}{liveActive ? "End" : realtimeLabel}</Button>
          </div>
          {liveActive && <div className="mt-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[.13em] text-emerald-300"><span className="size-2 animate-pulse rounded-full bg-emerald-400" />{realtimeLabel} · say “yes” to confirm actions</div>}
          <audio ref={liveAudioRef} autoPlay playsInline className="hidden" />
        </div>
      </div>

      <div className="border-b border-zinc-100 px-4 py-3 sm:px-5">
        <div className="scrollbar-none flex gap-2 overflow-x-auto">
          {["What’s on today?", "Recap yesterday", "What should I do next?", "What have I been avoiding?"].map((prompt) => <button key={prompt} onClick={() => ask(prompt)} disabled={sending} className="shrink-0 rounded-full border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs font-semibold text-zinc-600 transition hover:border-violet-300 hover:bg-violet-50 hover:text-violet-800 disabled:opacity-50">{prompt}</button>)}
        </div>
      </div>

      <div ref={threadRef} className="scrollbar-thin min-h-[310px] max-h-[52vh] space-y-4 overflow-y-auto bg-[#f7f7f9] p-4 sm:min-h-[390px] sm:p-5" aria-live="polite">
        {loading ? <div className="flex items-center gap-2 text-sm text-zinc-400"><span className="jarvis-thinking"><i /><i /><i /></span>Reading your dashboard…</div> : visibleMessages.map((message) => <div key={message.id} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
          <div className={`max-w-[92%] sm:max-w-[82%] ${message.role === "user" ? "rounded-[20px_20px_6px_20px] bg-[#7659e8] px-4 py-3 text-white" : "w-full"}`}>
            {message.role === "assistant" ? <div className="flex items-start gap-2.5"><div className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-xl bg-[#ebe6ff] text-[#6b4ddb]"><Sparkles size={14} /></div><div className="min-w-0 flex-1"><div className="rounded-[6px_20px_20px_20px] border border-zinc-200 bg-white px-4 py-3 shadow-sm"><p className="whitespace-pre-wrap text-sm leading-6 text-zinc-700">{message.content}</p></div>{message.proposal && <JarvisActionCard messageId={message.id} action={message.proposal} status={message.actionStatus} projects={projects} onReply={ask} />}</div></div> : <p className="whitespace-pre-wrap text-sm leading-6">{message.content}</p>}
          </div>
        </div>)}
        {sending && <div className="flex items-center gap-2 text-sm text-zinc-400"><span className="jarvis-thinking"><i /><i /><i /></span>Rich is thinking…</div>}
      </div>

      <form onSubmit={(event) => { event.preventDefault(); void ask(); }} className="border-t border-zinc-200 bg-white p-3 sm:p-4">
        <div className="relative rounded-2xl border border-zinc-200 bg-white shadow-sm focus-within:border-violet-400 focus-within:ring-4 focus-within:ring-violet-100">
          <Textarea value={input} onChange={(event) => { setInput(event.target.value); setVoiceMessage(null); }} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void ask(); } }} placeholder="Ask anything, or tell Rich what to change…" className="min-h-24 resize-none border-0 bg-transparent px-4 py-3 pr-24 text-base leading-6 shadow-none focus-visible:ring-0" />
          <div className="absolute bottom-2 right-2 flex gap-1.5"><button type="button" onClick={listen} aria-label={voiceActive ? "Stop recording" : "Speak to Rich"} className={`grid size-10 place-items-center rounded-xl transition ${voiceActive ? "bg-red-500 text-white" : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"}`}>{voiceActive ? <Square size={14} fill="currentColor" /> : <Mic size={18} />}</button><button type="submit" disabled={!input.trim() || sending} aria-label="Send to Rich" className="grid size-10 place-items-center rounded-xl bg-[#171b21] text-white transition hover:bg-[#7659e8] disabled:cursor-not-allowed disabled:opacity-30"><Send size={17} /></button></div>
        </div>
        {(voiceCopy || voiceMessage || error) && <p className={`mt-2 text-sm leading-5 ${error || voiceMessage ? "text-amber-700" : "text-zinc-400"}`}>{error || voiceMessage || voiceCopy}</p>}
        <p className="mt-2 text-center text-xs text-zinc-400">If Rich proposes a change, reply <b className="text-zinc-600">yes</b> to do it or <b className="text-zinc-600">no</b> to leave things as they are.</p>
      </form>
    </section>

    <aside className="space-y-5">
      <section className="panel"><SectionHead eyebrow="Current state" title="What Rich can see" /><div className="grid grid-cols-3 divide-x divide-zinc-100 rounded-2xl bg-zinc-50 py-4 text-center"><Metric value={briefing?.todayCount ?? "—"} label="Today" /><Metric value={briefing?.doneToday ?? "—"} label="Done" /><Metric value={briefing?.openCount ?? "—"} label="Open" /></div><p className="mt-4 text-sm leading-6 text-zinc-500">Your project outcomes, current phases, roadmaps, tasks, task age, completion history and notes. That context is what makes the advice specific to you.</p></section>
      <section className="rounded-[22px] border border-violet-200 bg-[#eeeaff] p-5"><div className="flex items-center gap-2 font-semibold text-[#342267]"><Check size={17} />You stay in control</div><p className="mt-2 text-sm leading-6 text-[#5e5180]">Rich can think and draft freely. It only writes to Command Centre after you say yes. If the project is unclear, it asks.</p></section>
      {!aiEnabled && <section className="rounded-[22px] border border-amber-200 bg-amber-50 p-5"><p className="font-semibold text-amber-900">Core briefings are ready</p><p className="mt-2 text-sm leading-6 text-amber-900/65">Agenda, yesterday’s recap, next-action advice and confirmations work now. The secure AI connection is still needed for open-ended planning and richer email writing.</p></section>}
    </aside>
  </div>;
}

function JarvisActionCard({ messageId, action, status, projects, onReply }: { messageId: number; action: JarvisAction; status: string | null; projects: Project[]; onReply: (message: string) => Promise<void> }) {
  const project = projects.find((item) => item.id === action.projectId)?.name;
  const pending = status === "pending";
  const completed = status === "completed";
  const cancelled = status === "cancelled" || status === "superseded";
  const label = action.type === "add_task" ? "Add to to-do list" : action.type === "add_priority" || action.type === "prioritise_task" ? "Move to Today" : action.type === "complete_task" ? "Mark complete" : action.type === "add_note" ? "Save project note" : action.type === "draft_email" ? "Email draft" : "Apple Calendar event";
  const completedLabel = action.type === "draft_email" || action.type === "calendar_event" ? "Ready" : "Done";
  return <div className={`mt-2 overflow-hidden rounded-2xl border bg-white shadow-sm ${pending ? "border-violet-200" : completed ? "border-emerald-200" : "border-zinc-200 opacity-70"}`}>
    <div className={`flex items-center justify-between gap-3 px-4 py-3 ${pending ? "bg-violet-50" : completed ? "bg-emerald-50" : "bg-zinc-50"}`}><div><p className="text-[11px] font-semibold uppercase tracking-[.14em] text-zinc-400">{label}</p><p className="mt-0.5 text-sm font-semibold text-zinc-800">{action.summary}</p></div><span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${pending ? "bg-violet-600 text-white" : completed ? "bg-emerald-600 text-white" : "bg-zinc-200 text-zinc-600"}`}>{pending ? "Waiting" : completed ? completedLabel : "Cancelled"}</span></div>
    <div className="space-y-3 p-4">
      {(action.title || project) && action.type !== "draft_email" && <div><p className="text-sm font-medium leading-6 text-zinc-800">{action.title}</p>{project && <p className="mt-0.5 text-xs text-violet-700">{project}</p>}</div>}
      {action.type === "draft_email" && <div className="space-y-2"><div className="grid gap-1 text-xs text-zinc-500"><p><b className="text-zinc-700">To:</b> {action.recipientName}{action.recipientEmail ? ` <${action.recipientEmail}>` : ""}</p><p><b className="text-zinc-700">Subject:</b> {action.subject}</p></div><div className="max-h-64 overflow-y-auto whitespace-pre-wrap rounded-xl bg-zinc-50 p-3 text-sm leading-6 text-zinc-700">{action.body}</div></div>}
      {action.type === "calendar_event" && <div className="rounded-xl bg-zinc-50 p-3 text-sm leading-6 text-zinc-700"><p className="font-semibold">{action.title}</p><p>{action.start ? formatCalendarDate(action.start) : "Time to confirm"}{action.end ? ` – ${formatCalendarTime(action.end)}` : ""}</p>{action.location && <p className="text-zinc-500">{action.location}</p>}</div>}
      {pending && <div><p className="mb-3 text-xs text-zinc-500">Say <b>yes</b> to confirm or <b>no</b> to cancel. You can also use these buttons.</p><div className="grid grid-cols-2 gap-2"><Button onClick={() => void onReply("no")} variant="outline" className="rounded-xl">No, leave it</Button><Button onClick={() => void onReply("yes")} className="rounded-xl bg-[#7659e8] hover:bg-[#684bd5]">Yes, do it<Check /></Button></div></div>}
      {completed && action.type === "draft_email" && <div className="grid gap-2 sm:grid-cols-2"><Button type="button" variant="outline" className="rounded-xl" onClick={() => navigator.clipboard.writeText(`Subject: ${action.subject || ""}\n\n${action.body || ""}`)}><Copy />Copy draft</Button><Button asChild className="rounded-xl bg-[#171b21]"><a href={emailHref(action)}><Mail />Open in Mail</a></Button></div>}
      {completed && action.type === "calendar_event" && <Button asChild className="w-full rounded-xl bg-[#171b21]"><a href={`/api/jarvis/calendar?id=${messageId}`}><CalendarCheck />Add to Apple Calendar</a></Button>}
      {cancelled && <p className="text-xs text-zinc-400">Nothing was changed.</p>}
    </div>
  </div>;
}

function NeedsDecision({ tasks, projectName, today, onReview }: { tasks: Task[]; projectName: (id: string) => string; today: string; onReview: (task: Task) => void }) {
  if (!tasks.length) return null;
  return <section className="rounded-[22px] border border-amber-200 bg-amber-50 p-5 sm:p-6"><div className="mb-4 flex items-start gap-3"><div className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl bg-amber-100 text-amber-700"><AlertCircle size={19} /></div><div><p className="text-xs font-semibold uppercase tracking-[.15em] text-amber-700">Needs a decision</p><h2 className="mt-1 text-xl font-semibold">Don’t let old tasks become background guilt.</h2><p className="mt-1 text-sm leading-6 text-amber-900/65">I won’t guess that these are urgent — or that you’re avoiding them. They’ve simply been open for a while, so tell me what is true.</p></div></div><div className="space-y-2">{tasks.map((task) => <div key={task.id} className="flex items-center gap-3 rounded-2xl border border-amber-200/70 bg-white p-3"><Clock3 size={17} className="shrink-0 text-amber-600" /><div className="min-w-0 flex-1"><p className="font-medium leading-6">{task.title}</p><p className="text-xs text-zinc-400">{projectName(task.projectId)} · open {daysOpen(task, today)} days</p></div><Button size="sm" variant="outline" className="shrink-0 rounded-xl" onClick={() => onReview(task)}>Review</Button></div>)}</div></section>;
}

function ReviewTask({ task, projectName, today, onClose, onSave }: { task: Task; projectName: string; today: string; onClose: () => void; onSave: (decision: ReviewDecision, note: string) => Promise<void> }) {
  const [decision, setDecision] = useState<ReviewDecision | null>(null);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const options: { value: ReviewDecision; label: string; description: string }[] = [
    { value: "today", label: "Do it today", description: "Commit it to today’s list." },
    { value: "keep", label: "Still matters", description: "Keep it open and check again later." },
    { value: "avoiding", label: "I’m avoiding it", description: "Keep it visible without pretending otherwise." },
    { value: "blocked", label: "It’s blocked", description: "Lower it until the blocker changes." },
    { value: "unclear", label: "It’s unclear", description: "The next action needs rewriting." },
    { value: "drop", label: "No longer needed", description: "Remove it from the active list." },
  ];
  const wantsNote = decision === "avoiding" || decision === "blocked" || decision === "unclear";
  return <Dialog open onOpenChange={(openDialog) => !openDialog && onClose()}><DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-xl"><DialogHeader><DialogTitle>What is true about this task now?</DialogTitle><DialogDescription>{projectName} · open {daysOpen(task, today)} days<br />“{task.title}”</DialogDescription></DialogHeader><div className="grid gap-2 sm:grid-cols-2">{options.map((option) => <button key={option.value} onClick={() => setDecision(option.value)} className={`rounded-2xl border p-4 text-left transition ${decision === option.value ? "border-violet-500 bg-violet-50 ring-2 ring-violet-100" : "border-zinc-200 hover:border-zinc-300"}`}><p className="font-semibold">{option.label}</p><p className="mt-1 text-sm leading-5 text-zinc-500">{option.description}</p></button>)}</div>{wantsNote && <Textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder={decision === "blocked" ? "What are you waiting for? (optional)" : decision === "avoiding" ? "What makes this hard to start? (optional)" : "What needs to become clearer? (optional)"} className="min-h-24" />}<Button disabled={!decision || saving} className="w-full rounded-xl" onClick={async () => { if (!decision) return; setSaving(true); await onSave(decision, note); }}>{saving ? "Saving…" : "Save decision"}</Button></DialogContent></Dialog>;
}

function ProgressView({ projects, tasks, notes, today }: { projects: Project[]; tasks: Task[]; notes: Note[]; today: string }) {
  const [weekOffset, setWeekOffset] = useState(0);
  const [copied, setCopied] = useState(false);
  const currentWeek = weekStartFor(today);
  const start = dateOffset(currentWeek, weekOffset * 7);
  const end = dateOffset(start, 6);
  const completed = tasks
    .filter((task) => task.status === "done" && task.completedAt && dateBetween(localDate(new Date(task.completedAt)), start, end))
    .sort((a, b) => dateValue(b.completedAt) - dateValue(a.completedAt));
  const captured = notes
    .filter((note) => dateBetween(localDate(new Date(note.createdAt)), start, end))
    .sort((a, b) => dateValue(b.createdAt) - dateValue(a.createdAt));
  const groups = projects
    .map((project) => ({ project, tasks: completed.filter((task) => task.projectId === project.id), notes: captured.filter((note) => note.projectId === project.id) }))
    .filter((group) => group.tasks.length || group.notes.length)
    .sort((a, b) => (b.tasks.length + b.notes.length) - (a.tasks.length + a.notes.length));
  const activeProjects = groups.length;
  const strongest = groups[0];
  const days = Array.from({ length: 7 }, (_, index) => dateOffset(start, index));
  const periodName = weekOffset === 0 ? "This week" : weekOffset === -1 ? "Last week" : weekRangeLabel(start, end);
  const recap = weeklyRecapText(periodName, start, end, groups, projects);

  async function copyRecap() {
    await navigator.clipboard.writeText(recap);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return <div className="space-y-5">
    <section className="overflow-hidden rounded-[24px] bg-[#171b21] text-white shadow-[0_12px_36px_rgba(26,20,54,.12)]">
      <div className="relative p-5 sm:p-7">
        <div className="jarvis-glow" />
        <div className="relative flex items-start justify-between gap-4">
          <div><p className="text-xs font-semibold uppercase tracking-[.16em] text-[#b9a9ff]">Weekly reflection</p><h2 className="mt-2 text-2xl font-semibold sm:text-3xl">{periodName}</h2><p className="mt-2 text-sm text-white/50">{weekRangeLabel(start, end)}</p></div>
          <div className="flex shrink-0 gap-2"><button onClick={() => setWeekOffset((value) => value - 1)} aria-label="Previous week" className="grid size-10 place-items-center rounded-xl bg-white/10 text-white/75 transition hover:bg-white/20"><ChevronLeft size={19} /></button><button onClick={() => setWeekOffset((value) => Math.min(0, value + 1))} disabled={weekOffset === 0} aria-label="Next week" className="grid size-10 place-items-center rounded-xl bg-white/10 text-white/75 transition hover:bg-white/20 disabled:opacity-25"><ChevronRight size={19} /></button></div>
        </div>
        <p className="relative mt-6 max-w-3xl text-lg leading-8 text-white/85">{completed.length ? <>You completed <b className="text-white">{completed.length} thing{completed.length === 1 ? "" : "s"}</b> across <b className="text-white">{activeProjects} project{activeProjects === 1 ? "" : "s"}</b>{captured.length ? <> and captured <b className="text-white">{captured.length} note{captured.length === 1 ? "" : "s"}</b></> : ""}. {strongest ? `${strongest.project.name} had the most movement.` : ""}</> : captured.length ? <>You captured <b className="text-white">{captured.length} note{captured.length === 1 ? "" : "s"}</b>, but no tasks were marked complete.</> : "Nothing has been recorded for this week yet."}</p>
      </div>
      <div className="grid grid-cols-3 divide-x divide-white/10 border-t border-white/10 bg-white/[.035] py-5 text-center">{[[completed.length, "Completed"], [activeProjects, "Projects moved"], [captured.length, "Notes captured"]].map(([value, label]) => <div key={label}><p className="text-xl font-semibold text-white">{value}</p><p className="mt-1 text-[11px] text-white/40">{label}</p></div>)}</div>
    </section>

    <section className="panel">
      <SectionHead eyebrow="The shape of the week" title="Day by day" aside={`${completed.length + captured.length} recorded`} />
      <div className="grid grid-cols-7 gap-1.5 sm:gap-3">{days.map((date) => {
        const done = completed.filter((task) => task.completedAt && localDate(new Date(task.completedAt)) === date).length;
        const dayNotes = captured.filter((note) => localDate(new Date(note.createdAt)) === date).length;
        const total = done + dayNotes;
        const isToday = date === today;
        return <div key={date} className={`rounded-2xl border px-1.5 py-3 text-center sm:px-3 ${isToday ? "border-violet-300 bg-violet-50" : "border-zinc-100 bg-zinc-50/60"}`}><p className="text-[11px] font-semibold uppercase text-zinc-400">{new Intl.DateTimeFormat("en-GB", { weekday: "narrow" }).format(new Date(`${date}T12:00:00`))}</p><p className="mt-1 text-sm font-semibold text-zinc-700">{new Date(`${date}T12:00:00`).getDate()}</p><div className={`mx-auto mt-2 grid size-7 place-items-center rounded-full text-xs font-semibold ${total ? "bg-emerald-500 text-white" : "bg-zinc-200 text-zinc-400"}`}>{total}</div></div>;
      })}</div>
    </section>

    {groups.length ? <div className="grid items-start gap-4 xl:grid-cols-2">{groups.map((group) => <section key={group.project.id} className="panel">
      <div className="mb-4 flex items-start justify-between gap-3"><div className="flex items-center gap-3"><span className={`mt-1 size-2.5 rounded-full ${healthColour(group.project.health)}`} /><div><h3 className="text-lg font-semibold">{group.project.name}</h3><p className="mt-1 text-sm text-zinc-400">{group.tasks.length} completed · {group.notes.length} note{group.notes.length === 1 ? "" : "s"}</p></div></div>{group.tasks.length > 0 && <span className="grid size-9 place-items-center rounded-xl bg-emerald-50 text-emerald-600"><Trophy size={17} /></span>}</div>
      <div className="space-y-2">{group.tasks.map((task) => <div key={task.id} className="flex items-start gap-3 rounded-2xl border border-emerald-100 bg-emerald-50/60 p-3"><span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-emerald-500 text-white"><Check size={13} /></span><div><p className="text-sm font-medium leading-5 text-zinc-800">{task.title}</p><p className="mt-1 text-xs text-emerald-700/65">{task.completedAt ? formatDayAndTime(task.completedAt) : "Completed"}</p></div></div>)}{group.notes.map((note) => <div key={note.id} className="flex items-start gap-3 rounded-2xl border border-violet-100 bg-violet-50/50 p-3"><FileText size={16} className="mt-0.5 shrink-0 text-violet-500" /><div><p className="line-clamp-3 whitespace-pre-wrap text-sm leading-5 text-zinc-700">{note.content}</p><p className="mt-1 text-xs text-violet-600/60">Captured {formatDate(note.createdAt)}</p></div></div>)}</div>
    </section>)}</div> : <section className="panel"><Empty text="There is no recorded activity in this week. Move back a week, or start completing and capturing work to build your record." /></section>}

    <section className="rounded-[22px] border border-violet-200 bg-[#eeeaff] p-5 sm:p-6"><div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-xs font-semibold uppercase tracking-[.15em] text-violet-600">For your journal</p><h2 className="mt-1 text-xl font-semibold text-[#342267]">Take the week with you</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-[#5e5180]">Copy a factual recap of what moved, organised by project. It only includes work you actually marked complete and notes you actually captured.</p></div><Button onClick={copyRecap} className="shrink-0 rounded-xl bg-[#7659e8] hover:bg-[#684bd5]"><Copy />{copied ? "Copied" : "Copy weekly recap"}</Button></div></section>
  </div>;
}

function weeklyRecapText(periodName: string, start: string, end: string, groups: Array<{ project: Project; tasks: Task[]; notes: Note[] }>, projects: Project[]) {
  const heading = `${periodName} — ${weekRangeLabel(start, end)}`;
  const lines = groups.flatMap((group) => ["", group.project.name, ...group.tasks.map((task) => `• Completed: ${task.title}`), ...group.notes.map((note) => `• Note: ${note.content}`)]);
  const quiet = projects.filter((project) => !groups.some((group) => group.project.id === project.id)).map((project) => project.name);
  return [heading, ...lines, quiet.length ? `\nNo recorded movement: ${quiet.join(", ")}` : ""].filter(Boolean).join("\n");
}

function ProjectsView(props: Shared & { tasks: Task[]; notes: Note[]; today: string; onDeleteNote: (note: Note) => void }) {
  const [historyProjectId, setHistoryProjectId] = useState<string | null>(null);
  const selected = historyProjectId ? props.projects.find((project) => project.id === historyProjectId) : undefined;
  const openTasks = props.tasks.filter((task) => task.status === "open");
  const priorityTasks = openTasks.filter((task) => task.plannedFor === props.today).sort((a, b) => taskScore(b, props.projects, props.today) - taskScore(a, props.projects, props.today));
  const suggestions = openTasks.filter((task) => !task.plannedFor && !needsReview(task, props.today)).sort((a, b) => taskScore(b, props.projects, props.today) - taskScore(a, props.projects, props.today)).slice(0, Math.max(0, 3 - priorityTasks.length));
  const futureDates = openTasks.map((task) => task.plannedFor).filter((date): date is string => !!date && date > props.today).sort();
  const nextDate = futureDates[0];
  const nextBatch = nextDate ? openTasks.filter((task) => task.plannedFor === nextDate) : [];

  async function scheduleMany(items: Task[], plannedFor: string) {
    await Promise.all(items.map((task) => post({ action: "schedule", id: task.id, plannedFor })));
    await props.onSaved();
  }

  return <div className="space-y-5">
    <PriorityList tasks={priorityTasks} suggestions={suggestions} nextBatch={nextBatch} nextDate={nextDate} today={props.today} projectName={props.projectName} onAction={props.onAction} onAddSuggestions={() => scheduleMany(suggestions, props.today)} onBringNext={() => scheduleMany(nextBatch, props.today)} />
    <section><div className="mb-4 flex items-end justify-between"><div><p className="text-xs font-semibold uppercase tracking-[.15em] text-zinc-400">Portfolio</p><h2 className="mt-1 text-2xl font-semibold">Projects and next actions</h2></div><span className="text-sm text-zinc-400">Build Today from here</span></div><div className="grid items-start gap-4 xl:grid-cols-2">{props.projects.map((project) => <ProjectBoard key={project.id} project={project} tasks={props.tasks.filter((task) => task.projectId === project.id)} notes={props.notes.filter((note) => note.projectId === project.id)} projects={props.projects} today={props.today} selected={selected?.id === project.id} onHistory={() => setHistoryProjectId(project.id)} onAction={props.onAction} onEdit={props.onEdit} onDelete={props.onDelete} />)}</div></section>
    <Sheet open={!!selected} onOpenChange={(openSheet) => !openSheet && setHistoryProjectId(null)}><SheetContent side="right" className="w-full max-w-none overflow-y-auto border-l-0 bg-[#f2f3f5] p-0 sm:max-w-2xl"><SheetHeader className="sr-only"><SheetTitle>{selected ? `${selected.name} history` : "Project history"}</SheetTitle><SheetDescription>Completed tasks and notes for this project.</SheetDescription></SheetHeader>{selected && <ProjectHistory project={selected} tasks={props.tasks.filter((task) => task.projectId === selected.id)} notes={props.notes.filter((note) => note.projectId === selected.id)} today={props.today} onRestoreTask={(task) => props.onAction("toggle", task.id)} onDeleteTask={props.onDelete} onDeleteNote={props.onDeleteNote} />}</SheetContent></Sheet>
  </div>;
}

function PriorityList({ tasks, suggestions, nextBatch, nextDate, today, projectName, onAction, onAddSuggestions, onBringNext }: { tasks: Task[]; suggestions: Task[]; nextBatch: Task[]; nextDate?: string; today: string; projectName: (id: string) => string; onAction: Shared["onAction"]; onAddSuggestions: () => Promise<void>; onBringNext: () => Promise<void> }) {
  return <section className="overflow-hidden rounded-[22px] bg-[#171b21] text-white shadow-lg"><div className="border-b border-white/10 p-5 sm:p-6"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[.15em] text-[#aa97ff]">Current priority list</p><h2 className="mt-1 text-2xl font-semibold">Today</h2><p className="mt-1 text-sm text-white/45">The tasks you deliberately chose, in one place.</p></div><div className="rounded-2xl bg-white/10 px-4 py-2 text-center"><p className="text-xl font-semibold">{tasks.length}</p><p className="text-[11px] text-white/45">chosen</p></div></div></div><div className="p-5 sm:p-6">{tasks.length ? <div className="space-y-2">{tasks.map((task, index) => <div key={task.id} className="flex items-center gap-3 rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-3"><button onClick={() => onAction("toggle", task.id)} aria-label="Complete task" className="grid size-8 shrink-0 place-items-center rounded-full border border-emerald-300 text-transparent hover:bg-emerald-400 hover:text-zinc-900"><Check size={16} /></button><span className="w-4 text-center text-sm font-semibold text-emerald-300">{index + 1}</span><div className="min-w-0 flex-1"><p className="font-medium leading-6">{task.title}</p><p className="text-xs text-white/40">{projectName(task.projectId)} · <span className={daysOpen(task, today) >= 7 ? "font-medium text-amber-300" : ""}>{taskAgeLabel(task, today)}</span></p></div><button className="rounded-lg px-2 py-1 text-xs text-white/45 hover:bg-white/10 hover:text-white" onClick={() => onAction("schedule", task.id, { plannedFor: null })}>Remove</button></div>)}</div> : <p className="py-3 text-sm text-white/45">Nothing is locked in for today yet.</p>}{tasks.length < 3 && suggestions.length > 0 && <div className="mt-5 border-t border-white/10 pt-5"><div className="mb-3 flex items-center justify-between gap-3"><div><p className="flex items-center gap-2 text-sm font-semibold"><Sparkles size={15} className="text-[#aa97ff]" />Suggested next</p><p className="mt-1 text-xs text-white/40">Based on deadlines, project weight and open loops.</p></div><button onClick={onAddSuggestions} className="shrink-0 rounded-xl bg-white px-3 py-2 text-xs font-semibold text-zinc-900">Add all to Today</button></div><div className="space-y-2">{suggestions.map((task) => <button key={task.id} onClick={() => onAction("schedule", task.id, { plannedFor: today })} className="flex w-full items-center gap-3 rounded-xl bg-white/[.06] p-3 text-left hover:bg-white/10"><Sparkles size={15} className="shrink-0 text-[#aa97ff]" /><span className="min-w-0 flex-1"><span className="block text-sm">{task.title}</span><span className="mt-0.5 block text-xs text-white/35">{projectName(task.projectId)} · <span className={daysOpen(task, today) >= 7 ? "font-medium text-amber-300" : ""}>{taskAgeLabel(task, today)}</span></span></span><span className="text-xs text-white/35">Add</span></button>)}</div></div>}{tasks.length === 0 && nextBatch.length > 0 && <button onClick={onBringNext} className="mt-4 flex w-full items-center justify-between rounded-2xl border border-white/10 bg-white/[.06] p-4 text-left hover:bg-white/10"><span><span className="block text-sm font-semibold">Bring the next planned batch into Today</span><span className="mt-1 block text-xs text-white/40">{nextBatch.length} from {nextDate ? formatPlanDate(nextDate, today) : "the next day"}</span></span><ArrowRight size={18} /></button>}</div></section>;
}

function ProjectBoard({ project, tasks, notes, projects, today, selected, onHistory, onAction, onEdit, onDelete }: { project: Project; tasks: Task[]; notes: Note[]; projects: Project[]; today: string; selected: boolean; onHistory: () => void; onAction: Shared["onAction"]; onEdit: (task: Task) => void; onDelete: (task: Task) => void }) {
  const open = tasks.filter((task) => task.status === "open").sort((a, b) => taskScore(b, projects, today) - taskScore(a, projects, today));
  const done = tasks.filter((task) => task.status === "done");
  const done30 = done.filter((task) => task.completedAt && dateValue(`${today}T23:59:59`) - dateValue(task.completedAt) <= 30 * 86400000).length;
  const latest = latestDate([...tasks.map((task) => task.completedAt || task.createdAt), ...notes.map((note) => note.createdAt), project.lastTouched]);
  return <article className={`overflow-hidden rounded-[22px] border bg-white shadow-[0_1px_3px_rgba(0,0,0,.04)] ${selected ? "border-violet-300 ring-2 ring-violet-100" : "border-zinc-200"}`}><div className="p-5 sm:p-6"><div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2"><span className={`size-2.5 rounded-full ${healthColour(project.health)}`} /><h3 className="text-xl font-semibold">{project.name}</h3></div><span className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-medium capitalize text-zinc-500">{project.status}</span></div><p className="mt-2 text-sm leading-6 text-zinc-500">{project.outcome}</p><div className="mt-4 grid grid-cols-3 gap-2 border-t border-zinc-100 pt-4 text-center"><Metric value={open.length} label="Open" /><Metric value={done30} label="Done 30d" /><Metric value={latest ? relativeDate(latest, today) : "—"} label="Last move" compact /></div></div><div className="border-t border-zinc-100 bg-zinc-50/60 p-4 sm:p-5"><div className="mb-3 flex items-center justify-between"><p className="text-sm font-semibold">To-do actions</p><span className="text-xs text-zinc-400">Tap + Priority</span></div><div className="space-y-2">{open.map((task) => <TaskPlanRow key={task.id} task={task} today={today} onAction={onAction} onEdit={onEdit} onDelete={onDelete} />)}{!open.length && <p className="rounded-xl bg-white p-4 text-center text-sm text-zinc-400">No open actions.</p>}</div><button onClick={onHistory} className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-zinc-200 bg-white py-2.5 text-sm font-semibold text-zinc-600 hover:border-violet-300 hover:text-violet-700"><Activity size={16} />View progress and history</button></div></article>;
}

function TaskPlanRow({ task, today, onAction, onEdit, onDelete }: { task: Task; today: string; onAction: Shared["onAction"]; onEdit: (task: Task) => void; onDelete: (task: Task) => void }) {
  const inPriority = task.plannedFor === today;
  const old = daysOpen(task, today) >= 7;
  return <div className={`flex items-center gap-2 rounded-2xl border p-3 transition ${inPriority ? "border-emerald-200 bg-emerald-50" : "border-zinc-200 bg-white"}`}><div className="min-w-0 flex-1"><p className="text-sm font-medium leading-5">{task.title}</p><div className="mt-1 flex flex-wrap gap-1.5 text-xs text-zinc-400"><span className={old ? "font-medium text-amber-600" : ""}>{taskAgeLabel(task, today)}</span>{task.plannedFor && task.plannedFor !== today && <span>· {formatPlanDate(task.plannedFor, today)}</span>}{task.reviewState && ["blocked", "unclear", "avoiding"].includes(task.reviewState) && <span className="text-amber-600">· {reviewLabel(task.reviewState)}</span>}</div></div>{inPriority ? <span className="flex shrink-0 items-center gap-1 rounded-xl bg-emerald-100 px-3 py-2 text-xs font-semibold text-emerald-800"><Check size={14} />Added</span> : <button onClick={() => onAction("schedule", task.id, { plannedFor: today })} className="flex shrink-0 items-center gap-1 rounded-xl bg-violet-100 px-3 py-2 text-xs font-semibold text-violet-800 hover:bg-violet-600 hover:text-white"><Plus size={14} />Priority</button>}<TaskMenu task={task} onAction={onAction} onEdit={onEdit} onDelete={onDelete} /></div>;
}

function ProjectHistory({ project, tasks, notes, today, onRestoreTask, onDeleteTask, onDeleteNote }: { project: Project; tasks: Task[]; notes: Note[]; today: string; onRestoreTask: (task: Task) => void; onDeleteTask: (task: Task) => void; onDeleteNote: (note: Note) => void }) {
  const completed = tasks.filter((task) => task.status === "done" && task.completedAt).sort((a, b) => dateValue(b.completedAt) - dateValue(a.completedAt));
  const timeline: Array<{ id: string; date: string; type: "Completed"; text: string; task: Task } | { id: string; date: string; type: "Note"; text: string; note: Note }> = [
    ...completed.map((task) => ({ id: `task-${task.id}`, date: task.completedAt as string, type: "Completed" as const, text: task.title, task })),
    ...notes.map((note) => ({ id: `note-${note.id}`, date: note.createdAt, type: "Note" as const, text: note.content, note })),
  ].sort((a, b) => dateValue(b.date) - dateValue(a.date)).slice(0, 50);
  return <div className="min-h-full p-4 pt-14 sm:p-7 sm:pt-14"><section className="panel"><div className="mb-6 flex flex-col gap-3 border-b border-zinc-100 pb-5"><div><p className="text-xs font-semibold uppercase tracking-[.15em] text-violet-600">Project history</p><h2 className="mt-1 text-2xl font-semibold">{project.name}</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-500"><span className="font-medium text-zinc-700">Current outcome:</span> {project.outcome}</p></div><div className="w-fit rounded-2xl bg-violet-50 px-4 py-3 text-sm text-violet-800"><span className="font-semibold">Momentum:</span> {completed.filter((task) => task.completedAt && dateValue(`${today}T23:59:59`) - dateValue(task.completedAt) <= 30 * 86400000).length} completed in 30 days</div></div><div className="space-y-1">{timeline.map((event) => <div key={event.id} className="grid grid-cols-[34px_1fr] gap-3 py-3"><div className={`mt-0.5 grid size-8 place-items-center rounded-full ${event.type === "Completed" ? "bg-emerald-50 text-emerald-600" : "bg-violet-50 text-violet-600"}`}>{event.type === "Completed" ? <Check size={15} /> : <FileText size={14} />}</div><div className="border-b border-zinc-100 pb-3"><div className="flex items-center justify-between gap-3"><span className="text-xs font-semibold uppercase tracking-wide text-zinc-400">{event.type}</span><div className="flex items-center gap-1"><span className="text-xs text-zinc-400">{formatDate(event.date)}</span>{event.type === "Completed" && <button onClick={() => onRestoreTask(event.task)} className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-50"><RotateCcw size={13} />Put back</button>}<button onClick={() => event.type === "Completed" ? onDeleteTask(event.task) : onDeleteNote(event.note)} className="grid size-8 place-items-center rounded-lg text-zinc-300 hover:bg-red-50 hover:text-red-600" aria-label={`Delete ${event.type.toLowerCase()} from history`}><Trash2 size={15} /></button></div></div><p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-zinc-700">{event.text}</p></div></div>)}{!timeline.length && <Empty text="Completed tasks and project notes will build the history here." />}</div></section></div>;
}

function NotesView({ projects, notes, today, onSaved, onDeleteNote }: { projects: Project[]; notes: Note[]; today: string; onSaved: () => Promise<void>; onDeleteNote: (note: Note) => void }) {
  const [filter, setFilter] = useState("all");
  const visible = filter === "all" ? notes : notes.filter((note) => note.projectId === filter);
  const projectName = (id: string) => projects.find((project) => project.id === id)?.name || id;
  return <div className="grid gap-5 xl:grid-cols-[.9fr_1.1fr]"><Capture projects={projects} defaultPlan={today} initialKind="note" onSaved={onSaved} /><section className="panel"><div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><SectionHead eyebrow="Reference, ideas and context" title="Project notes" aside={`${visible.length} shown`} /><Select value={filter} onValueChange={(value) => setFilter(value || "all")}><SelectTrigger className="w-full sm:w-44"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All projects</SelectItem>{projects.map((project) => <SelectItem key={project.id} value={project.id}>{project.name}</SelectItem>)}</SelectContent></Select></div><div className="space-y-3">{visible.map((note) => <article key={note.id} className="rounded-2xl border border-zinc-100 bg-zinc-50/70 p-4"><div className="flex items-center justify-between gap-3 text-xs"><span className="font-semibold text-violet-700">{projectName(note.projectId)}</span><div className="flex items-center gap-1"><time className="text-zinc-400">{formatDate(note.createdAt)}</time><button onClick={() => onDeleteNote(note)} className="grid size-8 place-items-center rounded-lg text-zinc-300 hover:bg-red-50 hover:text-red-600" aria-label="Delete note"><Trash2 size={15} /></button></div></div><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-zinc-700">{note.content}</p></article>)}{!visible.length && <Empty text="Notes you file to this project will appear here." />}</div></section></div>;
}

function FocusCard({ task, projectName, today, onAction }: { task?: Task; projectName: (id: string) => string; today: string; onAction: Shared["onAction"] }) { return <section className="overflow-hidden rounded-[22px] border border-violet-200 bg-white"><div className="bg-[#eee9ff] px-5 py-3 text-xs font-semibold uppercase tracking-[.16em] text-[#684bd5]">Start here — only this</div>{task ? <div className="flex items-start gap-4 p-5 sm:p-6"><button onClick={() => onAction("toggle", task.id)} aria-label="Complete task" className="mt-1 grid size-11 shrink-0 place-items-center rounded-full border-2 border-[#8065f3] text-transparent hover:bg-[#8065f3] hover:text-white"><Check size={20} /></button><div className="min-w-0 flex-1"><h2 className="text-xl font-semibold leading-8 sm:text-2xl">{task.title}</h2><p className="mt-2 text-sm text-zinc-500">{projectName(task.projectId)} · {why(task)} · <span className={daysOpen(task, today) >= 7 ? "font-medium text-amber-600" : ""}>{taskAgeLabel(task, today)}</span></p></div><ChevronRight className="mt-2 text-zinc-300" /></div> : <Empty text="Capture one thing and your first move will appear here." />}</section>; }

function PlanChoiceRow({ task, projectName, rank, targetDate, targetLabel, referenceDate, onAction, onEdit, onDelete }: { task: Task; projectName: (id: string) => string; rank: number; targetDate: string; targetLabel: string; referenceDate: string; onAction: Shared["onAction"]; onEdit: (task: Task) => void; onDelete: (task: Task) => void }) {
  const selected = task.plannedFor === targetDate;
  return <div className="flex items-center gap-3 rounded-2xl border border-zinc-100 bg-white p-3 hover:border-zinc-200"><span className="w-5 shrink-0 text-center text-sm font-semibold text-[#7659e8]">{rank}</span><div className="min-w-0 flex-1"><p className="font-medium leading-6">{task.title}</p><div className="mt-0.5 flex flex-wrap gap-2 text-xs text-zinc-400"><span>{projectName(task.projectId)}</span><span className={daysOpen(task, referenceDate) >= 7 ? "font-medium text-amber-600" : ""}>· {taskAgeLabel(task, referenceDate)}</span>{task.dueDate && <span className={task.dueDate <= referenceDate ? "text-red-500" : ""}>· Due {task.dueDate}</span>}{task.reviewState && ["blocked", "unclear", "avoiding"].includes(task.reviewState) && <span className="text-amber-600">· {reviewLabel(task.reviewState)}</span>}</div></div>{selected ? <span className="flex shrink-0 items-center gap-1 rounded-xl bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700"><Check size={14} />Added</span> : <button onClick={() => onAction("schedule", task.id, { plannedFor: targetDate })} className="flex shrink-0 items-center gap-1 rounded-xl bg-violet-100 px-3 py-2 text-xs font-semibold text-violet-800 hover:bg-violet-600 hover:text-white"><Plus size={14} />{targetLabel}</button>}<TaskMenu task={task} tomorrow={targetLabel === "Tomorrow" ? targetDate : undefined} onAction={onAction} onEdit={onEdit} onDelete={onDelete} /></div>;
}

function TaskMenu({ task, tomorrow, onAction, onEdit, onDelete }: { task: Task; tomorrow?: string; onAction: Shared["onAction"]; onEdit: (task: Task) => void; onDelete: (task: Task) => void }) { return <DropdownMenu><DropdownMenuTrigger className="grid size-9 shrink-0 place-items-center rounded-lg text-zinc-400 hover:bg-zinc-100" aria-label="Task options"><MoreHorizontal size={20} /></DropdownMenuTrigger><DropdownMenuContent align="end" className="w-48"><DropdownMenuItem onSelect={() => onEdit(task)}><Pencil />Edit task</DropdownMenuItem><DropdownMenuItem onSelect={() => onAction("toggle", task.id)}><Check />Mark complete</DropdownMenuItem>{tomorrow && <DropdownMenuItem onSelect={() => onAction("schedule", task.id, { plannedFor: tomorrow })}><Sunrise />Plan for tomorrow</DropdownMenuItem>}<DropdownMenuItem onSelect={() => onAction("schedule", task.id, { plannedFor: null })}><Circle />Leave unscheduled</DropdownMenuItem><DropdownMenuSeparator /><DropdownMenuItem variant="destructive" onSelect={() => onDelete(task)}><Trash2 />Remove task</DropdownMenuItem></DropdownMenuContent></DropdownMenu>; }

function EditTask({ task, projects, onClose, onSave }: { task: Task; projects: Project[]; onClose: () => void; onSave: (data: Record<string, unknown>) => Promise<void> }) {
  const [title, setTitle] = useState(task.title);
  const [projectId, setProjectId] = useState(task.projectId);
  const [priority, setPriority] = useState(String(task.priority));
  const [dueDate, setDueDate] = useState(task.dueDate || "");
  return <Dialog open onOpenChange={(openDialog) => !openDialog && onClose()}><DialogContent><DialogHeader><DialogTitle>Edit task</DialogTitle><DialogDescription>Correct the wording, project or priority. Your changes are saved permanently.</DialogDescription></DialogHeader><div className="space-y-4"><Input value={title} onChange={(event) => setTitle(event.target.value)} /><Select value={projectId} onValueChange={(value) => setProjectId(value || projectId)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{projects.map((project) => <SelectItem key={project.id} value={project.id}>{project.name}</SelectItem>)}</SelectContent></Select><Select value={priority} onValueChange={(value) => setPriority(value || priority)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="5">Urgent</SelectItem><SelectItem value="4">High priority</SelectItem><SelectItem value="3">Normal priority</SelectItem><SelectItem value="2">Low priority</SelectItem></SelectContent></Select><div><label className="mb-2 block text-sm text-zinc-500">Due date (optional)</label><Input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} /></div><Button className="w-full" onClick={() => onSave({ title, projectId, priority: Number(priority), dueDate: dueDate || null, plannedFor: task.plannedFor })}>Save changes</Button></div></DialogContent></Dialog>;
}

function Header({ screen, view }: { screen: Screen; view: DayView }) {
  const copy = screen === "projects" ? ["Your projects.", "See every project and pull the right next action into Today."] : screen === "progress" ? ["What you’ve moved.", "Look back properly — across the whole of your life, not just today."] : screen === "jarvis" ? ["Rich.", "Ask, decide, then say yes."] : screen === "notes" ? ["Your notes.", "Everything you capture stays attached to the work it belongs to."] : { morning: ["Good morning, Nathan.", "Decide what today is for."], day: ["Keep the day moving.", "One clear action, then the next."], evening: ["Close the loops.", "Make tomorrow lighter before you stop."] }[view];
  return <header className="mb-5 flex items-end justify-between"><div><p className="text-sm font-medium text-zinc-500">{new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long" }).format(new Date())}</p><h1 className="mt-1 text-3xl font-semibold tracking-tight">{copy[0]}</h1><p className="mt-1 max-w-2xl text-base text-zinc-500">{copy[1]}</p></div></header>;
}

function ViewSwitch({ view, setView }: { view: DayView; setView: (view: DayView) => void }) { return <div className="mb-5 grid w-full grid-cols-3 rounded-2xl border border-zinc-200 bg-white p-1 sm:flex sm:w-fit"><ModeButton active={view === "morning"} onClick={() => setView("morning")} icon={<Sunrise />}>Morning</ModeButton><ModeButton active={view === "day"} onClick={() => setView("day")} icon={<Sun />}>Today</ModeButton><ModeButton active={view === "evening"} onClick={() => setView("evening")} icon={<Moon />}>Evening</ModeButton></div>; }
function ModeButton({ active, onClick, icon, children }: { active: boolean; onClick: () => void; icon: React.ReactNode; children: React.ReactNode }) { return <button onClick={onClick} className={`flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold sm:px-4 ${active ? "bg-[#171b21] text-white" : "text-zinc-500 hover:bg-zinc-50"}`}><span className="[&>svg]:size-4">{icon}</span>{children}</button>; }

function DesktopNav({ screen, view, onDay, setScreen }: { screen: Screen; view: DayView; onDay: (view: DayView) => void; setScreen: (screen: Screen) => void }) { return <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col bg-[#171b21] p-5 text-white lg:flex"><div className="flex items-center gap-3 px-2 py-3"><div className="grid size-9 place-items-center rounded-xl bg-[#7c5cff]"><Command size={18} /></div><div><div className="font-semibold">Command Centre</div><div className="text-xs text-white/45">Nathan’s portfolio OS</div></div></div><nav className="mt-8 space-y-1 text-sm"><SideButton active={screen === "day" && view === "morning"} onClick={() => onDay("morning")} icon={<Sunrise />}>Morning</SideButton><SideButton active={screen === "day" && view === "day"} onClick={() => onDay("day")} icon={<Target />}>Today</SideButton><SideButton active={screen === "day" && view === "evening"} onClick={() => onDay("evening")} icon={<Moon />}>Evening</SideButton><div className="my-4 h-px bg-white/10" /><SideButton active={screen === "progress"} onClick={() => setScreen("progress")} icon={<Trophy />}>Progress</SideButton><SideButton active={screen === "jarvis"} onClick={() => setScreen("jarvis")} icon={<Brain />}>Rich</SideButton><SideButton active={screen === "projects"} onClick={() => setScreen("projects")} icon={<Layers3 />}>Projects</SideButton><SideButton active={screen === "notes"} onClick={() => setScreen("notes")} icon={<FileText />}>Notes</SideButton></nav><div className="mt-auto rounded-2xl border border-white/10 bg-white/[.04] p-4"><div className="mb-2 flex items-center gap-2 text-sm font-medium"><Sparkles size={15} className="text-[#a58cff]" />Operating rule</div><p className="text-sm leading-6 text-white/55">Capture freely. Choose deliberately. Do one thing at a time.</p></div></aside>; }
function SideButton({ active = false, onClick, icon, children }: { active?: boolean; onClick?: () => void; icon: React.ReactNode; children: React.ReactNode }) { return <button onClick={onClick} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 ${active ? "bg-white/10 text-white" : "text-white/50 hover:bg-white/5"}`}><span className="[&>svg]:size-4">{icon}</span>{children}</button>; }
function MobileNav({ screen, onDay, setScreen }: { screen: Screen; onDay: () => void; setScreen: (screen: Screen) => void }) { return <nav className="fixed inset-x-3 bottom-3 z-30 grid grid-cols-5 rounded-2xl border border-white/10 bg-[#171b21]/95 p-1.5 text-white shadow-2xl backdrop-blur lg:hidden"><MobileButton active={screen === "day"} onClick={onDay} icon={<Sun />}>Today</MobileButton><MobileButton active={screen === "projects"} onClick={() => setScreen("projects")} icon={<Layers3 />}>Projects</MobileButton><MobileButton active={screen === "progress"} onClick={() => setScreen("progress")} icon={<Trophy />}>Progress</MobileButton><MobileButton active={screen === "jarvis"} onClick={() => setScreen("jarvis")} icon={<Brain />}>Rich</MobileButton><MobileButton active={screen === "notes"} onClick={() => setScreen("notes")} icon={<FileText />}>Notes</MobileButton></nav>; }
function MobileButton({ active, onClick, icon, children }: { active: boolean; onClick: () => void; icon: React.ReactNode; children: React.ReactNode }) { return <button onClick={onClick} className={`flex flex-col items-center gap-1 rounded-xl py-2 text-xs font-medium ${active ? "bg-white/10 text-white" : "text-white/45"}`}><span className="[&>svg]:size-4">{icon}</span>{children}</button>; }
function Choice({ active, onClick, icon, children }: { active: boolean; onClick: () => void; icon: React.ReactNode; children: React.ReactNode }) { return <button onClick={onClick} className={`rounded-xl px-4 py-2 text-sm font-medium ${active ? "bg-white text-zinc-900" : "bg-white/10 text-white/60"}`}><span className="mr-2 inline-block align-middle [&>svg]:size-4">{icon}</span>{children}</button>; }
function SectionHead({ eyebrow, title, aside }: { eyebrow: string; title: string; aside?: string }) { return <div className="mb-4 flex items-end justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[.15em] text-zinc-400">{eyebrow}</p><h2 className="mt-1 text-xl font-semibold">{title}</h2></div>{aside && <span className="shrink-0 text-sm text-zinc-400">{aside}</span>}</div>; }
function Metric({ value, label, compact = false }: { value: string | number; label: string; compact?: boolean }) { return <div><p className={`${compact ? "text-sm" : "text-lg"} font-semibold text-zinc-800`}>{value}</p><p className="mt-0.5 text-[11px] text-zinc-400">{label}</p></div>; }
function Principle({ title, text }: { title: string; text: string }) { return <section className="rounded-[22px] bg-[#e9e5ff] p-5"><p className="font-semibold text-[#342267]">{title}</p><p className="mt-2 text-sm leading-6 text-[#5e5180]">{text}</p></section>; }
function Empty({ text }: { text: string }) { return <p className="empty">{text}</p>; }

function why(task: Task) { if (task.plannedFor === localDate(new Date())) return "Chosen for today"; if (task.dueDate && task.dueDate <= localDate(new Date())) return "Due now"; if (task.reviewState === "avoiding") return "You flagged this as avoided"; if (/send|reply|speak|email|call|deliver|invoice/i.test(task.title)) return "Closes an open loop"; return task.priority >= 4 ? "High priority" : "Best next move"; }
function taskScore(task: Task, projects: Project[], today: string) { const due = task.dueDate ? (task.dueDate < today ? 80 : task.dueDate === today ? 70 : 0) : 0; const planned = task.plannedFor === today ? 100 : 0; const project = (projects.find((item) => item.id === task.projectId)?.priority || 3) * 3; const loop = /send|reply|speak|email|call|deliver|invoice|submit/i.test(task.title) ? 8 : 0; const state = task.reviewState === "blocked" ? -50 : task.reviewState === "unclear" ? -25 : task.reviewState === "avoiding" ? 5 : 0; return planned + due + task.priority * 10 + project + loop + state - task.effort; }
function needsReview(task: Task, today: string) { const reference = dateValue(`${today}T23:59:59`); const overdueOrChosen = task.plannedFor === today || (!!task.dueDate && task.dueDate <= today); const reviewAge = task.reviewedAt ? Math.floor((reference - dateValue(task.reviewedAt)) / 86400000) : Number.POSITIVE_INFINITY; return !overdueOrChosen && daysOpen(task, today) >= 7 && reviewAge >= 7; }
function daysOpen(task: Task, today: string) { return Math.max(0, Math.floor((dateValue(`${today}T23:59:59`) - dateValue(task.createdAt)) / 86400000)); }
function taskAgeLabel(task: Task, today: string) { const days = daysOpen(task, today); return days === 0 ? "Added today" : days === 1 ? "1 day on list" : `${days} days on list`; }
function reviewLabel(state: string) { return state === "blocked" ? "Blocked" : state === "unclear" ? "Needs clarity" : "Avoided"; }
function healthColour(health: string) { return health === "green" ? "bg-emerald-500" : health === "amber" ? "bg-amber-400" : "bg-red-500"; }
function voiceErrorMessage(error?: string) { if (error === "not-allowed" || error === "service-not-allowed") return "Microphone or speech access was denied. Allow it in iPhone Settings, or use the microphone on the keyboard."; if (error === "no-speech") return "I didn’t hear any speech. Try again, or use the microphone on your iPhone keyboard."; if (error === "audio-capture") return "The microphone isn’t available. Check iPhone microphone permission and try again."; if (error === "network") return "Apple’s speech service did not respond. Try again on a stable connection, or use keyboard dictation."; return "The recording ended without a transcript. On iPhone, the keyboard microphone is the reliable fallback."; }
function dayView(): DayView { const hour = new Date().getHours(); return hour < 12 ? "morning" : hour < 19 ? "day" : "evening"; }
function localDate(date: Date) { const year = date.getFullYear(); const month = String(date.getMonth() + 1).padStart(2, "0"); const day = String(date.getDate()).padStart(2, "0"); return `${year}-${month}-${day}`; }
function dateOffset(date: string, days: number) { const value = new Date(`${date}T12:00:00`); value.setDate(value.getDate() + days); return localDate(value); }
function weekStartFor(date: string) { const value = new Date(`${date}T12:00:00`); const day = value.getDay(); return dateOffset(date, -(day === 0 ? 6 : day - 1)); }
function dateBetween(date: string, start: string, end: string) { return date >= start && date <= end; }
function weekRangeLabel(start: string, end: string) { const startDate = new Date(`${start}T12:00:00`); const endDate = new Date(`${end}T12:00:00`); const sameMonth = startDate.getMonth() === endDate.getMonth(); const first = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: sameMonth ? undefined : "short" }).format(startDate); const last = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: startDate.getFullYear() === new Date().getFullYear() ? undefined : "numeric" }).format(endDate); return `${first}–${last}`; }
function dateValue(date: string | null) { return date ? new Date(date).getTime() : 0; }
function latestDate(dates: (string | null | undefined)[]) { return dates.filter((date): date is string => !!date).sort((a, b) => dateValue(b) - dateValue(a))[0] || null; }
function relativeDate(date: string, today: string) { const days = Math.max(0, Math.floor((dateValue(`${today}T23:59:59`) - dateValue(date)) / 86400000)); return days === 0 ? "Today" : days === 1 ? "1d" : `${days}d`; }
function formatDate(date: string) { return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: new Date(date).getFullYear() === new Date().getFullYear() ? undefined : "numeric" }).format(new Date(date)); }
function formatTime(date: string) { return new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" }).format(new Date(date)); }
function formatDayAndTime(date: string) { return new Intl.DateTimeFormat("en-GB", { weekday: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(date)); }
function formatPlanDate(date: string, today: string) { if (date === today) return "Today"; if (date === dateOffset(today, 1)) return "Tomorrow"; return new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric" }).format(new Date(`${date}T12:00:00`)); }
function short(text: string, length: number) { return text.length > length ? `${text.slice(0, length - 1)}…` : text; }
function formatCalendarDate(value: string) { return new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(value)); }
function formatCalendarTime(value: string) { return new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" }).format(new Date(value)); }
function emailHref(action: JarvisAction) { return `mailto:${encodeURIComponent(action.recipientEmail || "")}?subject=${encodeURIComponent(action.subject || "")}&body=${encodeURIComponent(action.body || "")}`; }
function post(body: Record<string, unknown>) { return fetch("/api/dashboard", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); }

