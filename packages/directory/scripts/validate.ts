import { runFrontmatterChecks } from "./check-frontmatter"
import { runTagChecks } from "./check-tags"

export async function runAllChecks(options?: { cwd?: string }): Promise<string[]> {
  const [frontmatterErrors, tagErrors] = await Promise.all([
    runFrontmatterChecks(options),
    runTagChecks(options),
  ])

  return [...frontmatterErrors, ...tagErrors]
}

async function main(): Promise<void> {
  const errors = await runAllChecks()

  if (errors.length === 0) {
    console.log("Validation passed")
    return
  }

  console.error(`Validation failed with ${errors.length} issue(s):`)
  for (const error of errors) {
    console.error(`- ${error}`)
  }
  process.exit(1)
}

if (import.meta.main) {
  await main()
}
