import { vi } from 'vitest';

/**
 * jsdom has no layout, so dnd-kit's keyboard sorting can't find the next row. This lays out every
 * `[data-sortable-id]` row 100 px below the previous one in its list.
 */
export function mockSortableLayout() {
  const original = Element.prototype.getBoundingClientRect;
  return vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: Element,
  ) {
    const row = this.closest('[data-sortable-id]');
    if (!row?.parentElement) {
      return original.call(this);
    }
    const index = [...row.parentElement.children].indexOf(row);
    const top = index * 100;
    return {
      x: 0,
      y: top,
      top,
      left: 0,
      bottom: top + 80,
      right: 600,
      width: 600,
      height: 80,
      toJSON: () => ({}),
    } as DOMRect;
  });
}
