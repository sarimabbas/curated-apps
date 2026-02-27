import { runAppChecks } from "./check-apps"
import { runTagChecks } from "./check-tags"

export async function runAllChecks(options?: { cwd?: string }): Promise<string[]> {
  const [appErrors, tagErrors] = await Promise.all([
    runAppChecks(options),
    runTagChecks(options),
  ])

  return [...appErrors, ...tagErrors]
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
