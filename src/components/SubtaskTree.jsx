import { useNavigate } from "react-router-dom";
import { ChevronRight, Plus, GripVertical } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import CategoryIcon from "@/components/CategoryIcon";
import { getChildren, hasChildren, STATUSES } from "@/lib/tasks";
import { cn } from "@/lib/utils";

function SubtaskGroup({ tasks, parentId, depth, expanded, toggleExpand, onReorder, onAddSubtask }) {
  const children = getChildren(tasks, parentId);
  return (
    <Droppable droppableId={parentId || "root"} type="siblings">
      {(provided) => (
        <div
          ref={provided.innerRef}
          {...provided.droppableProps}
          className={cn(depth > 0 && "ml-3 border-l border-border/60 pl-2")}
        >
          {children.map((task, index) => (
            <Draggable key={task.id} draggableId={task.id} index={index}>
              {(p, s) => (
                <div ref={p.innerRef} {...p.draggableProps} className={cn(s.isDragging && "z-50")}>
                  <NodeWrapper
                    task={task}
                    tasks={tasks}
                    depth={depth}
                    expanded={expanded}
                    toggleExpand={toggleExpand}
                    onReorder={onReorder}
                    onAddSubtask={onAddSubtask}
                    provided={p}
                  />
                </div>
              )}
            </Draggable>
          ))}
          {provided.placeholder}
        </div>
      )}
    </Droppable>
  );
}

function NodeWrapper({ task, tasks, depth, expanded, toggleExpand, onReorder, onAddSubtask, provided }) {
  const navigate = useNavigate();
  const kids = hasChildren(tasks, task.id);
  const isOpen = expanded.has(task.id);
  const StatusIcon = (STATUSES[task.status] || STATUSES.not_started).icon;
  const statusColor = {
    not_started: "text-taupe",
    in_progress: "text-terracotta",
    completed: "text-moss",
    on_hold: "text-primary",
    cancelled: "text-rose-500 dark:text-rose-400",
  }[task.status] || "text-taupe";

  return (
    <div className="py-0.5">
      <div className="flex items-center gap-1.5 rounded-xl px-1.5 py-2 hover:bg-muted/50">
        <span {...provided.dragHandleProps} className="cursor-grab touch-none text-muted-foreground/40 active:cursor-grabbing">
          <GripVertical className="h-4 w-4" />
        </span>
        <button
          onClick={() => kids && toggleExpand(task.id)}
          className={cn("flex h-5 w-5 items-center justify-center", !kids && "invisible")}
        >
          <ChevronRight className={cn("h-4 w-4 text-muted-foreground transition-transform duration-200", isOpen && "rotate-90")} />
        </button>
        <CategoryIcon category={task.category} size="sm" />
        <button onClick={() => navigate(`/task/${task.id}`)} className="min-w-0 flex-1 text-left">
          <p className="truncate text-sm font-semibold text-foreground">{task.title}</p>
        </button>
        <span className="text-xs font-semibold tabular-nums text-muted-foreground">{task.progress}%</span>
        <StatusIcon className={cn("h-4 w-4", statusColor)} strokeWidth={2} />
        <button
          onClick={() => onAddSubtask(task.id)}
          className="flex h-6 w-6 items-center justify-center rounded-lg text-muted-foreground/50 hover:bg-primary/10 hover:text-primary"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>
      <AnimatePresence initial={false}>
        {isOpen && kids && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <SubtaskGroup
              tasks={tasks}
              parentId={task.id}
              depth={depth + 1}
              expanded={expanded}
              toggleExpand={toggleExpand}
              onReorder={onReorder}
              onAddSubtask={onAddSubtask}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function SubtaskTree({ tasks, parentId, expanded, toggleExpand, onReorder, onAddSubtask }) {
  const handleDragEnd = (res) => {
    if (!res.destination || res.destination.index === res.source.index) return;
    const pid = res.source.droppableId === "root" ? null : res.source.droppableId;
    onReorder(pid, res.source.index, res.destination.index);
  };

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      <SubtaskGroup
        tasks={tasks}
        parentId={parentId}
        depth={0}
        expanded={expanded}
        toggleExpand={toggleExpand}
        onReorder={onReorder}
        onAddSubtask={onAddSubtask}
      />
    </DragDropContext>
  );
}