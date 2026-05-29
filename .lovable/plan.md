## Goal
Hide the site from all search engines so it only appears when someone follows a direct link.

## Changes

1. **`public/robots.txt`** — replace contents with a global block:
   ```
   User-agent: *
   Disallow: /
   ```
   Removes the per-crawler Allow rules for Googlebot, Bingbot, Twitterbot, and facebookexternalhit.

2. **`index.html`** — add a robots meta tag in `<head>` to reinforce the block for crawlers that ignore robots.txt:
   ```html
   <meta name="robots" content="noindex, nofollow" />
   ```

## Notes
- No sitemap.xml exists, so nothing to remove there.
- Direct links continue to work — this only affects search engine indexing/discovery.
- Social link previews (OG tags) still render when someone pastes the URL into Slack/LinkedIn/etc.
- Reversible by restoring `Allow: /` and removing the meta tag.
