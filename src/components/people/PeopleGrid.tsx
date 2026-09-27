/**
 * Mobile 3-column people grid. Presentation only — no membership RPCs.
 */

import PeopleGridItem, { type PeopleGridPerson } from "./PeopleGridItem";

type Props = {
  people: PeopleGridPerson[];
  /** Map person id → profile path when the person is linkable. */
  profileHrefById?: Record<string, string>;
  selectedIds?: ReadonlySet<string> | string[];
  onPersonClick?: (person: PeopleGridPerson) => void;
  onSelect?: (id: string) => void;
  /** When set, those person ids show a remove control. */
  removableIds?: ReadonlySet<string> | string[];
  onRemove?: (id: string) => void;
  emptyLabel?: string;
  className?: string;
};

function isSelected(
  id: string,
  selectedIds?: ReadonlySet<string> | string[]
): boolean {
  if (!selectedIds) return false;
  if (Array.isArray(selectedIds)) return selectedIds.includes(id);
  return selectedIds.has(id);
}

function isRemovable(
  id: string,
  removableIds?: ReadonlySet<string> | string[]
): boolean {
  if (!removableIds) return false;
  if (Array.isArray(removableIds)) return removableIds.includes(id);
  return removableIds.has(id);
}

export default function PeopleGrid({
  people,
  profileHrefById,
  selectedIds,
  onPersonClick,
  onSelect,
  removableIds,
  onRemove,
  emptyLabel = "No people.",
  className = "",
}: Props) {
  if (people.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-[var(--text)]/55">
        {emptyLabel}
      </p>
    );
  }

  return (
    <div
      className={`grid grid-cols-3 gap-x-2 gap-y-6 ${className}`.trim()}
      role="list"
    >
      {people.map((person) => (
        <div key={person.id} role="listitem" className="min-w-0">
          <PeopleGridItem
            person={person}
            profileHref={profileHrefById?.[person.id] ?? null}
            selected={isSelected(person.id, selectedIds)}
            onClick={
              onPersonClick ? () => onPersonClick(person) : undefined
            }
            onSelect={onSelect}
            showRemove={isRemovable(person.id, removableIds)}
            onRemove={onRemove}
          />
        </div>
      ))}
    </div>
  );
}

export type { PeopleGridPerson };
