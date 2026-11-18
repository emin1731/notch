import {
  type Announcements,
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface Item {
  id: string;
}

export interface SortableListProps<T extends Item> {
  items: readonly T[];
  /** The item's name in announcements and on its handle, e.g. a core's name. */
  getLabel: (item: T) => string;
  /** Called with every id in the new order. */
  onReorder: (ids: string[]) => void;
  /** Renders a row; place `handle` where the drag handle goes. */
  renderItem: (item: T, handle: ReactNode) => ReactNode;
  disabled?: boolean;
  className?: string;
}

/**
 * A vertical list reordered by dragging a handle, or from the keyboard: focus the handle, Space to
 * pick up, arrows to move, Space to drop, Escape to cancel. Screen readers hear each step.
 */
export function SortableList<T extends Item>({
  items,
  getLabel,
  onReorder,
  renderItem,
  disabled,
  className,
}: SortableListProps<T>) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const ids = items.map((item) => item.id);
  const label = (id: string | number) => {
    const item = items.find((candidate) => candidate.id === id);
    return item ? getLabel(item) : 'Item';
  };
  const position = (id: string | number) => ids.indexOf(String(id)) + 1;

  const announcements: Announcements = {
    onDragStart: ({ active }) =>
      `Picked up ${label(active.id)}, position ${position(active.id)} of ${ids.length}.`,
    onDragOver: ({ active, over }) =>
      over
        ? `${label(active.id)} moved to position ${position(over.id)} of ${ids.length}.`
        : undefined,
    onDragEnd: ({ active, over }) =>
      over
        ? `${label(active.id)} dropped at position ${position(over.id)} of ${ids.length}.`
        : `${label(active.id)} dropped.`,
    onDragCancel: ({ active }) => `Moving ${label(active.id)} cancelled.`,
  };

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) {
      return;
    }
    onReorder(arrayMove(ids, ids.indexOf(String(active.id)), ids.indexOf(String(over.id))));
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={onDragEnd}
      accessibility={{
        announcements,
        screenReaderInstructions: {
          draggable:
            'To reorder, press Space to pick up. Use the arrow keys to move, Space to drop, or Escape to cancel.',
        },
      }}
    >
      <SortableContext items={ids} strategy={verticalListSortingStrategy} disabled={disabled}>
        <ul className={className}>
          {items.map((item) => (
            <SortableRow key={item.id} id={item.id} label={getLabel(item)} disabled={disabled}>
              {(handle) => renderItem(item, handle)}
            </SortableRow>
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  );
}

function SortableRow({
  id,
  label,
  disabled,
  children,
}: {
  id: string;
  label: string;
  disabled?: boolean;
  children: (handle: ReactNode) => ReactNode;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, disabled });

  const handle = disabled ? null : (
    <Button
      ref={setActivatorNodeRef}
      type="button"
      variant="ghost"
      size="icon-sm"
      className="cursor-grab touch-none text-muted-foreground active:cursor-grabbing"
      {...attributes}
      {...listeners}
      aria-label={`Reorder ${label}`}
      aria-roledescription="sortable"
    >
      <GripVertical />
    </Button>
  );

  return (
    <li
      ref={setNodeRef}
      data-sortable-id={id}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn('relative', isDragging && 'z-10 opacity-80')}
    >
      {children(handle)}
    </li>
  );
}
