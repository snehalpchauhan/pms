import { useLayoutEffect, useMemo, useState } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import type { Project } from "@/lib/mockData";
import { resolveProjectChipAppearance } from "@shared/projectColors";
import { cn, getUserInitials } from "@/lib/utils";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { toast } from "@/hooks/use-toast";

type MeUser = {
  id: number;
  projectSidebarOrder?: number[] | null;
  [key: string]: unknown;
};

function SortableProjectRow({
  project,
  isActive,
  onSelect,
}: {
  project: Project;
  isActive: boolean;
  onSelect: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: project.id,
  });
  const chip = resolveProjectChipAppearance(project.color);
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex items-center gap-2 rounded-lg border bg-card px-2 py-2 text-sm",
        isDragging && "opacity-60 shadow-md z-10",
        isActive ? "border-primary ring-1 ring-primary/30" : "border-border",
      )}
    >
      <button
        type="button"
        className="touch-none cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground p-1 rounded"
        aria-label="Drag to reorder"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={onSelect}
        className="flex min-w-0 flex-1 items-center gap-3 text-left rounded-md px-1 py-0.5 hover:bg-muted/60"
      >
        <span
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-xs font-bold text-white shadow-sm",
            chip.tailwindClass || undefined,
          )}
          style={chip.style}
        >
          {getUserInitials(project.name, undefined)}
        </span>
        <span className="truncate font-medium">{project.name}</span>
      </button>
    </div>
  );
}

interface ProjectNavSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projects: Project[];
  currentProjectId: string | null | undefined;
  onSelectProject: (projectId: string) => void;
  /** When user is in settings/profile/timecards, selecting a project should return to tasks */
  leaveGlobalView?: () => void;
}

export function ProjectNavSheet({
  open,
  onOpenChange,
  projects,
  currentProjectId,
  onSelectProject,
  leaveGlobalView,
}: ProjectNavSheetProps) {
  const [orderedIds, setOrderedIds] = useState<string[]>(() => projects.map((p) => p.id));

  useLayoutEffect(() => {
    if (!open) return;
    setOrderedIds((prev) => {
      const want = new Set(projects.map((p) => p.id));
      if (prev.length === want.size && prev.every((id) => want.has(id))) {
        return prev;
      }
      return projects.map((p) => p.id);
    });
  }, [open, projects]);

  const idToProject = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  async function persistOrder(ids: string[]) {
    const orderedProjectIds = ids.map((id) => Number(id)).filter((n) => Number.isInteger(n) && n > 0);
    if (orderedProjectIds.length !== projects.length) return;
    try {
      const res = await apiRequest("PUT", "/api/auth/me/project-sidebar-order", { orderedProjectIds });
      const updated = (await res.json()) as MeUser;
      queryClient.setQueryData<MeUser | null>(["/api/auth/me"], (old) => {
        if (!old) return old;
        return { ...old, projectSidebarOrder: updated.projectSidebarOrder ?? orderedProjectIds };
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Could not save order";
      toast({ title: "Could not save project order", description: msg, variant: "destructive" });
    }
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = orderedIds.indexOf(String(active.id));
    const newIndex = orderedIds.indexOf(String(over.id));
    if (oldIndex < 0 || newIndex < 0) return;
    const next = arrayMove(orderedIds, oldIndex, newIndex);
    setOrderedIds(next);
    void persistOrder(next);
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" className="w-full sm:max-w-sm flex flex-col gap-0 p-0">
        <SheetHeader className="px-6 pt-6 pb-2 text-left space-y-1">
          <SheetTitle>Projects</SheetTitle>
          <SheetDescription>Drag to reorder your sidebar. Only you see this order.</SheetDescription>
        </SheetHeader>
        <ScrollArea className="flex-1 px-6 pb-6">
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={orderedIds} strategy={verticalListSortingStrategy}>
              <div className="flex flex-col gap-2 pr-2">
                {orderedIds.map((id) => {
                  const project = idToProject.get(id);
                  if (!project) return null;
                  return (
                    <SortableProjectRow
                      key={id}
                      project={project}
                      isActive={currentProjectId === id}
                      onSelect={() => {
                        onSelectProject(id);
                        leaveGlobalView?.();
                        onOpenChange(false);
                      }}
                    />
                  );
                })}
              </div>
            </SortableContext>
          </DndContext>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
