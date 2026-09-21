import { useState } from "react";
import { Bell, Palette, CalendarDays, Sliders, ChevronRight, Moon, Sun } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { useTheme } from "@/lib/useTheme";
import { useAuth } from "@/lib/AuthContext";
import { cn } from "@/lib/utils";

function useLocalState(key, def) {
  const [v, setV] = useState(() => {
    const s = localStorage.getItem(key);
    return s === null ? def : s === "true";
  });
  const update = (val) => {
    setV(val);
    localStorage.setItem(key, String(val));
  };
  return [v, update];
}

function Group({ icon: Icon, title, children }) {
  return (
    <div className="mt-6">
      <div className="flex items-center gap-2 px-1 pb-2">
        <Icon className="h-4 w-4 text-primary" strokeWidth={2} />
        <h2 className="text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">{title}</h2>
      </div>
      <div className="overflow-hidden rounded-2xl border border-border/60 bg-card">{children}</div>
    </div>
  );
}

function Row({ label, desc, children, last }) {
  return (
    <div className={cn("flex items-center justify-between gap-3 px-4 py-3.5", !last && "border-b border-border/50")}>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-foreground">{label}</p>
        {desc && <p className="text-xs text-muted-foreground">{desc}</p>}
      </div>
      {children}
    </div>
  );
}

function LinkRow({ label, last, onClick }) {
  return (
    <button onClick={onClick} className={cn("flex w-full items-center justify-between px-4 py-3.5", !last && "border-b border-border/50")}>
      <p className="text-sm font-semibold text-foreground">{label}</p>
      <ChevronRight className="h-4 w-4 text-muted-foreground" />
    </button>
  );
}

export default function Settings() {
  const { theme, toggle } = useTheme();
  const { logout } = useAuth();
  const [reminders, setReminders] = useLocalState("set_reminders", true);
  const [taskNotif, setTaskNotif] = useLocalState("set_task_notif", true);
  const [weekMon, setWeekMon] = useLocalState("weekStartsOn", true);
  const [haptics, setHaptics] = useLocalState("set_haptics", true);
  const [compact, setCompact] = useLocalState("set_compact", false);

  return (
    <div className="mx-auto max-w-md px-5 pt-10">
      <h1 className="font-display text-3xl font-extrabold text-foreground">Settings</h1>

      <Group icon={Palette} title="Appearance">
        <Row label="Dark Mode" desc="Warm espresso night theme">
          <Switch checked={theme === "dark"} onCheckedChange={toggle} />
        </Row>
        <Row label="Accent" desc="Chocolate Brown">
          <div className="flex items-center gap-2">
            <span className="h-5 w-5 rounded-full bg-primary" />
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </div>
        </Row>
        <Row label="Compact Cards" desc="Denser timeline layout" last>
          <Switch checked={compact} onCheckedChange={setCompact} />
        </Row>
      </Group>

      <Group icon={Bell} title="Notifications">
        <Row label="Reminders" desc="Alert before scheduled tasks">
          <Switch checked={reminders} onCheckedChange={setReminders} />
        </Row>
        <Row label="Task Notifications" desc="Updates to your tasks" last>
          <Switch checked={taskNotif} onCheckedChange={setTaskNotif} />
        </Row>
      </Group>

      <Group icon={CalendarDays} title="Calendar">
        <Row label="Week Starts On" desc={weekMon ? "Monday" : "Sunday"}>
          <Switch checked={weekMon} onCheckedChange={(v) => { setWeekMon(v); localStorage.setItem("weekStartsOn", v ? "1" : "0"); }} />
        </Row>
        <Row label="Show Completed" desc="Display finished tasks" last>
          <Switch checked={true} onCheckedChange={() => {}} />
        </Row>
      </Group>

      <Group icon={Sliders} title="General">
        <Row label="Haptics" desc="Tactile feedback on actions">
          <Switch checked={haptics} onCheckedChange={setHaptics} />
        </Row>
        <LinkRow label="About" />
        <LinkRow label="Log out" onClick={() => logout()} last />
      </Group>

      <p className="px-1 pt-6 text-center text-[11px] text-muted-foreground">Cadence · v1.0</p>
    </div>
  );
}