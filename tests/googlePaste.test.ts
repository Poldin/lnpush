import { describe, expect, it } from 'vitest'

import { companyGoogleQuery, googleSearchHref, importFeedback, nextPendingAfter, parseCompanyLines, pasteFeedback, SEARCH_PRESETS } from '../lib/collectQueue'
import { linkedInProfileFromHref, parseGoogleLinkedInPaste } from '../lib/googlePaste'

const serp = `
<div>
  <a href="https://www.linkedin.com/in/ada-lovelace/?trk=public_profile#about">
    <h3>Ada Lovelace - Engineer | LinkedIn</h3>
  </a>
  <div class="VwiC3b">Engineer at Analytical Engines</div>
  <a href="https://www.google.com/url?q=https%3A%2F%2Fit.linkedin.com%2Fin%2Fgrace-hopper%2F&amp;sa=U&amp;ved=2ah">
    <h3>Grace Hopper - Admiral - LinkedIn</h3>
  </a>
  <span>Computer scientist</span>
  <a href="/url?q=https%3A%2F%2Fde.linkedin.com%2Fin%2FKlaus-M%25C3%25BCller%2F&amp;sa=U">
    <h3>Klaus Müller – Einkauf | LinkedIn</h3>
  </a>
  <div>Leitung Einkauf</div>
  <a href="https://www.google.com/url?q=https://www.linkedin.com/in/marie-curie/&sa=U">
    <h3><span>Marie Curie - Physicist | LinkedIn</span></h3>
  </a>
  <a href="https://www.linkedin.com/in/katherine-johnson">Katherine Johnson - Mathematician | LinkedIn</a>
  <a href="https://www.linkedin.com/company/acme"><h3>Acme | LinkedIn</h3></a>
  <a href="https://www.linkedin.com/company/acme/in/someone"><h3>Not a person | LinkedIn</h3></a>
  <a href="https://www.linkedin.com/jobs/view/12345">Job</a>
  <a href="https://www.linkedin.com/posts/someone_activity-1">Post</a>
  <a href="https://www.linkedin.com/pub/dir/Ada/Lovelace">Directory</a>
  <a href="https://www.google.com/search?q=site:linkedin.com/in+acme&start=10">Next</a>
  <a href="https://webcache.googleusercontent.com/search?q=cache:https://www.linkedin.com/in/cached-person">Cached page</a>
  <a href="https://translate.google.com/translate?u=https://www.linkedin.com/in/translated-person">Translate</a>
  <a href="https://it.linkedin.com/in/Ada-Lovelace/?trk=dup">
    <h3>Ada Lovelace - Engineer | LinkedIn</h3>
  </a>
  <a href="https://m.linkedin.com/in/mobile-only">Mobile</a>
  <a href="https://abcd.linkedin.com/in/too-long">Long host</a>
</div>
`

describe('Google HTML LinkedIn parser', () => {
  it('reads direct links, Google redirects, localized hosts, and h3 names', () => {
    const parsed = parseGoogleLinkedInPaste({ html: serp, text: 'https://www.linkedin.com/in/ignored-because-html-hit' })
    expect(parsed.profiles.map((profile) => profile.linkedin_url)).toEqual([
      'https://www.linkedin.com/in/ada-lovelace',
      'https://www.linkedin.com/in/grace-hopper',
      `https://www.linkedin.com/in/${encodeURIComponent('klaus-müller').toLowerCase()}`,
      'https://www.linkedin.com/in/marie-curie',
      'https://www.linkedin.com/in/katherine-johnson',
    ])
    expect(parsed.duplicates).toBe(1)
    expect(parsed.profiles[0]).toMatchObject({
      full_name: 'Ada Lovelace',
      headline: 'Engineer',
      snippet: 'Engineer at Analytical Engines',
    })
    expect(parsed.profiles[1]).toMatchObject({
      full_name: 'Grace Hopper',
      headline: 'Admiral',
      snippet: 'Computer scientist',
    })
    expect(parsed.profiles[2]).toMatchObject({ full_name: 'Klaus Müller', headline: 'Einkauf', snippet: 'Leitung Einkauf' })
    expect(parsed.profiles[3]).toMatchObject({ full_name: 'Marie Curie', headline: 'Physicist' })
    expect(parsed.profiles[4]).toMatchObject({ full_name: 'Katherine Johnson', headline: 'Mathematician' })
  })

  it('unwraps a Google redirect and ignores cache, translate, and navigation urls', () => {
    expect(linkedInProfileFromHref('https://www.google.com/url?q=https%3A%2F%2Fwww.linkedin.com%2Fin%2FJane-Doe%2F&sa=U')).toBe(
      'https://www.linkedin.com/in/jane-doe',
    )
    expect(linkedInProfileFromHref('/url?q=https://uk.linkedin.com/in/Alan-Turing#about')).toBe(
      'https://www.linkedin.com/in/alan-turing',
    )
    expect(linkedInProfileFromHref('https://webcache.googleusercontent.com/search?q=cache:https://www.linkedin.com/in/cached-person')).toBeNull()
    expect(linkedInProfileFromHref('https://translate.google.com/translate?u=https://www.linkedin.com/in/translated-person')).toBeNull()
    expect(linkedInProfileFromHref('https://www.google.com/search?q=linkedin')).toBeNull()
    expect(linkedInProfileFromHref('https://www.linkedin.com/jobs/view/1')).toBeNull()
    expect(linkedInProfileFromHref('https://www.linkedin.com/company/acme')).toBeNull()
    expect(linkedInProfileFromHref('https://www.linkedin.com/posts/activity')).toBeNull()
    expect(linkedInProfileFromHref('https://www.linkedin.com/pub/dir/Ada/Lovelace')).toBeNull()
  })

  it('falls back to a plain URL list and dedupes it', () => {
    const parsed = parseGoogleLinkedInPaste({
      html: '<a href="https://www.linkedin.com/company/acme"><h3>Acme | LinkedIn</h3></a>',
      text: [
        'Ada Lovelace - Mathematician | LinkedIn',
        'https://www.linkedin.com/in/ada-lovelace/',
        'First programmer',
        'https://it.linkedin.com/in/ada-lovelace?trk=1',
        'https://www.linkedin.com/company/acme',
        'https://uk.linkedin.com/in/alan-turing/#about',
      ].join('\n'),
    })
    expect(parsed.duplicates).toBe(1)
    expect(parsed.profiles).toEqual([
      {
        full_name: 'Ada Lovelace',
        headline: 'Mathematician',
        linkedin_url: 'https://www.linkedin.com/in/ada-lovelace',
        snippet: 'First programmer',
      },
      {
        full_name: null,
        headline: null,
        linkedin_url: 'https://www.linkedin.com/in/alan-turing',
        snippet: null,
      },
    ])
  })

  it('reads a raw URL list when no HTML is copied', () => {
    const parsed = parseGoogleLinkedInPaste({
      text: 'https://www.linkedin.com/in/jane-doe/\nhttps://www.linkedin.com/jobs/view/9\nhttps://it.linkedin.com/in/jane-doe',
    })
    expect(parsed.profiles.map((profile) => profile.linkedin_url)).toEqual(['https://www.linkedin.com/in/jane-doe'])
    expect(parsed.duplicates).toBe(1)
    expect(parsed.profiles[0]?.full_name).toBeNull()
  })
})

describe('collector queue helpers', () => {
  it('trims, drops blanks, and dedupes company lines without changing case', () => {
    expect(parseCompanyLines('  Acme \r\n\nBeta\nacme\n  Beta  \n')).toEqual(['Acme', 'Beta'])
  })

  it('advances to the next pending company and wraps', () => {
    const companies = [
      { id: 'a', status: 'pending' as const },
      { id: 'b', status: 'pending' as const },
      { id: 'c', status: 'done' as const },
      { id: 'd', status: 'pending' as const },
    ]
    expect(nextPendingAfter(companies, 'a')).toBe('b')
    expect(nextPendingAfter(companies, 'd')).toBe('a')
    expect(nextPendingAfter([{ id: 'a', status: 'pending' }], 'a')).toBeNull()
  })

  it('builds Google searches and the paste summary', () => {
    const engineering = SEARCH_PRESETS.find((preset) => preset.id === 'engineering')
    const query = companyGoogleQuery('Acme', engineering?.keywords)
    expect(query.startsWith('site:linkedin.com/in "Acme"')).toBe(true)
    expect(query).toContain(' OR ')
    const href = new URL(googleSearchHref(query))
    expect(href.hostname).toBe('www.google.com')
    expect(href.searchParams.get('q')).toBe(query)
    expect(pasteFeedback(9, 1, false)).toBe('Added 9 new profiles · 1 duplicate skipped')
    expect(pasteFeedback(0, 0, true)).toBe('No LinkedIn profiles found in that paste.')
    expect(importFeedback(1, 2)).toBe('Added 1 company · 2 duplicates skipped')
  })
})
