/**
 * Merge a section's stored copy over the copy that ships in the code.
 *
 * Every block component keeps its translation slice as the base, so a field
 * the dashboard has never touched (or a whole block saved before a new field
 * existed) still renders the shipped text instead of a hole. Only values that
 * are actually present win — `null`/`undefined` mean "not set", while an empty
 * string is a deliberate blank and is honoured.
 */
export function mergeContent(base, override) {
  if (!override || typeof override !== 'object') return base;
  const out = { ...(base || {}) };
  for (const [key, value] of Object.entries(override)) {
    if (value === undefined || value === null) continue;
    out[key] = value;
  }
  return out;
}
