import { expect, test } from "bun:test"

import { buildHealthReport, isRemoteUrl } from "./health-logo-urls"

test("isRemoteUrl matches only http/https URLs", () => {
  expect(isRemoteUrl("https://example.com/logo.png")).toBe(true)
  expect(isRemoteUrl("http://example.com/logo.png")).toBe(true)
  expect(isRemoteUrl("logo.png")).toBe(false)
  expect(isRemoteUrl("ftp://example.com/logo.png")).toBe(false)
})

test("buildHealthReport renders healthy summary", () => {
  const report = buildHealthReport(3, [])
  expect(report.includes("Checked remote logo URLs: 3")).toBe(true)
  expect(report.includes("Broken logo URLs: 0")).toBe(true)
  expect(report.includes("All checked remote logo URLs are healthy.")).toBe(true)
})

test("buildHealthReport renders broken URLs list", () => {
  const report = buildHealthReport(2, [
    {
      appFile: "apps/pieoneer/pieoneer.md",
      appName: "Pieoneer",
      appSlug: "pieoneer",
      logoUrl: "https://example.com/logo.png",
      reason: "HTTP 404",
    },
  ])

  expect(report.includes("Broken logo URLs: 1")).toBe(true)
  expect(report.includes("## Broken URLs")).toBe(true)
  expect(report.includes("Pieoneer")).toBe(true)
  expect(report.includes("HTTP 404")).toBe(true)
})
