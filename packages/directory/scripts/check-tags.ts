import { parseFrontmatter } from "@stacksjs/ts-md"
import { z } from "zod"

import { getFrontmatterBlock, getFrontmatterKeys } from "./check-apps"
import { isSorted, TAG_LABEL_TITLE_CASE_REGEX, TAG_SLUG_REGEX } from "./utils"

const APP_GLOB = new Bun.Glob("apps/**/*.md")
const TAG_GLOB = new Bun.Glob("tags/**/*.md")
const DEFAULT_CWD = new URL("..", import.meta.url).pathname

const tagSchema = z
  .object({
    name: z.string().min(1).regex(TAG_LABEL_TITLE_CASE_REGEX, "name must be alphanumeric Title Case"),
    slug: z.string().regex(TAG_SLUG_REGEX, "slug must be kebab-case"),
  })
  .strict()

export type TagCatalogEntry = {
  name: string
  slug: string
}

export async function loadTagCatalog(cwd: string): Promise<{
  entries: TagCatalogEntry[]
  slugSet: Set<string>
  errors: string[]
}> {
  const entries: TagCatalogEntry[] = []
  const errors: string[] = []
  const slugToFile = new Map<string, string>()

  for await (const tagFile of TAG_GLOB.scan({ cwd })) {
    const tagPath = new URL(tagFile, `file://${cwd}/`)
    const contents = await Bun.file(tagPath).text()
    const { data } = parseFrontmatter(contents)

    const frontmatter = getFrontmatterBlock(contents)
    if (!frontmatter) {
      errors.push(`${tagFile} is missing valid frontmatter block`)
      continue
    }

    const keys = getFrontmatterKeys(frontmatter)
    if (!isSorted(keys)) {
      errors.push(`${tagFile} frontmatter keys must be sorted alphabetically`)
    }

    const result = tagSchema.safeParse(data)
    if (!result.success) {
      for (const issue of result.error.issues) {
        const field = issue.path.join(".") || "frontmatter"
        errors.push(`${tagFile} -> ${field}: ${issue.message}`)
      }
      continue
    }

    const existing = slugToFile.get(result.data.slug)
    if (existing) {
      errors.push(`${tagFile} duplicates tag slug "${result.data.slug}" already used by ${existing}`)
      continue
    }

    slugToFile.set(result.data.slug, tagFile)
    entries.push(result.data)
  }

  return {
    entries,
    slugSet: new Set(entries.map(tag => tag.slug)),
    errors,
  }
}

export async function runTagChecks(options?: { cwd?: string }): Promise<string[]> {
  const cwd = options?.cwd ?? DEFAULT_CWD
  const errors: string[] = []

  const catalog = await loadTagCatalog(cwd)
  errors.push(...catalog.errors)

  if (catalog.entries.length === 0) {
    errors.push("tags directory must contain at least one tag file")
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
        errors.push(`${appFile} has invalid tag "${String(tag)}" (must be kebab-case slug)`)
        continue
      }

      if (!catalog.slugSet.has(tag)) {
        errors.push(`${appFile} references unknown tag "${tag}"`)
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
