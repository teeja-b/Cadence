import { format, parseISO } from "date-fns";
import { motion } from "framer-motion";
import { Plus } from "lucide-react";

export default function DateHeader({ date, isFirst, onAdd }) {
  const d = typeof date === "string" ? parseISO(date) : date;
  return (
    <motion.div
      initial={isFirst ? false : { opacity: 0, y: 6 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "40px" }}
      transition={{ duration: 0.3 }}
      className="flex items-end gap-3 px-5 pb-3"
    >
      <div className="flex flex-1 items-end gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-muted-foreground">
            {format(d, "EEEE")}
          </p>
          <h2 className="font-display text-[44px] font-extrabold leading-[0.95] text-foreground">
            {format(d, "d")}
          </h2>
        </div>
        <p className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.22em] text-muted-foreground">
          {format(d, "MMMM")}
        </p>
      </div>
      {onAdd && (
        <motion.button
          type="button"
          whileTap={{ scale: 0.92 }}
          onClick={onAdd}
          aria-label={`Add task on ${format(d, "EEEE d MMMM")}`}
          className="mb-1 flex h-9 w-9 items-center justify-center rounded-full border border-border/80 bg-primary/10 text-primary transition-colors hover:bg-primary/20"
        >
          <Plus className="h-[18px] w-[18px]" strokeWidth={2.25} />
        </motion.button>
      )}
    </motion.div>
  );
}
