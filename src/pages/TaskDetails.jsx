import { db } from "@/api/client";

import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowLeft, Pencil, Trash2, Plus, Clock, CalendarDays, Hourglass, FolderTree, StickyNote, ChevronRight,
} from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";

import CategoryIcon from "@/components/CategoryIcon";
import StatusBadge from "@/components/StatusBadge";
import ProgressBar from "@/components/ProgressBar";
import TaskForm from "@/components/TaskForm";
import SubtaskTree from "@/components/SubtaskTree";
import {
  CATEGORIES, STATUSES, STATUS_ORDER, formatTime, formatDuration, durationMinutes,
  getChildren, collectDescendants,
} from "@/lib/tasks";
import { format, parseISO } from "date-fns";
import { cn } from "@/lib/utils";

function CircularProgress({ value }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(100, value || 0));
  return (
    <div className="relative h-32 w-32">
      <svg className="h-full w-full -rotate-90" viewBox="0 0 120 120">
        <circle cx="60" cy="60" r={r} fill="none" stroke="hsl(var(--moss))" strokeOpacity="0.15" strokeWidth="10" />
        <circle
          cx="60" cy="60" r={r} fill="none" stroke="hsl(var(--moss))" strokeWidth="10" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c - (v / 100) * c}
          className="transition-all duration-700 ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="font-display text-3xl font-extrabold tabular-nums text-foreground">{v}%</span>
      </div>
    </div>
  );
}

function Section({ icon: Icon, title, children }) {
  return (
    <div className="mt-5">
      <div className="flex items-center gap-2 px-1 pb-2">
        <Icon className="h-4 w-4 text-primary" strokeWidth={2} />
        <h3 className="text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">{title}</h3>
      </div>
      <div className="overflow-hidden rounded-2xl border border-border/60 bg-card">{children}</div>
    </div>
  );
}

export default function TaskDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [task, setTask] = useState(null);
  const [all, setAll] = useState([]);
  const [progress, setProgress] = useState(0);
  const [expanded, setExpanded] = useState(new Set());
  const [editOpen, setEditOpen] = useState(false);
  const [subFormOpen, setSubFormOpen] = useState(false);
  const [subParent, setSubParent] = useState(null);

  const load = async () => {
    const t = await db.entities.Task.get(id);
    setTask(t);
    setProgress(t?.progress ?? 0);
    setAll(await db.entities.Task.list("-created_date", 500));
  };

  useEffect(() => {
    load();
    const unsub = db.entities.Task.subscribe(() => load());
    return unsub;
  }, [id]);

  const parent = useMemo(
    () => (task?.parent_id ? all.find((t) => t.id === task.parent_id) : null),
    [task, all]
  );

  const subtasks = useMemo(() => getChildren(all, id), [all, id]);

  if (!task) {
    return (
      <div className="flex h-[100dvh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-muted border-t-primary" />
      </div>
    );
  }

  const dur = durationMinutes(task.start_time, task.end_time);

  const update = async (data) => {
    const u = await db.entities.Task.update(id, data);
    setTask(u);
  };

  const commitProgress = async (v) => {
    await update({ progress: v });
  };

  const toggleExpand = (tid) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(tid)) next.delete(tid);
      else next.add(tid);
      return next;
    });
  };

  const onReorder = async (parentId, from, to) => {
    const siblings = getChildren(all, parentId);
    const arr = [...siblings];
    const [moved] = arr.splice(from, 1);
    arr.splice(to, 0, moved);
    await db.entities.Task.bulkUpdate(arr.map((t, i) => ({ id: t.id, sort_order: i })));
    load();
  };

  const addSubtask = (parentId) => {
    setSubParent(parentId);
    setSubFormOpen(true);
  };

  const removeTask = async () => {
    const ids = [id, ...collectDescendants(all, id)];
    await db.entities.Task.deleteMany({ id: { $in: ids } });
    navigate(-1);
  };

  return (
    <div className="mx-auto min-h-[100dvh] max-w-md pb-20">
      {/* header */}
      <div className="sticky top-0 z-20 flex items-center justify-between bg-background/85 px-4 py-3 backdrop-blur-xl">
        <button onClick={() => navigate(-1)} className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-muted">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="flex items-center gap-1">
          <button onClick={() => setEditOpen(true)} className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-muted">
            <Pencil className="h-4 w-4" />
          </button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <button className="flex h-9 w-9 items-center justify-center rounded-full text-rose-500 hover:bg-rose-500/10">
                <Trash2 className="h-4 w-4" />
              </button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete this task?</AlertDialogTitle>
                <AlertDialogDescription>
                  This permanently deletes the task and all of its subtasks.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={removeTask} className="bg-destructive text-destructive-foreground">Delete</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      <div className="px-5">
        {/* title */}
        <div className="flex items-start gap-3 pt-2">
          <CategoryIcon category={task.category} size="lg" />
          <div className="min-w-0 flex-1 pt-0.5">
            <h1 className="font-display text-2xl font-extrabold leading-tight text-foreground">{task.title}</h1>
            <div className="mt-2">
              <StatusBadge status={task.status} />
            </div>
          </div>
        </div>

        {/* progress */}
        <div className="mt-6 flex flex-col items-center gap-4">
          <CircularProgress value={progress} />
          <div className="w-full">
            <Slider
              value={[progress]}
              max={100}
              step={5}
              onValueChange={(v) => setProgress(v[0])}
              onValueCommit={(v) => commitProgress(v[0])}
            />
            <div className="mt-2 flex gap-1.5">
              {[0, 25, 50, 75, 100].map((p) => (
                <button
                  key={p}
                  onClick={() => { setProgress(p); commitProgress(p); }}
                  className={cn(
                    "flex-1 rounded-lg py-1.5 text-xs font-semibold transition-colors",
                    progress === p ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                  )}
                >
                  {p}%
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* status selector */}
        <div className="mt-4 flex flex-wrap gap-2">
          {STATUS_ORDER.map((s) => {
            const cfg = STATUSES[s];
            const Icon = cfg.icon;
            const active = task.status === s;
            return (
              <button
                key={s}
                onClick={() => update({ status: s })}
                className={cn(
                  "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
                  active ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"
                )}
              >
                <Icon className="h-3.5 w-3.5" strokeWidth={2} />
                {cfg.label}
              </button>
            );
          })}
        </div>

        {/* schedule */}
        <Section icon={CalendarDays} title="Schedule">
          <div className="divide-y divide-border/50">
            <div className="flex items-center justify-between px-4 py-3">
              <span className="flex items-center gap-2 text-sm text-muted-foreground"><CalendarDays className="h-4 w-4" /> Start Date</span>
              <span className="text-sm font-semibold">{task.start_date ? format(parseISO(task.start_date), "EEE, MMM d, yyyy") : "—"}</span>
            </div>
            <div className="flex items-center justify-between px-4 py-3">
              <span className="flex items-center gap-2 text-sm text-muted-foreground"><Clock className="h-4 w-4" /> Start Time</span>
              <span className="text-sm font-semibold">{task.start_time ? formatTime(task.start_time) : "—"}</span>
            </div>
            <div className="flex items-center justify-between px-4 py-3">
              <span className="flex items-center gap-2 text-sm text-muted-foreground"><Hourglass className="h-4 w-4" /> Deadline</span>
              <span className="text-sm font-semibold">{task.end_time ? formatTime(task.end_time) : "—"}</span>
            </div>
            <div className="flex items-center justify-between px-4 py-3">
              <span className="flex items-center gap-2 text-sm text-muted-foreground"><Clock className="h-4 w-4" /> Duration</span>
              <span className="text-sm font-semibold">{dur != null ? formatDuration(dur) : "—"}</span>
            </div>
          </div>
        </Section>

        {/* parent */}
        {parent && (
          <Section icon={FolderTree} title="Parent">
            <button
              onClick={() => navigate(`/task/${parent.id}`)}
              className="flex w-full items-center gap-3 px-4 py-3 text-left"
            >
              <CategoryIcon category={parent.category} size="sm" />
              <span className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">{parent.title}</span>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </button>
          </Section>
        )}

        {/* notes */}
        <Section icon={StickyNote} title="Notes">
          <NotesEditor task={task} onSave={(v) => update({ description: v })} />
        </Section>

        {/* subtasks */}
        <Section icon={FolderTree} title={`Subtasks · ${subtasks.length}`}>
          <div className="p-2">
            {subtasks.length === 0 ? (
              <p className="px-2 py-4 text-center text-sm text-muted-foreground">No subtasks yet. Add one to break this down.</p>
            ) : (
              <SubtaskTree
                tasks={all}
                parentId={id}
                expanded={expanded}
                toggleExpand={toggleExpand}
                onReorder={onReorder}
                onAddSubtask={addSubtask}
              />
            )}
          </div>
          <div className="border-t border-border/50 p-3">
            <Button
              onClick={() => addSubtask(id)}
              className="w-full gap-2 rounded-xl bg-primary text-primary-foreground"
            >
              <Plus className="h-4 w-4" strokeWidth={2.5} /> Add Subtask
            </Button>
          </div>
        </Section>
      </div>

      <TaskForm open={editOpen} onClose={() => setEditOpen(false)} onSave={load} task={task} />
      <TaskForm
        open={subFormOpen}
        onClose={() => setSubFormOpen(false)}
        onSave={load}
        parentId={subParent}
      />
    </div>
  );
}

function NotesEditor({ task, onSave }) {
  const [val, setVal] = useState(task.description || "");
  const [editing, setEditing] = useState(false);

  useEffect(() => { setVal(task.description || ""); }, [task.description]);

  if (!editing) {
    return (
      <button onClick={() => setEditing(true)} className="block w-full px-4 py-3 text-left">
        {val ? (
          <p className="whitespace-pre-wrap text-sm text-foreground">{val}</p>
        ) : (
          <p className="text-sm text-muted-foreground">Add notes…</p>
        )}
      </button>
    );
  }

  return (
    <div className="p-3">
      <Textarea
        value={val}
        onChange={(e) => setVal(e.target.value)}
        rows={4}
        autoFocus
        placeholder="Add notes…"
      />
      <div className="mt-2 flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={() => { setVal(task.description || ""); setEditing(false); }}>Cancel</Button>
        <Button size="sm" onClick={() => { onSave(val); setEditing(false); }}>Save</Button>
      </div>
    </div>
  );
}