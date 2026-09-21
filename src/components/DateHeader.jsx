import { format, parseISO } from "date-fns";
import { motion } from "framer-motion";

export default function DateHeader({ date, isFirst }) {
  const d = typeof date === "string" ? parseISO(date) : date;
  return (
    <motion.div
      initial={isFirst ? false : { opacity: 0, y: 6 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "40px" }}
      transition={{ duration: 0.3 }}
      className="flex items-end gap-3 px-5 pb-3"
    >
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
    </motion.div>
  );
}