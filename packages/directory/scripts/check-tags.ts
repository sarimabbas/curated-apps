import { parseFrontmatter } from "@stacksjs/ts-md"
import { isSorted, TAG_LABEL_TITLE_CASE_REGEX, TAG_SLUG_REGEX } from "./utils"

const APP_GLOB = new Bun.Glob("apps/**/*.md")
const DEFAULT_CWD = new URL("..", import.meta.url).pathname

export type TagCatalogEntry = {
  label: string
  slug: string
}

export function parseTagsFile(contents: string): { entries: TagCatalogEntry[]; errors: string[] } {
  const entries: TagCatalogEntry[] = []
  const errors: string[] = []

  const lines = contents.split("\n")
  for (const [index, rawLine] of lines.entries()) {
    const line = rawLine.trim()
    if (!line || line.startsWith("#")) continue

    if (!line.startsWith("- ")) {
      errors.push(`tags.md:${index + 1} must start with \"- \"`)
      continue
    }

    const match = /^-\s+([a-z0-9]+(?:-[a-z0-9]+)*)\s*\|\s*(.+)$/.exec(line)
    if (!match) {
      errors.push(`tags.md:${index + 1} must follow \"- slug | Label\" format`)
      continue
    }

    const slug = match[1]
    const label = match[2]
    if (!slug || !label) {
      errors.push(`tags.md:${index + 1} must follow \"- slug | Label\" format`)
      continue
    }

    entries.push({ label: label.trim(), slug })
  }

  return { entries, errors }
}

export async function runTagChecks(options?: { cwd?: string }): Promise<string[]> {
  const cwd = options?.cwd ?? DEFAULT_CWD
  const errors: string[] = []

  const tagsPath = new URL("tags.md", `file://${cwd}/`)
  const tagsContents = await Bun.file(tagsPath).text()
  const parsedTags = parseTagsFile(tagsContents)
  errors.push(...parsedTags.errors)

  const knownTagSlugs = parsedTags.entries.map(tag => tag.slug)
  const knownTagSet = new Set(knownTagSlugs)

  if (!isSorted(knownTagSlugs)) {
    errors.push("tags.md tag slugs must be sorted alphabetically")
  }

  for (const tag of parsedTags.entries) {
    if (!TAG_SLUG_REGEX.test(tag.slug)) {
      errors.push(`tags.md has invalid slug \"${tag.slug}\" (must be kebab-case)`)
    }

    if (!TAG_LABEL_TITLE_CASE_REGEX.test(tag.label)) {
      errors.push(`tags.md has invalid label \"${tag.label}\" (must be alphanumeric Title Case)`)
    }
  }

  for await (const appFile of APP_GLOB.scan({ cwd })) {
    const appPath = new URL(appFile, `file://${cwd}/`)
    const contents = await Bun.file(appPath).text()
    const { data } = parseFrontmatter(contents)

    if (!Array.isArray(data.tags)) {
      errors.push(`${appFile} tags must be an array`)
      continue
    }

    const stringTags = data.tags.filter((tag): tag is string => typeof tag === "string")

    if (!isSorted(stringTags)) {
      errors.push(`${appFile} tags must be sorted alphabetically`)
    }

    for (const tag of data.tags) {
      if (typeof tag !== "string" || !TAG_SLUG_REGEX.test(tag)) {
        errors.push(`${appFile} has invalid tag \"${String(tag)}\" (must be kebab-case slug)`)
        continue
      }

      if (!knownTagSet.has(tag)) {
        errors.push(`${appFile} references unknown tag \"${tag}\"`)
      }
    }
  }

  return errors
}

async function main(): Promise<void> {
  const errors = await runTagChecks()

  if (errors.length === 0) {
    console.log("Tag checks passed")
    return
  }

  console.error(`Tag checks failed with ${errors.length} issue(s):`)
  for (const error of errors) {
    console.error(`- ${error}`)
  }
  process.exit(1)
}

if (import.meta.main) {
  await main()
}
