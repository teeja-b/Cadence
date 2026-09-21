import { db } from "@/api/client";

import { useEffect, useMemo, useState } from "react";
import {
  addDays, eachDayOfInterval, endOfMonth, endOfWeek, format, isSameDay,
  isSameMonth, isToday, parseISO, startOfMonth, startOfWeek, subDays,
} from "date-fns";
import { ChevronLeft, ChevronRight, Circle } from "lucide-react";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import TaskCard from "@/components/TaskCard";
import { parseTime } from "@/lib/tasks";
import { cn } from "@/lib/utils";

const WEEK_STARTS = Number(localStorage.getItem("weekStartsOn") || 1);

export default function Calendar() {
  const [view, setView] = useState("month");
  const [cursor, setCursor] = useState(new Date());
  const [selected, setSelected] = useState(new Date());
  const [tasks, setTasks] = useState([]);

  useEffect(() => {
    const load = async () => setTasks(await db.entities.Task.list("-created_date", 500));
    load();
    const unsub = db.entities.Task.subscribe(load);
    return unsub;
  }, []);

  const scheduled = useMemo(
    () => tasks.filter((t) => !t.parent_id && t.start_date),
    [tasks]
  );

  const byDate = useMemo(() => {
    const map = {};
    scheduled.forEach((t) => {
      (map[t.start_date] ||= []).push(t);
    });
    Object.values(map).forEach((a) =>
      a.sort((x, y) => (parseTime(x.start_time) || 0) - (parseTime(y.start_time) || 0))
    );
    return map;
  }, [scheduled]);

  const dayTasks = (d) => byDate[format(d, "yyyy-MM-dd")] || [];

  return (
    <div className="mx-auto max-w-md px-5 pt-10">
      <h1 className="font-display text-3xl font-extrabold text-foreground">Calendar</h1>

      <Tabs value={view} onValueChange={setView} className="mt-4">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="month">Month</TabsTrigger>
          <TabsTrigger value="week">Week</TabsTrigger>
          <TabsTrigger value="day">Day</TabsTrigger>
        </TabsList>
      </Tabs>

      {view === "month" && (
       <MonthView cursor={cursor} setCursor={setCursor} selected={selected} dayTasks={dayTasks} onPick={(d) => { setSelected(d); setView("day"); }} />
      )}
      {view === "week" && (
        <WeekView cursor={cursor} setCursor={setCursor} dayTasks={dayTasks} onPick={(d) => { setSelected(d); setView("day"); }} />
      )}
      {view === "day" && <DayView selected={selected} setSelected={setSelected} dayTasks={dayTasks} />}
    </div>
  );
}

function NavHeader({ label, onPrev, onNext }) {
  return (
    <div className="flex items-center justify-between py-4">
      <button onClick={onPrev} className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-muted">
        <ChevronLeft className="h-5 w-5" />
      </button>
      <span className="font-display text-lg font-bold">{label}</span>
      <button onClick={onNext} className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-muted">
        <ChevronRight className="h-5 w-5" />
      </button>
    </div>
  );
}

function MonthView({ cursor, setCursor, dayTasks, onPick,selected }) {
  const start = startOfWeek(startOfMonth(cursor), { weekStartsOn: WEEK_STARTS });
  const end = endOfWeek(endOfMonth(cursor), { weekStartsOn: WEEK_STARTS });
  const days = eachDayOfInterval({ start, end });
  const weekDays = ["M", "T", "W", "T", "F", "S", "S"];

  return (
    <div>
      <NavHeader
        label={format(cursor, "MMMM yyyy")}
        onPrev={() => setCursor(subDays(startOfMonth(cursor), 1))}
        onNext={() => setCursor(addDays(endOfMonth(cursor), 1))}
      />
      <div className="grid grid-cols-7">
        {weekDays.map((d, i) => (
          <div key={i} className="pb-2 text-center text-[11px] font-semibold text-muted-foreground">{d}</div>
        ))}
        {days.map((d) => {
          const inMonth = isSameMonth(d, cursor);
          const tasks = dayTasks(d);
          return (
            <button
              key={d.toISOString()}
              onClick={() => onPick(d)}
                  className="flex aspect-square flex-col items-center justify-center gap-1 rounded-xl text-sm hover:bg-muted/60 hover:scale-105"
            >
             <span
                      className={cn(
                          "flex h-8 w-8 items-center justify-center rounded-full font-semibold",
                          isSameDay(d, selected) && "bg-primary text-white shadow-md scale-110",
                          !isSameDay(d, selected) && isToday(d) && "bg-primary/20 text-primary",
                          !isSameDay(d, selected) && !isToday(d) && inMonth
                              ? "text-foreground"
                              : !isSameDay(d, selected) && "text-muted-foreground/40"
                      )}
              >
                {format(d, "d")}
              </span>
              <div className="flex h-1.5 gap-1">
                {tasks.slice(0, 3).map((t) => (
                  <span key={t.id} className="h-1.5 w-1.5 rounded-full bg-dot" />
                ))}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function WeekView({ cursor, setCursor, dayTasks, onPick }) {
  const start = startOfWeek(cursor, { weekStartsOn: WEEK_STARTS });
  const days = eachDayOfInterval({ start, end: addDays(start, 6) });

  return (
    <div>
      <NavHeader
        label={format(start, "MMM d")} 
        onPrev={() => setCursor(subDays(cursor, 7))}
        onNext={() => setCursor(addDays(cursor, 7))}
      />
      <div className="space-y-3">
        {days.map((d) => {
          const tasks = dayTasks(d);
          return (
            <div key={d.toISOString()} className="rounded-2xl border border-border/60 bg-card p-3">
              <button onClick={() => onPick(d)} className="flex w-full items-center gap-2">
                <span className={cn("text-xs font-bold uppercase tracking-wide", isToday(d) ? "text-primary" : "text-muted-foreground")}>
                  {format(d, "EEE")}
                </span>
                <span className={cn("flex h-7 w-7 items-center justify-center rounded-full text-sm font-bold", isToday(d) ? "bg-primary text-white" : "text-foreground")}>
                  {format(d, "d")}
                </span>
                <span className="text-xs text-muted-foreground">{tasks.length} task{tasks.length !== 1 ? "s" : ""}</span>
              </button>
              {tasks.length > 0 && (
                <div className="mt-2 space-y-2">
                  {tasks.map((t) => <TaskCard key={t.id} task={t} />)}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DayView({ selected, setSelected, dayTasks }) {
  const tasks = dayTasks(selected);
  return (
    <div>
      <NavHeader
        label={format(selected, "EEEE, MMM d")}
        onPrev={() => setSelected(subDays(selected, 1))}
        onNext={() => setSelected(addDays(selected, 1))}
      />
      {tasks.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-20 text-center">
          <Circle className="h-8 w-8 text-muted-foreground/40" strokeWidth={1} />
          <div>
            <p className="font-display text-base font-bold text-foreground">Nothing scheduled</p>
            <p className="mt-1 text-sm text-muted-foreground">Your schedule is clear for this day.</p>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {tasks.map((t) => <TaskCard key={t.id} task={t} />)}
        </div>
      )}
    </div>
  );
}