# Savana — 30s Kid Handwash Animation

`savana-kid-handwash.mp4` — a 30-second, 1920x1080 flat-cartoon animation: a
child washes their hands with Savana soap at the sink, the scene zooms into a
magnified skin cross-section showing the before state (dry, rough, dirt/oil on
the surface) versus the after state (clean pores, a plumped hydration layer,
smooth surface), then cuts back to the child happily admiring clean hands,
ending on the brand lockup.

## Regenerating

`animation.src.html` is the editable source — the character, sink, and skin
cross-section are hand-drawn inline SVG, animated with CSS keyframes on a
hardcoded 0–30s timeline (`animation-delay` in seconds). `assets/` holds the
embedded fonts (Playfair Display + Lora — Cyrillic-capable, unlike the site's
usual Petrona) and the cropped logo emblem used in the outro.

```
node build.mjs                 # inlines assets/ as base64 -> animation.html
# then record animation.html for 30s with a headless browser (e.g. Playwright's
# recordVideo) at 1920x1080 and encode the capture to mp4 with ffmpeg (libx264).
```

No new runtime dependency was added to the app — Playwright/ffmpeg were only
used locally to render this one asset.
