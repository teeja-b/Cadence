import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import CategoryIcon from "@/components/CategoryIcon";
import StatusBadge from "@/components/StatusBadge";
import ProgressBar from "@/components/ProgressBar";
import { formatTime, formatDuration, durationMinutes } from "@/lib/tasks";

export default function TaskCard({ task }) {
  const navigate = useNavigate();
  const dur = durationMinutes(task.start_time, task.end_time);

  return (
    <motion.div
      whileTap={{ scale: 0.985 }}
      onClick={() => navigate(`/task/${task.id}`)}
      className="cursor-pointer rounded-2xl border border-border/60 bg-card p-3.5 shadow-[0_1px_2px_rgba(60,40,20,0.05),0_10px_30px_-18px_rgba(60,40,20,0.25)]"
    >
      <div className="flex items-start gap-3">
        <CategoryIcon category={task.category} size="sm" />
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-display text-[15px] font-bold leading-tight text-foreground">
            {task.title}
          </h3>
          <p className="mt-1 text-[12px] text-muted-foreground">
            {formatTime(task.start_time)}
            {task.end_time ? ` — ${formatTime(task.end_time)}` : ""}
            {dur != null && dur > 0 && (
              <span className="ml-1.5 text-muted-foreground/70">· {formatDuration(dur)}</span>
            )}
          </p>
        </div>
      </div>
      <div className="mt-3">
        <div className="flex items-center justify-between">
          <StatusBadge status={task.status} />
          <span className="text-[12px] font-bold tabular-nums text-moss">{task.progress}%</span>
        </div>
        <ProgressBar value={task.progress} className="mt-1.5" />
      </div>
    </motion.div>
  );
}