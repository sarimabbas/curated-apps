import { parseFrontmatter } from "@stacksjs/ts-md"
import { z } from "zod"
import { isSorted, TAG_SLUG_REGEX } from "./utils"

export { isSorted } from "./utils"

const APP_GLOB = new Bun.Glob("apps/**/*.md")
const DEFAULT_CWD = new URL("..", import.meta.url).pathname

const appSchema = z
  .object({
    apple_app_store: z.url(),
    description: z.string().min(1),
    logo: z.url(),
    name: z.string().min(1),
    slug: z.string().regex(TAG_SLUG_REGEX, "app slug must be a kebab-case slug"),
    tags: z.array(z.string().regex(TAG_SLUG_REGEX, "tag must be a kebab-case slug")).min(1),
    website: z.url(),
  })
  .strict()

export function getFrontmatterBlock(contents: string): string | null {
  if (!contents.startsWith("---\n")) {
    return null
  }

  const endIndex = contents.indexOf("\n---", 4)
  if (endIndex === -1) {
    return null
  }

  return contents.slice(4, endIndex)
}

export function getFrontmatterKeys(frontmatterBlock: string): string[] {
  return frontmatterBlock
    .split("\n")
    .map(line => line.trim())
    .filter(Boolean)
    .filter(line => !line.startsWith("#"))
    .map(line => /^([a-z0-9_]+)\s*:/.exec(line)?.[1])
    .filter((key): key is string => Boolean(key))
}

export async function runAppChecks(options?: { cwd?: string }): Promise<string[]> {
  const cwd = options?.cwd ?? DEFAULT_CWD
  const errors: string[] = []
  const appSlugToFile = new Map<string, string>()

  for await (const appFile of APP_GLOB.scan({ cwd })) {
    const appPath = new URL(appFile, `file://${cwd}/`)
    const contents = await Bun.file(appPath).text()
    const { data } = parseFrontmatter(contents)

    const result = appSchema.safeParse(data)
    if (!result.success) {
      for (const issue of result.error.issues) {
        const field = issue.path.join(".") || "frontmatter"
        errors.push(`${appFile} -> ${field}: ${issue.message}`)
      }
    }

    const frontmatter = getFrontmatterBlock(contents)
    if (!frontmatter) {
      errors.push(`${appFile} is missing valid frontmatter block`)
      continue
    }

    const keys = getFrontmatterKeys(frontmatter)
    if (!isSorted(keys)) {
      errors.push(`${appFile} frontmatter keys must be sorted alphabetically`)
    }

    if (typeof data.slug === "string") {
      const existing = appSlugToFile.get(data.slug)
      if (existing) {
        errors.push(`${appFile} duplicates app slug "${data.slug}" already used by ${existing}`)
      } else {
        appSlugToFile.set(data.slug, appFile)
      }
    }
  }

  return errors
}

async function main(): Promise<void> {
  const errors = await runAppChecks()

  if (errors.length === 0) {
    console.log("App checks passed")
    return
  }

  console.error(`App checks failed with ${errors.length} issue(s):`)
  for (const error of errors) {
    console.error(`- ${error}`)
  }
  process.exit(1)
}

if (import.meta.main) {
  await main()
}
