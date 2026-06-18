# PreMock

**Present Figma & AI prototypes beautifully.**

PreMock drops your prototype into a realistic hand‑held phone mockup and turns it into an interactive, live presentation. Paste a Figma link or upload an AI‑generated HTML prototype, pick a backdrop, and present — or record the whole thing as a video.

🔗 **Live:** [premock.co](https://premock.co/)

---

## Features

- **Two prototype sources**
  - **Figma** — paste a prototype share link; it's embedded right in the phone.
  - **HTML** — drag & drop a file, click **Upload HTML**, or paste raw markup into the gallery.
- **Realistic device mockup** — a hand holding the phone, with an **iOS / Android** toggle.
- **Custom cursor** — a soft dot replaces the system cursor over the screen for a clean, touch‑like feel.
- **Backdrops** — three built‑in scenes (Soft Gray, Apricot, Sky Blue), a set of **ready‑made room photos** (home, office, clothing store, coffee shop), a full **color palette** with hex input and a random‑color dice, or your own uploaded **background image**.
- **Status bar overlay** — toggle an **iOS or Android** status bar on top of the screen. Its ink follows the content behind it automatically (**Auto**), or you can force **Light** / **Dark**.
- **Prototype gallery** — save, rename, reorder and remove prototypes; persisted in the browser (`localStorage`). Figma titles are fetched automatically via oEmbed.
- **Presentation mode** — go fullscreen; the UI fades away while you present.
- **Screen recording** — capture the presentation with `MediaRecorder` and download a `.webm`. Optional **microphone audio** via a checkbox in the record tooltip.
- **Capture Scene** — grab a single clean frame of the scene as a `.png`. The whole UI (dock, menus, cursor) is hidden for the shot — only the backdrop, phone and the top‑left brand are captured. Reuses the live recording stream when one is running, so it won't prompt twice.
- **Shareable links** — for Figma prototypes, copy a link that reproduces the prototype, device, backdrop and status‑bar state on open.
- **Dark‑mode aware favicon.**

## Tech

No build step, no dependencies — just **vanilla HTML, CSS and JavaScript**.

| File | Purpose |
|------|---------|
| [`index.html`](index.html) | Markup + Google Analytics + favicon |
| [`styles.css`](styles.css) | All styling |
| [`app.js`](app.js) | All behavior (device fitting, cursor, gallery, scenes, recording, capture, sharing) |
| [`example-prototype.js`](example-prototype.js) | Bundled demo prototype shown in the gallery by default (inlined so it works on `file://`) |
| `hand-ios.png` / `hand-and.png` | Device mockup images (transparent screen cutout) |
| `bg-images/` | Ready‑made backdrop images (WebP) |
| `figma-guideline/` | Screenshots for the in‑app Figma setup guide |
| `og-image.png` | Social share preview (1200×630) |
| `favicon.svg` | Dark‑mode aware favicon |
| `robots.txt`, `sitemap.xml` | SEO |
| `CNAME` | GitHub Pages custom domain (`premock.co`) |

The iOS/Android status bar is drawn inline as SVG in `index.html` (no image asset).

Hosted on **GitHub Pages**.

## Run locally

It's a static site, so any static server works:

```bash
# from the project root
python3 -m http.server 8080
# then open http://localhost:8080
```

> Opening `index.html` directly via `file://` mostly works, but a local server avoids browser restrictions around iframes and the clipboard.

## Usage

1. Open the app. The phone slides into view.
2. **Add a prototype:**
   - Click **Upload HTML** (or drag a `.html` file anywhere), **or**
   - Open the **Gallery**, paste a Figma share link or HTML, and press **Add**.
3. Pick a **backdrop** from the bottom‑left dock (scenes, palette or your own image).
4. Switch **iOS / Android** and toggle the **status bar** from the bottom‑right.
5. Press **Full Screen** to present, or **Record** to capture a clip (tick *Record microphone audio* first if you want voice‑over).
6. Use **Capture Scene** to download a clean `.png` of the current scene (UI hidden, brand kept).
7. For Figma prototypes, use the **share** button to copy a link that restores the full setup.

### Figma prototype tips

For a Figma link to display correctly, in Figma:

- Set sharing to **“Anyone with the link → can view.”**
- In prototype settings, set **Device → None** (PreMock adds the frame).
- Set **Scaling → “Scale down to fit width.”**
- Choose the correct **starting frame**.
- In Present mode, enable **“Hide Figma UI”** (the link will include `hide-ui=1`).

The in‑app guide (Gallery → *Follow the guide*) walks through the same steps.

## Browser support

Modern Chromium browsers, Firefox and Safari. Screen recording requires a browser that supports `getDisplayMedia` + `MediaRecorder` (e.g. Chrome).

## Credit

Designed and built by [Arda Arıcan](https://www.thisisarda.com).
