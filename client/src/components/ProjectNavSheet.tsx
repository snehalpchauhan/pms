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
import { Checkbox } from "@/components/ui/checkbox";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import {
  normalizeOrderedIdsCheckedFirst,
  orderedProjectIdsForDisplay,
  quickMenuPreferencePayload,
} from "@/lib/projectSidebarOrder";

type MeUser = {
  id: number;
  projectSidebarOrder?: number[] | null;
  projectQuickMenuIds?: number[] | null;
  [key: string]: unknown;
}

function SortableProjectRow({
  project,
  isActive,
  showOnQuickMenu,
  onToggleQuickMenu,
  onSelect,
}: {
  project: Project;
  isActive: boolean;
  showOnQuickMenu: boolean;
  onToggleQuickMenu: (checked: boolean) => void;
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
        className="touch-none cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground p-1 rounded shrink-0"
        aria-label="Drag to reorder"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <div
        className="flex shrink-0 items-center"
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <Checkbox
          checked={showOnQuickMenu}
          onCheckedChange={(v) => onToggleQuickMenu(v === true)}
          aria-label={`Show ${project.name} on collapsed sidebar`}
          aria-describedby="project-sheet-quick-menu-hint"
        />
      </div>
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
  /** When user is in settings/profile/timecards/team-summary, selecting a project should return to tasks */
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
  const { user: authUser } = useAuth();
  const [orderedIds, setOrderedIds] = useState<string[]>(() => projects.map((p) => p.id));
  const [quickChecked, setQuickChecked] = useState<Set<string>>(() => new Set(projects.map((p) => p.id)));

  useLayoutEffect(() => {
    if (!open) return;
    const qm = authUser?.projectQuickMenuIds;
    let quick: Set<string>;
    if (qm == null) {
      quick = new Set(projects.map((p) => p.id));
    } else {
      const allowed = new Set(qm.map((n) => String(n)));
      quick = new Set(projects.map((p) => p.id).filter((id) => allowed.has(id)));
    }
    setQuickChecked(quick);
    setOrderedIds(
      orderedProjectIdsForDisplay(projects, authUser?.projectSidebarOrder ?? null, quick),
    );
  }, [open, projects, authUser?.projectQuickMenuIds, authUser?.projectSidebarOrder]);

  const idToProject = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function mergeMeCache(updated: MeUser) {
    queryClient.setQueryData<MeUser | null>(["/api/auth/me"], (old) => {
      if (!old) return old;
      return { ...old, ...updated };
    });
  }

  async function persistOrderOnly(ids: string[]) {
    const orderedProjectIds = ids.map((id) => Number(id)).filter((n) => Number.isInteger(n) && n > 0);
    if (orderedProjectIds.length !== projects.length) return;
    try {
      const res = await apiRequest("PUT", "/api/auth/me/project-sidebar-order", { orderedProjectIds });
      mergeMeCache((await res.json()) as MeUser);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Could not save order";
      toast({ title: "Could not save project order", description: msg, variant: "destructive" });
    }
  }

  async function persistOrderAndQuickMenu(ids: string[], quick: Set<string>) {
    const orderedProjectIds = ids.map((id) => Number(id)).filter((n) => Number.isInteger(n) && n > 0);
    if (orderedProjectIds.length !== projects.length) return;
    const quickMenuProjectIds = quickMenuPreferencePayload(projects, quick);
    try {
      const res = await apiRequest("PUT", "/api/auth/me/project-sidebar-order", {
        orderedProjectIds,
        quickMenuProjectIds,
      });
      mergeMeCache((await res.json()) as MeUser);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Could not save";
      toast({ title: "Could not save projects", description: msg, variant: "destructive" });
    }
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = orderedIds.indexOf(String(active.id));
    const newIndex = orderedIds.indexOf(String(over.id));
    if (oldIndex < 0 || newIndex < 0) return;
    const moved = arrayMove(orderedIds, oldIndex, newIndex);
    const normalized = normalizeOrderedIdsCheckedFirst(moved, projects, quickChecked);
    setOrderedIds(normalized);
    void persistOrderOnly(normalized);
  }

  function handleToggleQuick(projectId: string, checked: boolean) {
    const nextQuick = new Set(quickChecked);
    if (checked) nextQuick.add(projectId);
    else nextQuick.delete(projectId);
    const normalized = normalizeOrderedIdsCheckedFirst(orderedIds, projects, nextQuick);
    setQuickChecked(nextQuick);
    setOrderedIds(normalized);
    void persistOrderAndQuickMenu(normalized, nextQuick);
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" className="w-full sm:max-w-md flex flex-col gap-0 p-0">
        <SheetHeader className="px-6 pt-6 pb-2 text-left space-y-1">
          <SheetTitle>Projects</SheetTitle>
          <SheetDescription>
            Drag to reorder projects on the quick menu. Unchecked projects stay at the bottom (A–Z).
          </SheetDescription>
        </SheetHeader>
        <ScrollArea className="flex-1 px-6 pb-6">
          <p
            id="project-sheet-quick-menu-hint"
            className="text-xs text-muted-foreground mb-3 pr-2 leading-relaxed"
          >
            The checkbox controls whether each project appears on the collapsed left bar (quick menu). Order only
            applies to checked projects; unchecked ones are listed below in alphabetical order.
          </p>
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
                      showOnQuickMenu={quickChecked.has(id)}
                      onToggleQuickMenu={(checked) => handleToggleQuick(id, checked)}
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
