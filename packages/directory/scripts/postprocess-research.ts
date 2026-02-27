import { parseFrontmatter } from "@stacksjs/ts-md"

const ALLOWED_IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "webp", "svg", "gif", "avif"])

type ProcessResult = {
  file: string
  changed: boolean
  reason?: string
}

export function isRemoteUrl(value: unknown): value is string {
  return typeof value === "string" && /^https?:\/\//i.test(value)
}

export function extensionFromContentType(contentType: string | null): string | null {
  if (!contentType) return null
  const normalized = contentType.split(";")[0]?.trim().toLowerCase()
  const map: Record<string, string> = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/webp": "webp",
    "image/svg+xml": "svg",
    "image/gif": "gif",
    "image/avif": "avif",
  }

  return normalized ? map[normalized] ?? null : null
}

export function extensionFromUrl(url: string): string | null {
  try {
    const pathname = new URL(url).pathname
    const last = pathname.split("/").pop() ?? ""
    const ext = last.includes(".") ? last.split(".").pop()?.toLowerCase() : null
    if (!ext) return null
    return ALLOWED_IMAGE_EXTENSIONS.has(ext) ? ext : null
  } catch {
    return null
  }
}

function yamlScalar(value: string): string {
  return JSON.stringify(value)
}

export function renderFrontmatter(data: Record<string, unknown>): string {
  const keys = Object.keys(data).sort((a, b) => a.localeCompare(b))
  const lines: string[] = []

  for (const key of keys) {
    const value = data[key]
    if (Array.isArray(value)) {
      lines.push(`${key}:`)
      for (const item of value) {
        lines.push(`  - ${yamlScalar(String(item))}`)
      }
      continue
    }

    if (typeof value === "string") {
      lines.push(`${key}: ${yamlScalar(value)}`)
      continue
    }

    if (typeof value === "number" || typeof value === "boolean") {
      lines.push(`${key}: ${String(value)}`)
      continue
    }

    lines.push(`${key}: ${yamlScalar(String(value ?? ""))}`)
  }

  return `---\n${lines.join("\n")}\n---\n`
}

function splitFrontmatter(contents: string): { frontmatter: string; body: string } | null {
  const match = /^---\n([\s\S]*?)\n---\n?/.exec(contents)
  if (!match) return null
  const full = match[0]
  return {
    frontmatter: match[1] ?? "",
    body: contents.slice(full.length),
  }
}

async function downloadAndLocalizeLogo(filePath: string): Promise<ProcessResult> {
  const file = Bun.file(filePath)
  const contents = await file.text()
  const parts = splitFrontmatter(contents)
  if (!parts) {
    return { file: filePath, changed: false, reason: "missing frontmatter" }
  }

  const parsed = parseFrontmatter(contents)
  const data = parsed.data as Record<string, unknown>

  if (!isRemoteUrl(data.logo)) {
    return { file: filePath, changed: false, reason: "logo is already local or absent" }
  }

  const response = await fetch(data.logo, {
    redirect: "follow",
    signal: AbortSignal.timeout(15000),
    headers: {
      "user-agent": "curated-apps-logo-postprocess/1.0",
      accept: "image/*,*/*;q=0.8",
    },
  })

  if (!response.ok) {
    return { file: filePath, changed: false, reason: `download failed (HTTP ${response.status})` }
  }

  const ext = extensionFromContentType(response.headers.get("content-type")) ?? extensionFromUrl(data.logo)
  if (!ext || !ALLOWED_IMAGE_EXTENSIONS.has(ext)) {
    return { file: filePath, changed: false, reason: "unsupported or unknown image extension" }
  }

  const appDir = filePath.slice(0, filePath.lastIndexOf("/"))
  const localLogoRelative = `./logo.${ext}`
  const localLogoAbsolute = `${appDir}/logo.${ext}`
  await Bun.write(localLogoAbsolute, await response.arrayBuffer())

  const logoFile = Bun.file(localLogoAbsolute)
  if (!logoFile.type.startsWith("image/")) {
    return { file: filePath, changed: false, reason: "downloaded file is not an image" }
  }

  data.logo = localLogoRelative

  const updatedFrontmatter = renderFrontmatter(data)
  const nextContents = `${updatedFrontmatter}${parts.body}`
  await Bun.write(filePath, nextContents)

  return { file: filePath, changed: true }
}

async function main(): Promise<void> {
  const files = Bun.argv.slice(2)
  if (files.length === 0) {
    console.log("No files provided; skipping logo postprocess")
    return
  }

  const results: ProcessResult[] = []
  for (const filePath of files) {
    if (!filePath.endsWith(".md")) continue
    if (!filePath.includes("/apps/")) continue

    try {
      const result = await downloadAndLocalizeLogo(filePath)
      results.push(result)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      results.push({ file: filePath, changed: false, reason: message })
    }
  }

  const changed = results.filter(result => result.changed)
  const skipped = results.filter(result => !result.changed)

  console.log(`Localized logos for ${changed.length} file(s)`)
  for (const result of changed) {
    console.log(`- updated ${result.file}`)
  }
  for (const result of skipped) {
    if (!result.reason) continue
    console.log(`- skipped ${result.file}: ${result.reason}`)
  }
}

if (import.meta.main) {
  await main()
}
