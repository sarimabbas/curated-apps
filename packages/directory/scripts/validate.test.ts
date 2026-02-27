import { expect, test } from "bun:test"
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { getFrontmatterKeys, isSorted, runFrontmatterChecks } from "./check-frontmatter"
import {
  parseTagsFile,
  runTagChecks,
} from "./check-tags"
import { TAG_LABEL_TITLE_CASE_REGEX, TAG_SLUG_REGEX } from "./utils"
import { runAllChecks } from "./validate"

function createFixture(params: { appFrontmatter: string; tags: string }): string {
  const root = mkdtempSync(join(tmpdir(), "directory-validate-"))
  mkdirSync(join(root, "apps", "sample"), { recursive: true })
  writeFileSync(join(root, "tags.md"), params.tags)
  writeFileSync(join(root, "apps", "sample", "sample.md"), `${params.appFrontmatter}\n`)
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

test("Title Case regex accepts and rejects expected values", () => {
  expect(TAG_LABEL_TITLE_CASE_REGEX.test("Pie Menus")).toBe(true)
  expect(TAG_LABEL_TITLE_CASE_REGEX.test("pie Menus")).toBe(false)
  expect(TAG_LABEL_TITLE_CASE_REGEX.test("Pie-Menus")).toBe(false)
  expect(TAG_SLUG_REGEX.test("pie-menus")).toBe(true)
  expect(TAG_SLUG_REGEX.test("Pie-Menus")).toBe(false)
})

test("parseTagsFile reads markdown list", () => {
  expect(parseTagsFile("- pie-menus | Pie Menus\n- productivity | Productivity\n")).toEqual({
    entries: [
      { label: "Pie Menus", slug: "pie-menus" },
      { label: "Productivity", slug: "productivity" },
    ],
    errors: [],
  })
})

test("checks pass on valid content", async () => {
  const root = createFixture({
    tags: "- pie-menus | Pie Menus\n- productivity | Productivity\n",
    appFrontmatter: `---
apple_app_store: https://apps.apple.com/us/app/pieoneer/id6739781207?mt=12
description: Let your apps fly in a pie.
logo: https://example.com/icon.png
name: Pieoneer
tags:
  - pie-menus
  - productivity
website: https://example.com
---`,
  })

  const [frontmatterErrors, tagErrors, allErrors] = await Promise.all([
    runFrontmatterChecks({ cwd: root }),
    runTagChecks({ cwd: root }),
    runAllChecks({ cwd: root }),
  ])

  expect(frontmatterErrors).toHaveLength(0)
  expect(tagErrors).toHaveLength(0)
  expect(allErrors).toHaveLength(0)
})

test("checks report frontmatter and tag convention issues", async () => {
  const root = createFixture({
    tags: "- pie-menus | Pie Menus\n",
    appFrontmatter: `---
name: Pieoneer
apple_app_store: https://apps.apple.com/us/app/pieoneer/id6739781207?mt=12
description: Let your apps fly in a pie.
logo: https://example.com/icon.png
tags:
  - pie menus
website: https://example.com
---`,
  })

  const [frontmatterErrors, tagErrors] = await Promise.all([
    runFrontmatterChecks({ cwd: root }),
    runTagChecks({ cwd: root }),
  ])

  expect(frontmatterErrors.some(error => error.includes("frontmatter keys must be sorted"))).toBe(true)
  expect(tagErrors.some(error => error.includes("must be kebab-case slug"))).toBe(true)
})
