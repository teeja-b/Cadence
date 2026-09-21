import { Outlet, useLocation, Link } from "react-router-dom";
import { Clock, CalendarDays, Settings } from "lucide-react";
import { cn } from "@/lib/utils";

const nav = [
  { to: "/", label: "Timeline", icon: Clock },
  { to: "/calendar", label: "Calendar", icon: CalendarDays },
  { to: "/settings", label: "Settings", icon: Settings },
];

export default function Layout() {
  const { pathname } = useLocation();
  return (
    <div className="min-h-[100dvh] bg-background">
      <main className="pb-24">
        <Outlet />
      </main>
      <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-border/60 bg-background/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-md items-stretch justify-around px-2 pb-safe">
          {nav.map((item) => {
            const active = pathname === item.to;
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                className="flex flex-1 flex-col items-center gap-1 py-2.5"
              >
                <Icon
                  className={cn("h-5 w-5 transition-colors", active ? "text-primary" : "text-muted-foreground")}
                  strokeWidth={active ? 2.5 : 1.75}
                />
                <span
                  className={cn(
                    "text-[10px] font-semibold tracking-wide transition-colors",
                    active ? "text-primary" : "text-muted-foreground"
                  )}
                >
                  {item.label}
                </span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}