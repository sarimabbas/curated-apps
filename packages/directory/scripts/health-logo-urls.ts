import { parseFrontmatter } from "@stacksjs/ts-md"
import { mkdirSync } from "node:fs"

const APP_GLOB = new Bun.Glob("apps/**/*.md")
const DEFAULT_CWD = new URL("..", import.meta.url).pathname
const OUTPUT_DIR = ".health"
const SUMMARY_FILE = `${OUTPUT_DIR}/logo-health-summary.json`
const REPORT_FILE = `${OUTPUT_DIR}/logo-health-report.md`
const TIMEOUT_MS = 12000

export type BrokenLogo = {
  appFile: string
  appName: string
  appSlug: string
  logoUrl: string
  reason: string
}

export function isRemoteUrl(value: unknown): value is string {
  return typeof value === "string" && /^https?:\/\//i.test(value)
}

async function probeUrl(url: string): Promise<{ ok: boolean; reason?: string }> {
  const headers = {
    "user-agent": "curated-apps-logo-health/1.0",
    accept: "image/*,*/*;q=0.8",
  }

  const tryRequest = async (method: "HEAD" | "GET") => {
    const response = await fetch(url, {
      method,
      headers,
      signal: AbortSignal.timeout(TIMEOUT_MS),
      redirect: "follow",
    })
    return response
  }

  try {
    const head = await tryRequest("HEAD")
    if (head.ok) return { ok: true }
    if (head.status === 405 || head.status === 501) {
      const get = await tryRequest("GET")
      if (get.ok) return { ok: true }
      return { ok: false, reason: `HTTP ${get.status}` }
    }

    const get = await tryRequest("GET")
    if (get.ok) return { ok: true }
    return { ok: false, reason: `HTTP ${get.status}` }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { ok: false, reason: message }
  }
}

export function buildHealthReport(checked: number, broken: BrokenLogo[]): string {
  const reportLines = [
    "# Directory Logo URL Health",
    "",
    `- Checked at: ${new Date().toISOString()}`,
    `- Checked remote logo URLs: ${checked}`,
    `- Broken logo URLs: ${broken.length}`,
    "",
  ]

  if (broken.length === 0) {
    reportLines.push("All checked remote logo URLs are healthy.")
  } else {
    reportLines.push("## Broken URLs", "")
    for (const item of broken) {
      reportLines.push(
        `- ${item.appName} (\`${item.appSlug}\`) in \`${item.appFile}\` -> ${item.logoUrl} (${item.reason})`,
      )
    }
  }

  return reportLines.join("\n")
}

async function main(): Promise<void> {
  const cwd = DEFAULT_CWD
  const broken: BrokenLogo[] = []
  let checked = 0

  for await (const appFile of APP_GLOB.scan({ cwd })) {
    const file = Bun.file(new URL(appFile, `file://${cwd}/`))
    const contents = await file.text()
    const { data } = parseFrontmatter(contents)

    if (!isRemoteUrl(data.logo)) {
      continue
    }

    checked += 1
    const result = await probeUrl(data.logo)
    if (!result.ok) {
      broken.push({
        appFile,
        appName: typeof data.name === "string" ? data.name : "Unknown",
        appSlug: typeof data.slug === "string" ? data.slug : "unknown",
        logoUrl: data.logo,
        reason: result.reason ?? "Unknown error",
      })
    }
  }

  mkdirSync(new URL(OUTPUT_DIR, `file://${cwd}/`), { recursive: true })

  const report = buildHealthReport(checked, broken)

  const summary = {
    checked,
    brokenCount: broken.length,
    reportPath: REPORT_FILE,
  }

  await Bun.write(new URL(REPORT_FILE, `file://${cwd}/`), report)
  await Bun.write(new URL(SUMMARY_FILE, `file://${cwd}/`), JSON.stringify(summary, null, 2))

  console.log(JSON.stringify(summary))
}

if (import.meta.main) {
  await main()
}
