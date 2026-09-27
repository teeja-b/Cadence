import { db } from "@/api/client";

import { useEffect, useLayoutEffect, useState, useMemo, useRef } from "react";
import { addDays, format, isToday } from "date-fns";
import { motion } from "framer-motion";
import { Plus, Coffee } from "lucide-react";

import DateHeader from "@/components/DateHeader";
import TaskCard from "@/components/TaskCard";
import CurrentTimeIndicator from "@/components/CurrentTimeIndicator";
import TaskForm from "@/components/TaskForm";
import { formatTimeShort, parseTime } from "@/lib/tasks";

function EmptyDay() {
  return (
    <div className="flex items-center gap-3 px-8 py-5 text-muted-foreground/70">
      <Coffee className="h-4 w-4" strokeWidth={1.5} />
      <p className="text-sm font-medium">Nothing scheduled</p>
    </div>
  );
}

function Row({ task }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "40px" }}
      transition={{ duration: 0.25 }}
      className="relative pl-8 pr-5 pb-4"
    >
      <div className="absolute left-3 top-0 bottom-0 w-px bg-border" />
      <span className="absolute left-1.5 top-3 h-3 w-3 rounded-full bg-primary ring-4 ring-background" />
      <div className="mb-2 flex items-center gap-2">
        <span className="text-[11px] font-bold tabular-nums text-primary">
          {formatTimeShort(task.start_time)}
        </span>
        <div className="h-px flex-1 bg-border/70" />
      </div>
      <TaskCard task={task} />
    </motion.div>
  );
}

export default function Timeline() {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  // Days loaded before and after today. Both grow as you scroll.
  const [pastDays, setPastDays] = useState(0);
  const [days, setDays] = useState(30);
  const [formOpen, setFormOpen] = useState(false);
  const [formDate, setFormDate] = useState(null); // date picked with a header "+", or null for today
  const sentinelRef = useRef(null);
  const topSentinelRef = useRef(null);
  const heightBeforePrepend = useRef(null);

  const load = async () => {
    try {
      const all = await db.entities.Task.list("-created_date", 500);
      setTasks(all);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const unsub = db.entities.Task.subscribe(() => load());
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
    Object.values(map).forEach((arr) =>
      arr.sort((a, b) => (parseTime(a.start_time) || 0) - (parseTime(b.start_time) || 0))
    );
    return map;
  }, [scheduled]);

  const today = useMemo(() => new Date(), []);
  const nowMins = today.getHours() * 60 + today.getMinutes();

  const dayList = useMemo(
    () => Array.from({ length: pastDays + days }, (_, i) => addDays(today, i - pastDays)),
    [pastDays, days, today]
  );

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) setDays((d) => d + 30);
      },
      { rootMargin: "800px" }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // Scrolling up to the top loads 30 more past days above.
  useEffect(() => {
    const el = topSentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (!entries[0].isIntersecting) return;
        heightBeforePrepend.current = document.documentElement.scrollHeight;
        setPastDays((d) => d + 30);
      },
      { rootMargin: "400px 0px 0px 0px" }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // Keep the day you were looking at in place when past days are added above it.
  useLayoutEffect(() => {
    if (heightBeforePrepend.current == null) return;
    const added = document.documentElement.scrollHeight - heightBeforePrepend.current;
    heightBeforePrepend.current = null;
    if (added > 0) window.scrollBy(0, added);
  }, [pastDays]);

  const openForm = (date = null) => {
    setFormDate(date ? format(date, "yyyy-MM-dd") : null);
    setFormOpen(true);
  };

  return (
    <div className="mx-auto max-w-md">
      {/* overflow-anchor off: we adjust the scroll ourselves when past days are prepended */}
      <div className="pb-28" style={{ overflowAnchor: "none" }}>
        <div ref={topSentinelRef} className="h-px" />
        {dayList.map((date) => {
          const key = format(date, "yyyy-MM-dd");
          const dayTasks = byDate[key] || [];
          const todayFlag = isToday(date);

          let nowIdx = dayTasks.length;
          if (todayFlag) {
            for (let i = 0; i < dayTasks.length; i++) {
              if ((parseTime(dayTasks[i].start_time) || 0) > nowMins) {
                nowIdx = i;
                break;
              }
            }
          }

          return (
            <div key={key}>
              <DateHeader date={date} isFirst={todayFlag} onAdd={() => openForm(date)} />
              {dayTasks.length === 0 ? (
                <>
                  {todayFlag && <CurrentTimeIndicator />}
                  <EmptyDay />
                </>
              ) : (
                <div>
                  {dayTasks.map((t, i) => (
                    <div key={t.id}>
                      {todayFlag && i === nowIdx && <CurrentTimeIndicator />}
                      <Row task={t} />
                    </div>
                  ))}
                  {todayFlag && nowIdx === dayTasks.length && <CurrentTimeIndicator />}
                </div>
              )}
            </div>
          );
        })}
        <div ref={sentinelRef} className="h-10" />
      </div>

      <motion.button
        whileTap={{ scale: 0.92 }}
        onClick={() => openForm()}
        className="fixed bottom-24 left-1/2 z-30 flex h-14 w-14 -translate-x-1/2 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-[0_8px_24px_-6px_rgba(60,40,20,0.5)]"
        aria-label="New task"
      >
        <Plus className="h-6 w-6" strokeWidth={2.5} />
      </motion.button>

      <TaskForm open={formOpen} onClose={() => setFormOpen(false)} onSave={load} defaultDate={formDate} />
    </div>
  );
}
