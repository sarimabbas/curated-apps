import { expect, test } from "bun:test"

import {
  extensionFromContentType,
  extensionFromUrl,
  isRemoteUrl,
  renderFrontmatter,
} from "./postprocess-research"

test("isRemoteUrl only matches http and https", () => {
  expect(isRemoteUrl("https://example.com/logo.png")).toBe(true)
  expect(isRemoteUrl("http://example.com/logo.png")).toBe(true)
  expect(isRemoteUrl("./logo.png")).toBe(false)
  expect(isRemoteUrl("ftp://example.com/logo.png")).toBe(false)
})

test("extensionFromContentType maps common image MIME types", () => {
  expect(extensionFromContentType("image/png")).toBe("png")
  expect(extensionFromContentType("image/jpeg; charset=binary")).toBe("jpg")
  expect(extensionFromContentType("image/svg+xml")).toBe("svg")
  expect(extensionFromContentType("text/html")).toBeNull()
})

test("extensionFromUrl resolves extension from URL pathname", () => {
  expect(extensionFromUrl("https://cdn.example.com/logo.webp")).toBe("webp")
  expect(extensionFromUrl("https://cdn.example.com/logo.png?size=2x")).toBe("png")
  expect(extensionFromUrl("https://cdn.example.com/logo.txt")).toBeNull()
})

test("renderFrontmatter sorts keys and serializes arrays", () => {
  const output = renderFrontmatter({
    website: "https://example.com",
    tags: ["menu", "productivity"],
    name: "Example",
  })

  expect(output.startsWith("---\nname:")).toBe(true)
  expect(output.includes("tags:\n  - \"menu\"\n  - \"productivity\"\nwebsite:")).toBe(true)
  expect(output.endsWith("---\n")).toBe(true)
})
