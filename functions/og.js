// Open Graph previews for share links.
//
//  • ogShot   — when a share mapping is created, render that share in the real app (#shot mode,
//               UI hidden) with headless Chrome, screenshot the phone-on-backdrop, store the PNG
//               in Storage (uploads/og/<id>.png) and write its URL back onto the mapping.
//  • shareOG  — the Firebase-hosted /s/<id> endpoint: serves per-prototype OG/Twitter meta tags
//               (pointing at that screenshot) so social crawlers show the actual prototype, then
//               redirects humans to the app on premock.co.
const { onRequest } = require('firebase-functions/v2/https');
const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const admin = require('firebase-admin');
const { randomUUID } = require('crypto');

if (!admin.apps.length) admin.initializeApp();

const APP_ORIGIN = 'https://premock.co';
const DEFAULT_OG = 'https://premock.co/og-image.png';

// ---- ogShot: capture a freshly-created share's preview ----
exports.ogShot = onDocumentCreated(
  { document: 'shareMappings/{id}', region: 'us-central1', memory: '1GiB', timeoutSeconds: 120, concurrency: 1 },
  async (event) => {
    const id = event.params.id;
    let browser;
    try {
      const chromium = require('@sparticuz/chromium');
      const puppeteer = require('puppeteer-core');
      browser = await puppeteer.launch({
        args: chromium.args,
        defaultViewport: { width: 1200, height: 630, deviceScaleFactor: 2 },
        executablePath: await chromium.executablePath(),
        headless: chromium.headless,
      });
      const page = await browser.newPage();
      // #shot tells the app to skip the intro, hide all chrome and raise __premockShotReady.
      await page.goto(`${APP_ORIGIN}/?${encodeURIComponent(id)}#shot`, { waitUntil: 'networkidle2', timeout: 60000 });
      await page.waitForFunction('window.__premockShotReady === true', { timeout: 15000 }).catch(() => {});
      const buffer = await page.screenshot({ type: 'png' });
      await browser.close(); browser = null;

      // A Firebase download token makes the object publicly fetchable by crawlers (no auth),
      // without touching Storage security rules.
      const token = randomUUID();
      const filePath = `uploads/og/${id}.png`;
      const bucket = admin.storage().bucket();
      await bucket.file(filePath).save(buffer, {
        contentType: 'image/png',
        resumable: false,
        metadata: { metadata: { firebaseStorageDownloadTokens: token } },
      });
      const url = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(filePath)}?alt=media&token=${token}`;
      await admin.firestore().collection('shareMappings').doc(id).set({ og: url, ogW: 2400, ogH: 1260 }, { merge: true });
    } catch (err) {
      console.error('ogShot failed for', id, err);
    } finally {
      if (browser) { try { await browser.close(); } catch (_) {} }
    }
  }
);

// ---- shareOG: serve OG tags, then bounce humans to the app ----
function esc(s){
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

exports.shareOG = onRequest(
  { region: 'us-central1', timeoutSeconds: 20, memory: '256MiB' },
  async (req, res) => {
    const match = (req.path || '').match(/\/s\/([^/?#]+)/);
    const id = match ? decodeURIComponent(match[1]) : '';
    const appUrl = `${APP_ORIGIN}/?${encodeURIComponent(id)}`;

    let data = null;
    if (id) {
      try {
        const snap = await admin.firestore().collection('shareMappings').doc(id).get();
        if (snap.exists) data = snap.data();
      } catch (e) { console.error('shareOG load failed', e); }
    }
    // Unknown id → just send them to the home page.
    if (!id || !data) { res.redirect(302, APP_ORIGIN + '/'); return; }

    const title = data.title ? `${data.title} — PreMock` : 'PreMock prototype';
    const desc = 'Open this interactive prototype on a realistic phone — presented with PreMock.';
    const image = data.og || DEFAULT_OG;
    const w = data.og ? (data.ogW || 1200) : 1200;
    const h = data.og ? (data.ogH || 630) : 630;

    const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<meta property="og:type" content="website">
<meta property="og:site_name" content="PreMock">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${esc(appUrl)}">
<meta property="og:image" content="${esc(image)}">
<meta property="og:image:width" content="${w}">
<meta property="og:image:height" content="${h}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(desc)}">
<meta name="twitter:image" content="${esc(image)}">
<meta http-equiv="refresh" content="0;url=${esc(appUrl)}">
<link rel="canonical" href="${esc(appUrl)}">
</head><body style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;background:#f4f1ea;color:#1a1714;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">
<p>Opening prototype… <a href="${esc(appUrl)}">Continue</a></p>
<script>location.replace(${JSON.stringify(appUrl)});</script>
</body></html>`;

    // If the screenshot isn't ready yet, cache only briefly so a re-scrape soon picks up the real one.
    res.set('Cache-Control', data.og ? 'public, max-age=86400' : 'public, max-age=30');
    res.status(200).send(html);
  }
);
