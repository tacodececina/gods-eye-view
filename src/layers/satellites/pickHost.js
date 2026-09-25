import { DOCKED_COMPANION_RADIUS_M, ISS_NORAD } from './policy.js';

/**
 * Click resolution for co-located satellite points (P4 T4). Docked vehicles
 * share the host's SGP4 position (the 'stations' group stacks 8 objects on
 * the ISS), so a pointer pick returns whichever sits on top — usually a
 * visiting vehicle, never the ISS. A click on such a stack selects the host:
 * the ISS when present, else the first co-located id with a model asset. The
 * docked-companion exclusion (P4-23) is untouched; companions stay reachable
 * by search and API.
 */

/** Upper bound for the drillPick that reads the stack under the pointer. */
export const PICK_STACK_LIMIT = 16;

function withinDocked(points, anchor, id) {
  const position = points?.get(id)?.position;
  if (!position) return false;
  const dx = position.x - anchor.x;
  const dy = position.y - anchor.y;
  const dz = position.z - anchor.z;
  return (
    dx * dx + dy * dy + dz * dz <=
    DOCKED_COMPANION_RADIUS_M * DOCKED_COMPANION_RADIUS_M
  );
}

/**
 * @param {{pickedId: number, stackIds: Iterable<number>,
 *   points: Map<number, {position?: object}>,
 *   hasModel: (noradId: number) => boolean}} input `stackIds` are the
 *   catalog ids under the pointer, in drillPick order.
 * @returns {number} The id to select.
 */
export function resolveStackHost({ pickedId, stackIds, points, hasModel }) {
  const anchor = points?.get(pickedId)?.position;
  if (!anchor) return pickedId;
  const stack = [];
  for (const id of stackIds ?? []) {
    if (
      id !== pickedId &&
      !stack.includes(id) &&
      withinDocked(points, anchor, id)
    )
      stack.push(id);
  }
  if (stack.length === 0) return pickedId;
  if (pickedId === ISS_NORAD || stack.includes(ISS_NORAD)) return ISS_NORAD;
  if (hasModel?.(pickedId)) return pickedId;
  return stack.find((id) => hasModel?.(id) === true) ?? pickedId;
}
