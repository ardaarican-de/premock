# PreMock

**Present Figma & AI prototypes beautifully.**

PreMock drops your prototype into a realistic hand‑held phone mockup and turns it into an interactive, live presentation. Paste a Figma link or upload an AI‑generated HTML prototype, pick a backdrop, and present — or record the whole thing as a video.

🔗 **Live:** [premock.co](https://premock.co/)

---

## Features

- **Two prototype sources**
  - **Figma** — paste a prototype share link; it's embedded right in the phone.
  - **HTML** — drag & drop a file, click **Upload HTML**, or paste raw markup into the gallery. Uploads to Firebase show a quiet top‑center progress toast.
- **Realistic device mockup** — a hand holding the phone, with an **iOS / Android** toggle.
- **Custom cursor** — a soft dot replaces the system cursor over the screen for a clean, touch‑like feel.
- **Backdrops** — three built‑in scenes (Soft Gray, Apricot, Sky Blue), a set of **ready‑made room photos** (home, office, clothing store, coffee shop), a full **color palette** with hex input and a random‑color dice, or your own uploaded **background image**.
- **Status bar overlay** — toggle an **iOS or Android** status bar on top of the screen. Its ink follows the content behind it automatically (**Auto**), or you can force **Light** / **Dark**.
- **Prototype gallery** — save, rename and remove prototypes; persisted in the browser (`localStorage`). Figma titles are fetched automatically via oEmbed.
- **Onboarding welcome card** — a short intro card appears once on the first visit (dismissed state is remembered).
- **Presentation mode** — go fullscreen; the UI fades away while you present.
- **Screen recording** — capture the presentation with `MediaRecorder` and download a `.webm`. Optional **microphone audio** via a checkbox in the record tooltip.
- **Capture Scene** — grab a single clean frame of the scene as a `.png`. The whole UI (dock, menus, cursor) is hidden for the shot — only the backdrop, phone and the top‑left brand are captured. Reuses the live recording stream when one is running, so it won't prompt twice.
- **Shareable links** — copy a short link (e.g. `premock.co/?k7x2qa`) that reopens your prototype exactly as you set it up: the **device**, **backdrop** and **status‑bar** state are all restored. Works for both **Figma** links and **uploaded HTML** prototypes — uploaded files are stored on Firebase, so the recipient sees the live prototype, not just a URL. See [Sharing prototypes](#sharing-prototypes).
- **Dark‑mode aware favicon.**

## Tech

No build step, no dependencies — just **vanilla HTML, CSS and JavaScript**.

| File | Purpose |
|------|---------|
| [`index.html`](index.html) | Markup + Google Analytics + favicon |
| [`styles.css`](styles.css) | All styling |
| [`app.js`](app.js) | Core behavior (device fitting, cursor, gallery, scenes, status bar, sharing) |
| [`recording.js`](recording.js) | Screen recording + scene capture — a self-contained subsystem |
| [`firebase-init.js`](firebase-init.js) | Firebase wiring — uploads HTML to Storage and saves/loads share links in Firestore |
| [`firestore.rules`](firestore.rules) / [`storage.rules`](storage.rules) | Security rules for the share/upload backend |
| [`404.html`](404.html) | GitHub Pages fallback — carries the social‑preview tags and bounces older clean‑path links (`/k7x2qa`) into the app (see [Sharing prototypes](#sharing-prototypes)) |
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

## Sharing prototypes

PreMock lets you hand someone a single short link that opens your prototype in the exact
environment you presented it in — same device frame, backdrop and status bar — and stays
**fully interactive**. Whoever you send it to just clicks and explores; nothing to install.

**How it works**

1. Open any prototype (Figma link or uploaded HTML) and set up the device, backdrop and
   status bar the way you like.
2. Press the **share** button on the file pill (top‑right). PreMock saves the current setup
   and copies a short link such as `https://premock.co/?k7x2qa`.
3. The recipient opens the link and lands on the same scene, ready to interact.

**Under the hood**

- **Uploaded HTML** is stored on **Firebase Storage** so the prototype itself travels with the
  link — the viewer runs the real thing, not a screenshot.
- Each share is a small record in **Cloud Firestore** holding the prototype reference plus the
  device / backdrop / status‑bar choices, keyed by a **random 6‑character id** (non‑sequential,
  so links can't be guessed or enumerated).
- Links are short query strings (`/?k7x2qa`). This form is served by [`index.html`](index.html)
  with a `200` status and Open Graph tags, so **social previews render everywhere** (a clean
  `/k7x2qa` path would 404 on GitHub Pages, and some crawlers skip 404 responses). Older
  clean‑path links still work: [`404.html`](404.html) bounces them to `/?/k7x2qa` and a small
  script in `index.html` restores the path with `history.replaceState`.
- If a link can't be resolved — the prototype was removed, or the id is wrong — PreMock opens
  the home screen and shows a **“This prototype isn't available”** notice instead of a blank
  frame.

> Sharing needs Firebase configured (Storage + Firestore). Without it, uploads stay local and
> the share button falls back to a long query‑string link for Figma prototypes only.

**Security rules**

Shares and uploads are unauthenticated by design (anyone can create a link, anyone with the id
can open it), so the abuse surface is bounded in the rules rather than by auth. Ship
[`firestore.rules`](firestore.rules) and [`storage.rules`](storage.rules) — they allow only the
two upload folders and the `shareMappings` collection, validate each write's shape and size,
forbid enumeration, edits and deletes, and deny everything else.

```bash
firebase deploy --only firestore:rules,storage
```

## Browser support

Modern Chromium browsers, Firefox and Safari. Screen recording requires a browser that supports `getDisplayMedia` + `MediaRecorder` (e.g. Chrome).

## Credit

Designed and built by [Arda Arıcan](https://www.thisisarda.com).
