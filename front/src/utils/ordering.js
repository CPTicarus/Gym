/**
 * The `order` for an item appended to `items`: one past the highest there.
 *
 * Not `items.length`. Orders keep their gaps after a delete, so a list
 * whose first two entries were removed can hold a single item at order 2 —
 * and a new one given its length (1) would sort ABOVE it instead of at the
 * end, where the trainer just added it.
 */
export function nextOrder(items) {
  return items.reduce((highest, item) => Math.max(highest, item.order ?? -1), -1) + 1;
}
