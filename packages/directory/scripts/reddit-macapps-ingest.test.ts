import { expect, test } from "bun:test"

import {
  buildCandidate,
  extractUrlsFromSelftext,
  isLikelyAppPost,
  pickSourceUrl,
  selectCandidates,
  sourceKeyFromUrl,
  type RedditPost,
} from "./reddit-macapps-ingest"

function makePost(overrides: Partial<RedditPost> = {}): RedditPost {
  return {
    created_utc: Math.floor(Date.now() / 1000),
    domain: "reddit.com",
    id: "1abcxyz",
    is_self: false,
    link_flair_text: "Free",
    name: "t3_1abcxyz",
    num_comments: 5,
    permalink: "/r/macapps/comments/1abcxyz/example/",
    score: 42,
    selftext: "",
    title: "Example app release",
    url: "https://www.reddit.com/gallery/1abcxyz",
    ...overrides,
  }
}

test("extractUrlsFromSelftext parses markdown and raw links cleanly", () => {
  const urls = extractUrlsFromSelftext(
    "Try [Valdis](https://valdis.app) and docs https://github.com/valdis-app/valdis/releases).",
  )

  expect(urls).toContain("https://valdis.app/")
  expect(urls).toContain("https://github.com/valdis-app/valdis/releases")
})

test("sourceKeyFromUrl creates stable keys for App Store, GitHub, and websites", () => {
  expect(sourceKeyFromUrl("https://apps.apple.com/us/app/current-reader/id6758530974?mt=12")).toBe(
    "apps.apple.com/id6758530974",
  )
  expect(sourceKeyFromUrl("https://github.com/OpenAI/codex/releases/tag/v1")).toBe("github.com/openai/codex")
  expect(sourceKeyFromUrl("https://www.cmux.dev/features")).toBe("cmux.dev")
})

test("pickSourceUrl prefers external link from selftext when post url is Reddit gallery", () => {
  const post = makePost({
    selftext: "Download: [https://netbar.xyz](https://netbar.xyz)",
    url: "https://www.reddit.com/gallery/1rdq4bt",
  })

  expect(pickSourceUrl(post)).toBe("https://netbar.xyz/")
})

test("isLikelyAppPost rejects help/request and noisy tip posts", () => {
  const helpPost = makePost({
    link_flair_text: "Help",
    title: "Looking for the best launcher app?",
  })
  expect(isLikelyAppPost(helpPost)).toBe(false)

  const noisyTip = makePost({
    link_flair_text: "Tip",
    title: "Please beware of this app pricing drama",
  })
  expect(isLikelyAppPost(noisyTip)).toBe(false)

  const releaseTip = makePost({
    link_flair_text: "Tip",
    title: "I built a new macOS menu bar app",
  })
  expect(isLikelyAppPost(releaseTip)).toBe(true)
})

test("buildCandidate and selectCandidates include only fresh qualifying posts", () => {
  const fresh = makePost({
    id: "1fresh01",
    name: "t3_1fresh01",
    selftext: "Website https://deskrest.com",
    title: "DeskRest update released",
  })

  const stale = makePost({
    id: "1stale01",
    name: "t3_1stale01",
    created_utc: Math.floor(Date.now() / 1000) - 5 * 24 * 3600,
    selftext: "Website https://old.example.com",
  })

  const candidate = buildCandidate(fresh, "macapps")
  expect(candidate?.sourceKey).toBe("deskrest.com")

  const selected = selectCandidates({
    maxPostAgeHours: 48,
    posts: [fresh, stale],
    subreddit: "macapps",
  })

  expect(selected).toHaveLength(1)
  expect(selected[0]?.postId).toBe("1fresh01")
})
