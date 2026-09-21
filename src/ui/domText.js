/** Assign visible text only when its serialized value actually changes. */
export function setTextIfChanged(element, value) {
  if (!element) return false;
  const next = String(value);
  if (element.textContent === next) return false;
  element.textContent = next;
  return true;
}
