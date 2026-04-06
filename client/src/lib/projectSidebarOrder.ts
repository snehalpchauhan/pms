import type { Project } from "@/lib/mockData";

/**
 * Apply the user's saved sidebar order; projects missing from the list are appended alphabetically.
 */
export function sortProjectsBySidebarOrder(
  projects: Project[],
  order: number[] | null | undefined,
): Project[] {
  const byId = new Map(projects.map((p) => [Number(p.id), p]));
  const seen = new Set<number>();
  const ordered: Project[] = [];
  if (order?.length) {
    for (const rawId of order) {
      const id = Number(rawId);
      if (!Number.isInteger(id) || id <= 0) continue;
      const p = byId.get(id);
      if (p) {
        ordered.push(p);
        seen.add(id);
      }
    }
  }
  const rest = projects
    .filter((p) => !seen.has(Number(p.id)))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
  return [...ordered, ...rest];
}
