# Prospect logos for a lead magnet: how the GTM Play Engine does it

A reusable approach for showing a prospect's company logo on a personalised page (or in an email,
PDF or preview image) for free, with no API key, and without ever showing a wrong or broken logo.
Built and tested for Cleverviral's GTM Play Engine (October 2026).

## The idea in one paragraph

Every company website publishes a square app icon for phones (the "apple-touch-icon"). We read it
from the prospect's homepage. If the site has none, we ask Google's favicon service for the
largest icon it knows. Every file then goes through a quality check. If nothing passes, the page
simply shows no logo, so the layout never breaks and nothing wrong ever appears.

## The routes, in order

| # | Route | Cost | Notes |
|---|---|---|---|
| 1 | **The site's own app icon:** the homepage's `<link rel="apple-touch-icon">` (or any declared icon of 96px or more), then `/apple-touch-icon.png` at the site root | Free | The company's current icon. If you already crawl the homepage, pass that HTML in so it isn't downloaded twice |
| 2 | **Google's favicon service:** `https://www.google.com/s2/favicons?domain=<domain>&sz=256` | Free | Unofficial and undocumented: treat it as best-effort. Returns 404 for a domain it has nothing for |
| 3 | **None:** hide the logo | Free | The design must look complete without a logo |

**Tested on 50 real B2B websites:**
- **38 got a logo (76%):** 32 from route 1, 6 from route 2. Every one was the right logo.
- **10 publish only a tiny (16-48px) icon:** no logo, by design.
- **2 sites didn't load.**

## The quality check (applied to every file)

A logo is used only if it:
1. downloads properly (HTTP 200) and is under 2 MB;
2. is a real image (this catches icon addresses that return a web page or an empty file);
3. is at least 96px on its short side (SVG accepted);
4. is roughly square (width/height between 0.8 and 1.25);
5. isn't blank (one flat colour) or almost fully transparent;
6. isn't a known website-builder default icon (keep a list of their file hashes; it starts empty).

**Why 96px:** the logo shows at 56px, which is about 112px on sharp (retina) screens, so 96px
still looks crisp. We compared it side by side with a 128px minimum before choosing it.

## How it's stored and shown

- **Store your own copy.** Save the file (for example `logos/<page-id>.png`) on your server or in
  object storage and link to that. Never link to the prospect's or Google's URL: those can change
  or block embedding.
- **Name files by page ID, not company domain** if the page is private. A file called
  `acme.com.png` reveals who requested a page.
- **Cache:** reuse a found logo for 30 days; retry a miss after 7 days.
- **Display:** a 56px rounded white tile beside the company name. Opaque icons fill the tile;
  icons with a transparent background get about 7px of padding so they don't touch the edges
  (the check reports `has_transparency`).

```html
<span class="plogo pad"><img src="/logos/<page-id>.png" alt="Acme logo" width="56" height="56"></span>
```

```css
.plogo{flex:none;width:56px;height:56px;border-radius:14px;background:#fff;overflow:hidden;display:grid;place-items:center}
.plogo img{width:100%;height:100%;object-fit:cover;display:block}
.plogo.pad img{object-fit:contain;padding:7px}
```

## The code

`fetch_logo.py` (in this folder) does both routes and the check:

```python
from fetch_logo import fetch_logo
r = fetch_logo("acme.com")            # or fetch_logo("acme.com", html=homepage_html, final_url=...)
if r["ok"]:
    save(r["bytes"])                  # your storage
    transparent = r["info"]["has_transparency"]
else:
    pass                              # show no logo; r["reason"] says why
```

It needs Python 3 and `pillow` (`pip install pillow`). From the command line,
`python3 fetch_logo.py acme.com` prints the result.

## What we evaluated and didn't use

| Option | Why not |
|---|---|
| **logo.dev API** | Good quality, but its free plan gives about 250 logos a month (2 credits each) and requires a visible "Logos provided by Logo.dev" link. Worth adding only as a paid third route if coverage must go above about 76% |
| **Blitz** | No logo field in its API |
| **Prospeo / LeadMagic** | Return a logo, but cost a credit per lookup with no quality advantage |
| **The site's header logo or structured-data logo** | Usually a wide wordmark, which doesn't fit a square tile |
