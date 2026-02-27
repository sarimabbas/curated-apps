export const TAG_SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
export const TAG_LABEL_TITLE_CASE_REGEX = /^[A-Z][a-zA-Z0-9]*(?: [A-Z][a-zA-Z0-9]*)*$/

export function isSorted(values: string[]): boolean {
  for (let i = 1; i < values.length; i += 1) {
    const prev = values[i - 1]
    const curr = values[i]
    if (!prev || !curr) continue

    if (prev.localeCompare(curr) > 0) {
      return false
    }
  }

  return true
}
