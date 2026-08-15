# Savana — 30s Brand Story Animation

`savana-brand-story.mp4` — a 30-second, 1920x1080 animated promo covering: natural
Mongolian ingredients, handcrafted cold-process method, 4–6 week curing, skin/eco
benefits, and the women-owned badge, ending on the real product photo with the
brand lockup. Copy is Mongolian and pulled from the claims already on `About.tsx`.

## Regenerating

`animation.src.html` is the editable source (CSS-keyframe animation, timeline
hardcoded in seconds via `animation-delay`). `assets/` holds the embedded fonts
(Playfair Display + Lora, both with full Cyrillic coverage — Petrona, the site's
usual font, has no Cyrillic glyphs) and the product/logo images.

```
node build.mjs                 # inlines assets/ as base64 -> animation.html
# then record animation.html for 30s with a headless browser (e.g. Playwright's
# recordVideo) at 1920x1080 and encode the capture to mp4 with ffmpeg (libx264).
```

No new runtime dependency was added to the app — Playwright/ffmpeg were only
used locally to render this one asset.
