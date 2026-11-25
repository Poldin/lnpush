#!/usr/bin/env node
// Local Google search for LinkedIn profiles. Posts each page to /api/collect/ingest.
// Playwright is optional and is not a dependency of the web app. See docs/collector.md.

import path from 'node:path'
import { pathToFileURL } from 'node:url'

const PAGES = 6
const PER_PAGE = 10

export function googleSearchUrl(company, page) {
  const query = `site:linkedin.com/in "${String(company).replace(/"/g, '').replace(/\s+/g, ' ').trim()}"`
  const url = new URL('https://www.google.com/search')
  url.searchParams.set('q', query)
  url.searchParams.set('start', String((page - 1) * PER_PAGE))
  url.searchParams.set('num', String(PER_PAGE))
  url.searchParams.set('hl', 'en')
  return url.toString()
}

export function cleanGoogleUrl(href) {
  try {
    const parsed = new URL(href)
    if (parsed.hostname.replace(/^www\./, '') === 'google.com' && parsed.pathname === '/url') {
      const target = parsed.searchParams.get('q') || parsed.searchParams.get('url')
      if (target) return target
    }
  } catch {
    return href
  }
  return href
}

export function isGoogleBlock(url, text) {
  const haystack = `${url}\n${text}`.toLowerCase()
  return (
    haystack.includes('/sorry/') ||
    haystack.includes('unusual traffic') ||
    haystack.includes('detected unusual traffic') ||
    haystack.includes('not a robot') ||
    haystack.includes('recaptcha') ||
    /\bcaptcha\b/.test(haystack)
  )
}

export function waitBetweenSearches() {
  return 20_000 + Math.floor(Math.random() * 10_001)
}

function isDirectRun() {
  const entry = process.argv[1]
  if (!entry) return false
  try {
    return import.meta.url === pathToFileURL(path.resolve(entry)).href
  } catch {
    return false
  }
}

function argValue(flag) {
  const index = process.argv.indexOf(flag)
  if (index === -1) return null
  return process.argv[index + 1] ?? null
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function api(base, token, pathName, options = {}) {
  const response = await fetch(`${base}${pathName}`, {
    ...options,
    headers: {
      authorization: `Bearer ${token}`,
      ...(options.body ? { 'content-type': 'application/json' } : {}),
    },
  })
  const text = await response.text()
  let body = null
  try {
    body = text ? JSON.parse(text) : null
  } catch {
    body = { error: text.slice(0, 400) }
  }
  if (!response.ok) {
    const message = body?.error || `Request failed (${response.status}).`
    throw new Error(message)
  }
  return body
}

async function loadPlaywright() {
  try {
    const imported = await import('playwright')
    return imported.chromium
  } catch {
    console.error('Playwright is not installed.')
    console.error('From the project folder run:')
    console.error('  npm install --no-save playwright')
    console.error('  npx playwright install chromium')
    console.error('Then run this script again.')
    process.exit(1)
  }
}

async function dismissConsent(page) {
  const labels = [/accept all/i, /i agree/i, /reject all/i, /accetta tutto/i, /rifiuta tutto/i]
  const buttons = page.locator('button')
  const count = await buttons.count().catch(() => 0)
  for (let index = 0; index < Math.min(count, 20); index += 1) {
    const text = await buttons.nth(index).innerText().catch(() => '')
    if (!labels.some((label) => label.test(text))) continue
    await buttons.nth(index).click({ timeout: 2000 }).catch(() => undefined)
    await sleep(800)
    return
  }
}

async function readResults(page) {
  return page.evaluate((limit) => {
    const headings = [...document.querySelectorAll('#search a h3, #rso a h3')]
    const seen = new Set()
    const results = []
    for (const heading of headings) {
      const anchor = heading.closest('a')
      const href = anchor?.href || ''
      if (!href || seen.has(href)) continue
      seen.add(href)
      const block = heading.closest('div.g, div.MjjYud') || anchor?.parentElement
      const snippet = block?.querySelector('.VwiC3b, .IsZvec, [data-sncf]')?.textContent?.trim() || ''
      results.push({ title: heading.textContent?.trim() || '', url: href, snippet })
      if (results.length >= limit) break
    }
    return {
      href: location.href,
      text: (document.body?.innerText || '').slice(0, 8000),
      hasSearch: Boolean(document.querySelector('#search, #rso')),
      results,
    }
  }, PER_PAGE)
}

function stopForGoogle(reason, url, saved) {
  console.error('')
  console.error('Google showed a captcha or an unusual-traffic page.')
  console.error('Stopped. Wait a while, then run the script again.')
  console.error('Companies already ingested stay marked and will be skipped.')
  console.error(`Profiles saved before the stop: ${saved}.`)
  console.error(reason)
  if (url) console.error(url)
  process.exit(2)
}

async function main() {
  const base = (process.env.LNPUSH_URL || '').replace(/\/$/, '')
  const token = process.env.LNPUSH_TOKEN || ''
  if (!base || !token) {
    console.error('Set LNPUSH_URL and LNPUSH_TOKEN.')
    process.exit(1)
  }
  const dryRun = process.argv.includes('--dry-run')
  const onlyCompany = argValue('--company')
  let companies
  if (onlyCompany) {
    companies = [onlyCompany]
  } else {
    const next = await api(base, token, '/api/collect/next?all=1')
    companies = next.companies ?? []
    console.log(`Companies left: ${next.remaining ?? companies.length} of ${next.total ?? companies.length}.`)
  }
  if (companies.length === 0) {
    console.log('No companies left to collect.')
    return
  }

  const chromium = await loadPlaywright()
  const browser = await chromium.launch({ headless: process.env.LNPUSH_HEADED !== '1' })
  const context = await browser.newContext({
    locale: 'en-US',
    viewport: { width: 1280, height: 800 },
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  })
  const page = await context.newPage()
  let searches = 0
  let savedTotal = 0
  try {
    for (let index = 0; index < companies.length; index += 1) {
      const company = companies[index]
      console.log(`[${index + 1}/${companies.length}] ${company}`)
      let rank = 1
      for (let pageNumber = 1; pageNumber <= PAGES; pageNumber += 1) {
        if (searches > 0) {
          const pause = waitBetweenSearches()
          console.log(`  Waiting ${Math.round(pause / 1000)}s before the next Google search…`)
          await sleep(pause)
        }
        searches += 1
        const target = googleSearchUrl(company, pageNumber)
        await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 30_000 })
        await sleep(1200)
        await dismissConsent(page)
        const read = await readResults(page)
        if (isGoogleBlock(read.href, read.text)) stopForGoogle('Unusual traffic or captcha.', read.href, savedTotal)
        if (!read.hasSearch && read.results.length === 0) stopForGoogle('The page was not a Google results page.', read.href, savedTotal)
        const results = read.results.map((item) => ({
          title: item.title,
          url: cleanGoogleUrl(item.url),
          snippet: item.snippet,
          rank: rank++,
        }))
        const stored = await api(base, token, '/api/collect/ingest', {
          method: 'POST',
          body: JSON.stringify({
            company,
            source_query: `site:linkedin.com/in "${company.replace(/"/g, '')}"`,
            dry_run: dryRun,
            results,
          }),
        })
        savedTotal += stored.saved ?? 0
        console.log(`  page ${pageNumber}: parsed ${stored.count ?? 0}, saved ${stored.saved ?? 0}`)
      }
    }
  } finally {
    await browser.close().catch(() => undefined)
  }
  console.log(`Done. Companies searched: ${companies.length}. Profiles saved: ${savedTotal}.`)
}

if (isDirectRun()) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : 'The local collector failed.')
    process.exit(1)
  })
}
