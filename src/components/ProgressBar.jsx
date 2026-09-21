import { cn } from "@/lib/utils";

export default function ProgressBar({ value = 0, className, size = "md" }) {
  const v = Math.max(0, Math.min(100, value || 0));
  const h = size === "sm" ? "h-1" : "h-1.5";
  return (
    <div className={cn("relative w-full overflow-hidden rounded-full bg-progress-track dark:bg-moss/15", h, className)}>
      <div
        className="absolute inset-y-0 left-0 rounded-full bg-moss transition-all duration-700 ease-out"
        style={{ width: `${v}%` }}
      />
    </div>
  );
}