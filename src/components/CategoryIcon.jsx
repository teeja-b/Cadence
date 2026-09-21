import { CATEGORIES } from "@/lib/tasks";
import { cn } from "@/lib/utils";

const sizes = {
  sm: { box: "h-7 w-7 rounded-lg", icon: "h-3.5 w-3.5" },
  md: { box: "h-10 w-10 rounded-xl", icon: "h-5 w-5" },
  lg: { box: "h-12 w-12 rounded-2xl", icon: "h-6 w-6" },
};

export default function CategoryIcon({ category, size = "md", className }) {
  const cfg = CATEGORIES[category] || CATEGORIES.personal;
  const Icon = cfg.icon;
  const s = sizes[size] || sizes.md;
  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center bg-primary/10 text-primary",
        s.box,
        className
      )}
    >
      <Icon className={s.icon} strokeWidth={1.75} />
    </div>
  );
}