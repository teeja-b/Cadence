import { STATUSES } from "@/lib/tasks";
import { cn } from "@/lib/utils";

const colorClasses = {
  taupe: "text-taupe",
  amber: "text-terracotta",
  green: "text-moss",
  brown: "text-primary",
  red: "text-rose-500 dark:text-rose-400",
};

export default function StatusBadge({ status, className, withLabel = true }) {
  const cfg = STATUSES[status] || STATUSES.not_started;
  const Icon = cfg.icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-xs font-medium",
        colorClasses[cfg.color],
        className
      )}
    >
      <Icon className="h-3.5 w-3.5" strokeWidth={2} />
      {withLabel && cfg.label}
    </span>
  );
}