import {
  BookOpen, Briefcase, User, Dumbbell, Plane, Folder, ClipboardList,
  Users, Target, StickyNote, Circle, CircleDot, CheckCircle2, Pause, X,
} from "lucide-react";

export const CATEGORIES = {
  study: { label: "Study", icon: BookOpen },
  work: { label: "Work", icon: Briefcase },
  personal: { label: "Personal", icon: User },
  fitness: { label: "Fitness", icon: Dumbbell },
  travel: { label: "Travel", icon: Plane },
  project: { label: "Project", icon: Folder },
  assignment: { label: "Assignment", icon: ClipboardList },
  meeting: { label: "Meeting", icon: Users },
  goal: { label: "Goal", icon: Target },
  notes: { label: "Notes", icon: StickyNote },
};

export const STATUSES = {
  not_started: { label: "Not Started", icon: Circle, color: "taupe" },
  in_progress: { label: "In Progress", icon: CircleDot, color: "amber" },
  completed: { label: "Completed", icon: CheckCircle2, color: "green" },
  on_hold: { label: "On Hold", icon: Pause, color: "brown" },
  cancelled: { label: "Cancelled", icon: X, color: "red" },
};

export const STATUS_ORDER = ["not_started", "in_progress", "completed", "on_hold", "cancelled"];

export function parseTime(t) {
  if (!t) return null;
  const [h, m] = t.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

export function formatTime(t) {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const hr = h % 12 === 0 ? 12 : h % 12;
  return `${hr}:${String(m).padStart(2, "0")} ${ampm}`;
}

export function formatTimeShort(t) {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  const ampm = h >= 12 ? "pm" : "am";
  const hr = h % 12 === 0 ? 12 : h % 12;
  return `${hr}:${String(m).padStart(2, "0")}${ampm}`;
}

export function durationMinutes(start, end) {
  const s = parseTime(start);
  const e = parseTime(end);
  if (s == null || e == null) return null;
  let d = e - s;
  if (d < 0) d += 1440;
  return d;
}

export function formatDuration(mins) {
  if (mins == null) return "";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
}

export function getChildren(tasks, parentId) {
  return tasks
    .filter((t) => (parentId ? t.parent_id === parentId : !t.parent_id))
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
}

export function hasChildren(tasks, parentId) {
  return tasks.some((t) => t.parent_id === parentId);
}

export function collectDescendants(tasks, parentId) {
  const out = [];
  const walk = (pid) => {
    getChildren(tasks, pid).forEach((c) => {
      out.push(c.id);
      walk(c.id);
    });
  };
  walk(parentId);
  return out;
}