import { parseFrontmatter } from "@stacksjs/ts-md"

const APP_GLOB = new Bun.Glob("apps/**/*.md")
const DEFAULT_CWD = new URL("..", import.meta.url).pathname
const DEFAULT_SUBREDDIT = "macapps"
const DEFAULT_LIMIT = 100
const DEFAULT_MAX_ISSUES_PER_RUN = 10
const DEFAULT_MAX_POST_AGE_HOURS = 36
const REDDIT_USER_AGENT_FALLBACK = "curated-apps-reddit-ingest/1.0"
const RESEARCH_LABEL = "ai:research"

const ALLOWED_FLAIRS = new Set(["Free", "Lifetime", "Subscription", "Deal", "Review", "Tip"])
const BLOCKED_FLAIRS = new Set(["Help", "Request"])

const NOISY_TITLE_REGEX = /\?|\b(help|request|recommend|looking for|alternative|best\b|beware|price increase|drama|down\b|vs\b)\b/i
const TIP_RELEASE_HINT_REGEX = /\[os\]|open[- ]source|open source|i built|built|launch|released|update|v\d+\.|new app|for mac|macos/i

const REDDIT_HOST_EXACT = new Set(["self.macapps", "preview.redd.it"])

const EXTERNAL_URL_PREFERENCE: Array<{ pattern: RegExp; score: number }> = [
  { pattern: /^apps\.apple\.com$/i, score: 140 },
  { pattern: /^github\.com$/i, score: 120 },
  { pattern: /(^|\.)youtube\.com$/i, score: 20 },
  { pattern: /^youtu\.be$/i, score: 20 },
  { pattern: /(^|\.)vimeo\.com$/i, score: 20 },
  { pattern: /(^|\.)twitter\.com$/i, score: 20 },
  { pattern: /^x\.com$/i, score: 20 },
]

export type RedditPost = {
  created_utc: number
  domain: string
  id: string
  is_self: boolean
  link_flair_text: string | null
  name: string
  num_comments: number
  permalink: string
  score: number
  selftext: string
  title: string
  url: string
  url_overridden_by_dest?: string
}

type RedditListingResponse = {
  data?: {
    children?: Array<{
      data?: RedditPost
    }>
  }
}

type GithubIssue = {
  body: string | null
  html_url: string
  number: number
  pull_request?: unknown
  title: string
}

export type Candidate = {
  createdUtc: number
  flair: string
  issueBody: string
  issueTitle: string
  permalink: string
  postId: string
  sourceKey: string
  sourceUrl: string
  title: string
}

type ExistingIssueMarkers = {
  postIds: Set<string>
  sourceKeys: Set<string>
}

function toInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) ? parsed : fallback
}

function toBool(value: string | undefined): boolean {
  if (!value) return false
  return value === "1" || value.toLowerCase() === "true"
}

export function normalizeExtractedUrl(value: string): string | null {
  const trimmed = value.trim()
  if (trimmed.length === 0) return null

  const withoutTrailingPunctuation = trimmed.replace(/[\]\}\),.!?;:]+$/g, "")
  if (!/^https?:\/\//i.test(withoutTrailingPunctuation)) {
    return null
  }

  try {
    const parsed = new URL(withoutTrailingPunctuation)
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null
    }
    return parsed.toString()
  } catch {
    return null
  }
}

export function extractUrlsFromSelftext(selftext: string): string[] {
  const markdownLinks = [...selftext.matchAll(/\[[^\]]+\]\((https?:\/\/[^\s)]+)\)/gi)]
    .map(match => match[1])
    .filter((value): value is string => Boolean(value))

  const selftextWithoutMarkdownLinks = selftext.replace(/\[[^\]]+\]\((https?:\/\/[^\s)]+)\)/gi, " ")
  const rawLinks = [...selftextWithoutMarkdownLinks.matchAll(/https?:\/\/[^\s<>\]\)]+/gi)]
    .map(match => match[0])
    .filter((value): value is string => Boolean(value))

  const deduped = new Set<string>()
  for (const rawUrl of [...markdownLinks, ...rawLinks]) {
    const normalized = normalizeExtractedUrl(rawUrl)
    if (normalized) {
      deduped.add(normalized)
    }
  }

  return [...deduped]
}

function hostFromUrl(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase()
  } catch {
    return null
  }
}

export function isRedditHost(host: string): boolean {
  const normalized = host.toLowerCase()
  if (REDDIT_HOST_EXACT.has(normalized)) {
    return true
  }
  return normalized.endsWith("reddit.com") || normalized.endsWith("redd.it")
}

export function sourceKeyFromUrl(url: string): string | null {
  try {
    const parsed = new URL(url)
    const host = parsed.hostname.toLowerCase().replace(/^www\./, "")

    if (host === "apps.apple.com") {
      const appStoreId = parsed.pathname.match(/\/id\d+/)?.[0]
      return appStoreId ? `${host}${appStoreId}` : host
    }

    if (host === "github.com") {
      const segments = parsed.pathname.split("/").filter(Boolean)
      if (segments.length >= 2) {
        return `${host}/${segments[0]?.toLowerCase()}/${segments[1]?.toLowerCase()}`
      }
      return host
    }

    return host
  } catch {
    return null
  }
}

function scoreExternalUrl(url: string): number {
  const host = hostFromUrl(url)
  if (!host) return -1

  for (const preference of EXTERNAL_URL_PREFERENCE) {
    if (preference.pattern.test(host)) {
      return preference.score
    }
  }

  return 100
}

export function pickSourceUrl(post: RedditPost): string | null {
  const directUrls = [post.url_overridden_by_dest, post.url]
    .filter((value): value is string => typeof value === "string" && value.length > 0)
    .map(url => normalizeExtractedUrl(url))
    .filter((value): value is string => Boolean(value))

  for (const directUrl of directUrls) {
    const host = hostFromUrl(directUrl)
    if (host && !isRedditHost(host)) {
      return directUrl
    }
  }

  const externalUrls = extractUrlsFromSelftext(post.selftext).filter(url => {
    const host = hostFromUrl(url)
    return Boolean(host && !isRedditHost(host))
  })

  if (externalUrls.length === 0) {
    return null
  }

  const sorted = externalUrls.sort((a, b) => scoreExternalUrl(b) - scoreExternalUrl(a))
  return sorted[0] ?? null
}

export function isLikelyAppPost(post: RedditPost): boolean {
  const flair = (post.link_flair_text ?? "").trim()
  if (BLOCKED_FLAIRS.has(flair)) {
    return false
  }

  if (!ALLOWED_FLAIRS.has(flair)) {
    return false
  }

  if (NOISY_TITLE_REGEX.test(post.title)) {
    return false
  }

  if (flair === "Tip" && !TIP_RELEASE_HINT_REGEX.test(post.title)) {
    return false
  }

  return true
}

export function buildCandidate(post: RedditPost, subreddit: string): Candidate | null {
  if (!isLikelyAppPost(post)) {
    return null
  }

  const sourceUrl = pickSourceUrl(post)
  if (!sourceUrl) {
    return null
  }

  const sourceKey = sourceKeyFromUrl(sourceUrl)
  if (!sourceKey) {
    return null
  }

  const issueTitleBase = post.title.trim().replace(/\s+/g, " ")
  const issueTitle = `[reddit/${subreddit}:${post.id}] ${issueTitleBase}`.slice(0, 220)
  const permalink = `https://www.reddit.com${post.permalink}`
  const flair = post.link_flair_text ?? "(none)"

  const issueBody = [
    "Automated candidate from r/macapps for directory research.",
    "",
    `url: ${sourceUrl}`,
    "",
    `reddit_post_id: ${post.id}`,
    `reddit_fullname: ${post.name}`,
    `reddit_permalink: ${permalink}`,
    `reddit_created_utc: ${post.created_utc}`,
    `source_key: ${sourceKey}`,
    `flair: ${flair}`,
    `score: ${post.score}`,
    `num_comments: ${post.num_comments}`,
  ].join("\n")

  return {
    createdUtc: post.created_utc,
    flair,
    issueBody,
    issueTitle,
    permalink,
    postId: post.id,
    sourceKey,
    sourceUrl,
    title: post.title,
  }
}

async function fetchSubredditPosts(params: {
  limit: number
  subreddit: string
  userAgent: string
}): Promise<RedditPost[]> {
  const url = `https://www.reddit.com/r/${encodeURIComponent(params.subreddit)}/new.json?limit=${params.limit}&raw_json=1`

  const response = await fetch(url, {
    headers: {
      accept: "application/json",
      "user-agent": params.userAgent,
    },
  })

  if (!response.ok) {
    throw new Error(`Reddit request failed: HTTP ${response.status}`)
  }

  const payload = (await response.json()) as RedditListingResponse
  const children = payload.data?.children ?? []

  return children
    .map(child => child.data)
    .filter((post): post is RedditPost => {
      return Boolean(post && typeof post.id === "string" && typeof post.title === "string")
    })
}

async function loadKnownSourceKeys(cwd: string): Promise<Set<string>> {
  const knownKeys = new Set<string>()

  for await (const appFile of APP_GLOB.scan({ cwd })) {
    const file = Bun.file(new URL(appFile, `file://${cwd}/`))
    const contents = await file.text()
    const { data } = parseFrontmatter(contents)

    if (typeof data.website === "string") {
      const websiteKey = sourceKeyFromUrl(data.website)
      if (websiteKey) {
        knownKeys.add(websiteKey)
      }
    }

    if (typeof data.apple_app_store === "string") {
      const appStoreKey = sourceKeyFromUrl(data.apple_app_store)
      if (appStoreKey) {
        knownKeys.add(appStoreKey)
      }
    }
  }

  return knownKeys
}

async function githubRequest<T>(params: {
  method?: "GET" | "POST"
  path: string
  token: string
  body?: unknown
}): Promise<T> {
  const response = await fetch(`https://api.github.com${params.path}`, {
    method: params.method ?? "GET",
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${params.token}`,
      "content-type": "application/json",
      "x-github-api-version": "2022-11-28",
      "user-agent": REDDIT_USER_AGENT_FALLBACK,
    },
    body: params.body ? JSON.stringify(params.body) : undefined,
  })

  if (!response.ok) {
    const details = await response.text()
    throw new Error(`GitHub API request failed: ${params.method ?? "GET"} ${params.path} -> HTTP ${response.status} (${details.slice(0, 300)})`)
  }

  return (await response.json()) as T
}

async function listResearchIssues(params: {
  label: string
  repo: string
  token: string
}): Promise<GithubIssue[]> {
  const issues: GithubIssue[] = []

  for (let page = 1; page <= 10; page += 1) {
    const path = `/repos/${params.repo}/issues?state=all&labels=${encodeURIComponent(params.label)}&per_page=100&page=${page}`
    const pageResults = await githubRequest<GithubIssue[]>({ path, token: params.token })
    issues.push(...pageResults.filter(issue => !issue.pull_request))

    if (pageResults.length < 100) {
      break
    }
  }

  return issues
}

function collectExistingIssueMarkers(issues: GithubIssue[]): ExistingIssueMarkers {
  const postIds = new Set<string>()
  const sourceKeys = new Set<string>()

  for (const issue of issues) {
    const titleId = issue.title.match(/\[reddit\/[^:]+:([a-z0-9]+)\]/i)?.[1]
    if (titleId) {
      postIds.add(titleId)
    }

    const body = issue.body ?? ""
    const bodyPostId = body.match(/^reddit_post_id:\s*(\S+)$/im)?.[1]
    if (bodyPostId) {
      postIds.add(bodyPostId)
    }

    const sourceKey = body.match(/^source_key:\s*(\S+)$/im)?.[1]
    if (sourceKey) {
      sourceKeys.add(sourceKey)
    }
  }

  return { postIds, sourceKeys }
}

async function ensureResearchLabel(params: { repo: string; token: string }): Promise<void> {
  try {
    await githubRequest({
      method: "POST",
      path: `/repos/${params.repo}/labels`,
      token: params.token,
      body: {
        color: "1d76db",
        description: "Queue app research",
        name: RESEARCH_LABEL,
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (!message.includes("HTTP 422")) {
      throw error
    }
  }
}

async function createResearchIssue(params: {
  body: string
  repo: string
  title: string
  token: string
}): Promise<{ html_url: string; number: number }> {
  return await githubRequest<{ html_url: string; number: number }>({
    method: "POST",
    path: `/repos/${params.repo}/issues`,
    token: params.token,
    body: {
      body: params.body,
      labels: [RESEARCH_LABEL],
      title: params.title,
    },
  })
}

export function selectCandidates(params: {
  maxPostAgeHours: number
  posts: RedditPost[]
  subreddit: string
}): Candidate[] {
  const nowUtcSeconds = Math.floor(Date.now() / 1000)
  const minCreatedUtc = nowUtcSeconds - params.maxPostAgeHours * 3600
  const candidates: Candidate[] = []

  for (const post of params.posts) {
    if (post.created_utc < minCreatedUtc) {
      continue
    }

    const candidate = buildCandidate(post, params.subreddit)
    if (candidate) {
      candidates.push(candidate)
    }
  }

  return candidates
}

async function main(): Promise<void> {
  const cwd = DEFAULT_CWD
  const subreddit = process.env.REDDIT_SUBREDDIT ?? DEFAULT_SUBREDDIT
  const limit = toInt(process.env.REDDIT_LIMIT, DEFAULT_LIMIT)
  const maxIssuesPerRun = toInt(process.env.MAX_ISSUES_PER_RUN, DEFAULT_MAX_ISSUES_PER_RUN)
  const maxPostAgeHours = toInt(process.env.MAX_POST_AGE_HOURS, DEFAULT_MAX_POST_AGE_HOURS)
  const userAgent = process.env.REDDIT_USER_AGENT ?? REDDIT_USER_AGENT_FALLBACK

  const repo = process.env.GITHUB_REPOSITORY
  const token = process.env.GITHUB_TOKEN
  const dryRun = toBool(process.env.DRY_RUN) || !repo || !token

  const posts = await fetchSubredditPosts({
    limit,
    subreddit,
    userAgent,
  })

  const knownSourceKeys = await loadKnownSourceKeys(cwd)
  const allCandidates = selectCandidates({
    maxPostAgeHours,
    posts,
    subreddit,
  })

  const dedupedWithinRun = new Set<string>()
  const prefiltered = allCandidates.filter(candidate => {
    if (dedupedWithinRun.has(candidate.postId)) return false
    if (dedupedWithinRun.has(candidate.sourceKey)) return false
    dedupedWithinRun.add(candidate.postId)
    dedupedWithinRun.add(candidate.sourceKey)
    return true
  })

  let existingMarkers: ExistingIssueMarkers = {
    postIds: new Set<string>(),
    sourceKeys: new Set<string>(),
  }

  if (!dryRun && repo && token) {
    const existingIssues = await listResearchIssues({
      label: RESEARCH_LABEL,
      repo,
      token,
    })
    existingMarkers = collectExistingIssueMarkers(existingIssues)
  }

  const queued = prefiltered
    .filter(candidate => !knownSourceKeys.has(candidate.sourceKey))
    .filter(candidate => !existingMarkers.postIds.has(candidate.postId))
    .filter(candidate => !existingMarkers.sourceKeys.has(candidate.sourceKey))
    .slice(0, maxIssuesPerRun)

  const summary = {
    created: 0,
    dryRun,
    fetchedPosts: posts.length,
    maxIssuesPerRun,
    maxPostAgeHours,
    queued: queued.length,
    skippedBecauseKnownDirectory: prefiltered.filter(candidate => knownSourceKeys.has(candidate.sourceKey)).length,
    skippedBecauseExistingIssue:
      prefiltered.filter(candidate => existingMarkers.postIds.has(candidate.postId) || existingMarkers.sourceKeys.has(candidate.sourceKey)).length,
    subreddit,
  }

  if (dryRun || !repo || !token) {
    console.log(JSON.stringify({
      ...summary,
      queuePreview: queued.map(candidate => ({
        flair: candidate.flair,
        issueTitle: candidate.issueTitle,
        permalink: candidate.permalink,
        sourceUrl: candidate.sourceUrl,
      })),
    }, null, 2))
    return
  }

  await ensureResearchLabel({ repo, token })

  for (const candidate of queued) {
    const created = await createResearchIssue({
      body: candidate.issueBody,
      repo,
      title: candidate.issueTitle,
      token,
    })

    summary.created += 1
    console.log(`created issue #${created.number}: ${created.html_url}`)
  }

  console.log(JSON.stringify(summary, null, 2))
}

if (import.meta.main) {
  await main()
}
