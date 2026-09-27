=import { db } from "@/api/client";

import { useEffect, useState } from "react";
import { format } from "date-fns";
import {
    Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import {
    Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";

import { CATEGORIES, STATUSES, STATUS_ORDER } from "@/lib/tasks";
import { cn } from "@/lib/utils";

export default function TaskForm({ open, onClose, onSave, task, parentId, defaultDate }) {
    const [form, setForm] = useState(null);

    useEffect(() => {
        if (!open) return;
        if (task) {
            setForm({
                title: task.title || "",
                description: task.description || "",
                category: task.category || "personal",
                status: task.status || "not_started",
                progress: task.progress ?? 0,
                start_date: task.start_date || format(new Date(), "yyyy-MM-dd"),
                start_time: task.start_time || "09:00",
                end_time: task.end_time || "10:00",
            });
        } else {
            setForm({
                title: "",
                description: "",
                category: "personal",
                status: "not_started",
                progress: 0,
                // A date passed in from the timeline "+" wins over today.
                start_date: defaultDate || format(new Date(), "yyyy-MM-dd"),
                start_time: "09:00",
                end_time: "10:00",
            });
        }
    }, [open, task, defaultDate]);

    if (!form) return null;

    const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

    const save = async () => {
        if (!form.title.trim()) return;
        const payload = {
            title: form.title.trim(),
            description: form.description,
            category: form.category,
            status: form.status,
            progress: Number(form.progress),
            start_date: form.start_date || null,
            start_time: form.start_time || null,
            end_time: form.end_time || null,
        };
        if (parentId) payload.parent_id = parentId;
        if (task) {
            await db.entities.Task.update(task.id, payload);
        } else {
            await db.entities.Task.create(payload);
        }
        onSave?.();
        onClose();
    };

    return (
        <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
            <SheetContent
                side="bottom"
                className="mx-auto max-h-[92vh] max-w-md rounded-t-3xl p-0"
            >
                <SheetHeader className="px-5 pt-5 pb-2">
                    <SheetTitle className="font-display text-xl font-extrabold">
                        {task ? "Edit Task" : "New Task"}
                    </SheetTitle>
                </SheetHeader>
                <div className="max-h-[55vh] overflow-y-auto px-5 pb-4">
                    <div className="space-y-5 py-2">
                        <div className="space-y-1.5">
                            <Label className="text-xs font-semibold text-muted-foreground">Title</Label>
                            <Input
                                value={form.title}
                                onChange={(e) => set("title", e.target.value)}
                                placeholder="Task name"
                                className="text-base"
                                autoFocus
                            />
                        </div>

                        <div className="space-y-1.5">
                            <Label className="text-xs font-semibold text-muted-foreground">Category</Label>
                            <Select value={form.category} onValueChange={(v) => set("category", v)}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    {Object.entries(CATEGORIES).map(([k, c]) => (
                                        <SelectItem key={k} value={k}>{c.label}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-1.5">
                            <Label className="text-xs font-semibold text-muted-foreground">Status</Label>
                            <Select value={form.status} onValueChange={(v) => set("status", v)}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    {STATUS_ORDER.map((s) => (
                                        <SelectItem key={s} value={s}>{STATUSES[s].label}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-1.5">
                            <Label className="text-xs font-semibold text-muted-foreground">Schedule</Label>
                            <div className="grid grid-cols-3 gap-2">
                                <Input
                                    type="date"
                                    value={form.start_date || ""}
                                    onChange={(e) => set("start_date", e.target.value)}
                                />
                                <Input
                                    type="time"
                                    value={form.start_time || ""}
                                    onChange={(e) => set("start_time", e.target.value)}
                                />
                                <Input
                                    type="time"
                                    value={form.end_time || ""}
                                    onChange={(e) => set("end_time", e.target.value)}
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <Label className="text-xs font-semibold text-muted-foreground">Progress</Label>
                                <span className="text-sm font-bold tabular-nums text-primary">{form.progress}%</span>
                            </div>
                            <Slider
                                value={[form.progress]}
                                max={100}
                                step={5}
                                onValueChange={(v) => set("progress", v[0])}
                            />
                            <div className="flex gap-1.5">
                                {[0, 25, 50, 75, 100].map((p) => (
                                    <button
                                        key={p}
                                        type="button"
                                        onClick={() => set("progress", p)}
                                        className={cn(
                                            "flex-1 rounded-lg py-1.5 text-xs font-semibold transition-colors",
                                            form.progress === p
                                                ? "bg-primary text-primary-foreground"
                                                : "bg-muted text-muted-foreground"
                                        )}
                                    >
                                        {p}%
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="space-y-1.5">
                            <Label className="text-xs font-semibold text-muted-foreground">Notes</Label>
                            <Textarea
                                value={form.description}
                                onChange={(e) => set("description", e.target.value)}
                                placeholder="Add notes…"
                                rows={4}
                            />
                        </div>
                    </div>
                </div>
                <SheetFooter className="flex-row gap-3 px-5 pb-6 pt-3">
                    <Button variant="ghost" className="flex-1" onClick={onClose}>Cancel</Button>
                    <Button className="flex-1" onClick={save} disabled={!form.title.trim()}>
                        {task ? "Save" : "Create"}
                    </Button>
                </SheetFooter>
            </SheetContent>
        </Sheet>
    );
}