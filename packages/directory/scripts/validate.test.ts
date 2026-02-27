import { expect, test } from "bun:test"
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { getFrontmatterKeys, isSorted, runAppChecks } from "./check-apps"
import { loadTagCatalog, runTagChecks } from "./check-tags"
import { TAG_LABEL_TITLE_CASE_REGEX, TAG_SLUG_REGEX } from "./utils"
import { runAllChecks } from "./validate"

function createFixture(params: {
  appFrontmatter: string
  tagFiles: Record<string, string>
  appAssets?: Record<string, string>
}): string {
  const root = mkdtempSync(join(tmpdir(), "directory-validate-"))
  mkdirSync(join(root, "apps", "sample"), { recursive: true })
  mkdirSync(join(root, "tags"), { recursive: true })
  for (const [fileName, contents] of Object.entries(params.tagFiles)) {
    writeFileSync(join(root, "tags", fileName), `${contents}\n`)
  }
  writeFileSync(join(root, "apps", "sample", "sample.md"), `${params.appFrontmatter}\n`)
  for (const [fileName, contents] of Object.entries(params.appAssets ?? {})) {
    writeFileSync(join(root, "apps", "sample", fileName), contents)
  }
  return root
}

test("isSorted validates lexical order", () => {
  expect(isSorted(["Apple", "Pie Menus", "Tools"])).toBe(true)
  expect(isSorted(["Pie Menus", "Apple"])).toBe(false)
})

test("frontmatter key extraction ignores values", () => {
  const keys = getFrontmatterKeys(`apple_app_store: https://apps.apple.com\nname: Pieoneer\ntags:\n  - Pie Menus`)
  expect(keys).toEqual(["apple_app_store", "name", "tags"])
})

test("tag regexes accept and reject expected values", () => {
  expect(TAG_LABEL_TITLE_CASE_REGEX.test("Pie Menus")).toBe(true)
  expect(TAG_LABEL_TITLE_CASE_REGEX.test("pie Menus")).toBe(false)
  expect(TAG_LABEL_TITLE_CASE_REGEX.test("Pie-Menus")).toBe(false)
  expect(TAG_SLUG_REGEX.test("pie-menus")).toBe(true)
  expect(TAG_SLUG_REGEX.test("Pie-Menus")).toBe(false)
})

test("loadTagCatalog reads tag frontmatter files", async () => {
  const root = createFixture({
    appFrontmatter: `---
apple_app_store: https://apps.apple.com/us/app/pieoneer/id6739781207?mt=12
description: Let your apps fly in a pie.
logo: https://example.com/icon.png
name: Pieoneer
slug: pieoneer
tags:
  - pie-menus
website: https://example.com
---`,
    tagFiles: {
      "pie-menus.md": `---
name: Pie Menus
slug: pie-menus
---`,
    },
  })

  const catalog = await loadTagCatalog(root)
  expect(catalog.entries).toEqual([{ name: "Pie Menus", slug: "pie-menus" }])
  expect(catalog.errors).toHaveLength(0)
})

test("checks pass on valid content", async () => {
  const root = createFixture({
    tagFiles: {
      "pie-menus.md": `---
name: Pie Menus
slug: pie-menus
---`,
      "productivity.md": `---
name: Productivity
slug: productivity
---`,
    },
    appFrontmatter: `---
apple_app_store: https://apps.apple.com/us/app/pieoneer/id6739781207?mt=12
description: Let your apps fly in a pie.
logo: ./logo.svg
name: Pieoneer
slug: pieoneer
tags:
  - pie-menus
  - productivity
website: https://example.com
---`,
    appAssets: {
      "logo.svg": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 10 10\"><rect width=\"10\" height=\"10\"/></svg>",
    },
  })

  const [appErrors, tagErrors, allErrors] = await Promise.all([
    runAppChecks({ cwd: root }),
    runTagChecks({ cwd: root }),
    runAllChecks({ cwd: root }),
  ])

  expect(appErrors).toHaveLength(0)
  expect(tagErrors).toHaveLength(0)
  expect(allErrors).toHaveLength(0)
})

test("checks report frontmatter and tag convention issues", async () => {
  const root = createFixture({
    tagFiles: {
      "pie-menus.md": `---
slug: pie-menus
name: Pie Menus
---`,
    },
    appFrontmatter: `---
name: Pieoneer
apple_app_store: https://apps.apple.com/us/app/pieoneer/id6739781207?mt=12
description: Let your apps fly in a pie.
logo: https://example.com/icon.png
slug: pieoneer
tags:
  - pie menus
website: https://example.com
---`,
  })

  const [appErrors, tagErrors] = await Promise.all([
    runAppChecks({ cwd: root }),
    runTagChecks({ cwd: root }),
  ])

  expect(appErrors.some(error => error.includes("frontmatter keys must be sorted"))).toBe(true)
  expect(tagErrors.some(error => error.includes("must be kebab-case slug"))).toBe(true)
})

test("app checks fail for missing local logo file", async () => {
  const root = createFixture({
    tagFiles: {
      "pie-menus.md": `---
name: Pie Menus
slug: pie-menus
---`,
    },
    appFrontmatter: `---
apple_app_store: https://apps.apple.com/us/app/pieoneer/id6739781207?mt=12
description: Let your apps fly in a pie.
logo: ./logo.png
name: Pieoneer
slug: pieoneer
tags:
  - pie-menus
website: https://example.com
---`,
  })

  const appErrors = await runAppChecks({ cwd: root })
  expect(appErrors.some(error => error.includes("missing local logo file"))).toBe(true)
})

test("app checks reject local logo names outside logo.<ext>", async () => {
  const root = createFixture({
    tagFiles: {
      "pie-menus.md": `---
name: Pie Menus
slug: pie-menus
---`,
    },
    appFrontmatter: `---
apple_app_store: https://apps.apple.com/us/app/pieoneer/id6739781207?mt=12
description: Let your apps fly in a pie.
logo: icon.png
name: Pieoneer
slug: pieoneer
tags:
  - pie-menus
website: https://example.com
---`,
  })

  const appErrors = await runAppChecks({ cwd: root })
  expect(appErrors.some(error => error.includes("logo must be an https URL or a relative local file like ./logo.png"))).toBe(true)
})

test("app checks reject parent directory logo paths", async () => {
  const root = createFixture({
    tagFiles: {
      "pie-menus.md": `---
name: Pie Menus
slug: pie-menus
---`,
    },
    appFrontmatter: `---
apple_app_store: https://apps.apple.com/us/app/pieoneer/id6739781207?mt=12
description: Let your apps fly in a pie.
logo: ../logo.png
name: Pieoneer
slug: pieoneer
tags:
  - pie-menus
website: https://example.com
---`,
  })

  const appErrors = await runAppChecks({ cwd: root })
  expect(appErrors.some(error => error.includes("logo must be an https URL or a relative local file like ./logo.png"))).toBe(true)
})

test("checks report duplicate app and tag slugs", async () => {
  const root = mkdtempSync(join(tmpdir(), "directory-validate-"))
  mkdirSync(join(root, "apps", "a"), { recursive: true })
  mkdirSync(join(root, "apps", "b"), { recursive: true })
  mkdirSync(join(root, "tags"), { recursive: true })

  writeFileSync(
    join(root, "apps", "a", "a.md"),
    `---
apple_app_store: https://apps.apple.com/us/app/pieoneer/id6739781207?mt=12
description: A
logo: https://example.com/a.png
name: A
slug: duplicate-app
tags:
  - duplicate-tag
website: https://example.com/a
---\n`,
  )

  writeFileSync(
    join(root, "apps", "b", "b.md"),
    `---
apple_app_store: https://apps.apple.com/us/app/pieoneer/id6739781207?mt=12
description: B
logo: https://example.com/b.png
name: B
slug: duplicate-app
tags:
  - duplicate-tag
website: https://example.com/b
---\n`,
  )

  writeFileSync(join(root, "tags", "one.md"), `---\nname: Duplicate Tag\nslug: duplicate-tag\n---\n`)
  writeFileSync(join(root, "tags", "two.md"), `---\nname: Duplicate Tag Two\nslug: duplicate-tag\n---\n`)

  const [appErrors, tagErrors] = await Promise.all([
    runAppChecks({ cwd: root }),
    runTagChecks({ cwd: root }),
  ])

  expect(appErrors.some(error => error.includes("duplicates app slug"))).toBe(true)
  expect(tagErrors.some(error => error.includes("duplicates tag slug"))).toBe(true)
})
