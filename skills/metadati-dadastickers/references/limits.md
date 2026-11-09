# Field limits

Verified on October 26, 2026. The caps live in `scripts/lib.ts` (`LIMITS`); update both together.

| Field | Cap | Basis |
|---|---|---|
| `title` | 60 | Google sets no limit and truncates to the device width (about 600 px on desktop). 60 characters keeps a title whole in most results. |
| `description` | 155 | Google sets no limit and truncates the snippet to the device width. 155 characters fits a desktop snippet; facts come first so mobile truncation drops only the statement. |
| `og:title` | 70 | Open Graph sets no limit. X reads `og:title` when `twitter:title` is absent, and caps titles at 70. |
| `og:description` | 200 | Open Graph asks for one or two sentences. X reads it when `twitter:description` is absent, and caps descriptions at 200. |
| `og:image:alt` | 420 | Open Graph says a page with `og:image` should set `og:image:alt`, describing the image rather than captioning it. X caps image alt text at 420. |
| `twitter:title` | 70 | X Cards markup, official cap. |
| `twitter:description` | 200 | X Cards markup, official cap. |
| `twitter:image:alt` | 420 | X Cards markup, official cap. |

Lengths count Unicode code points, so `à` and `’` count as one character each.

## Search and AI answers

- Google wants a distinct `<title>` and description on every page, because identical descriptions across a site don't help users tell pages apart.
- Google's AI Overviews and AI Mode need no special tags, files or schema. Clear text content that crawlers can read is enough, which is why facts lead every field.
- Structured data (JSON-LD) carries only the page facts, because Google asks that it match the visible text on the page.

## Sources

- [Google, title links](https://developers.google.com/search/docs/appearance/title-link) (updated 2025-12-10)
- [Google, snippets and meta descriptions](https://developers.google.com/search/docs/appearance/snippet) (updated 2026-04-20)
- [Google, AI features and your website](https://developers.google.com/search/docs/appearance/ai-features) (updated 2025-12-10)
- [X, Cards markup](https://developer.x.com/cards/markup)
- [The Open Graph protocol](https://ogp.me/)
- [LinkedIn, make your website shareable](https://www.linkedin.com/help/linkedin/answer/46687) (requires `og:title`, `og:description` and `og:image`; publishes no length caps)
