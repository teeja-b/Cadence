import { useEffect, useState } from "react";

export default function CurrentTimeIndicator() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(id);
  }, []);

  const h = now.getHours();
  const m = now.getMinutes();
  const ampm = h >= 12 ? "PM" : "AM";
  const hr = h % 12 === 0 ? 12 : h % 12;
  const label = `${hr}:${String(m).padStart(2, "0")} ${ampm}`;

  return (
    <div className="flex items-center gap-2.5 py-2 pl-8 pr-5">
      <span className="text-[11px] font-bold tabular-nums text-primary">{label}</span>
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-50" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
      </span>
      <div className="h-px flex-1 bg-gradient-to-r from-primary/50 to-transparent" />
    </div>
  );
}