const {onRequest} = require('firebase-functions/v2/https');

// Open Graph share-preview functions (screenshot generator + /s/<id> OG renderer).
const og = require('./og');
exports.ogShot = og.ogShot;
exports.shareOG = og.shareOG;

// A real browser User-Agent: some sites (e.g. getir.com) return 403 to bot/curl requests and
// only reveal their true framing headers to a browser-like client.
const BROWSER_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const FETCH_TIMEOUT_MS = 9000;

// Pull the `frame-ancestors` sources out of a Content-Security-Policy header. Returns the list of
// source tokens (e.g. ["'self'", "*.getir.com"]), or null when the directive isn't present.
function parseFrameAncestors(csp){
  if(!csp) return null;
  const directive = csp.split(';').map(s=>s.trim()).find(d=>/^frame-ancestors\b/i.test(d));
  if(!directive) return null;
  return directive.replace(/^frame-ancestors\b/i,'').trim().split(/\s+/).filter(Boolean);
}

// Does a single CSP source token allow our parent host? Handles *, https:, exact host and *.base.
function ancestorAllowsHost(src, host){
  src = src.replace(/^['"]|['"]$/g,'');            // strip quotes if any slipped through
  if(src==='*' || src==='https:' || src==='http:') return true;
  const cleaned = src.replace(/^https?:\/\//i,'').replace(/\/.*$/,'').replace(/:\d+$/,'').toLowerCase();
  if(cleaned===host) return true;
  if(cleaned.startsWith('*.')){
    const base = cleaned.slice(2);
    return host===base || host.endsWith('.'+base);
  }
  return false;
}

// Decide whether `parentOrigin` is allowed to embed a page that returned these headers.
// Returns true (embeddable), false (blocked), or null (no opinion — shouldn't happen here).
function isEmbeddable(headers, parentOrigin){
  const host = String(parentOrigin||'').replace(/^https?:\/\//i,'').replace(/:\d+$/,'').replace(/\/.*$/,'').toLowerCase();

  const xfo = (headers.get('x-frame-options')||'').toLowerCase();
  if(xfo){
    if(xfo.includes('deny')) return false;
    if(xfo.includes('sameorigin')) return false;        // cross-origin parent → blocked
    // ALLOW-FROM is obsolete: Chrome never supported it and Firefox dropped it, so modern
    // browsers ignore it entirely (the page frames fine). Treat it as no XFO restriction and
    // fall through to the CSP check — matching real browser behaviour.
  }

  const ancestors = parseFrameAncestors(headers.get('content-security-policy'));
  if(ancestors){
    if(ancestors.some(s=>/^'?none'?$/i.test(s))) return false;
    return ancestors.some(src=>ancestorAllowsHost(src, host));
  }

  return true;   // no framing restriction found
}

// GET /embedCheck?url=...  →  { embeddable: true|false|null, reason, status }
// embeddable:null means "couldn't determine" (network error / blocked request) so the client
// falls back to its own heuristic instead of wrongly hiding a working site.
exports.embedCheck = onRequest(
  { region: 'us-central1', cors: true, timeoutSeconds: 20, memory: '256MiB' },
  async (req, res) => {
    const raw = req.query.url;
    let target;
    try { target = new URL(String(raw||'')); }
    catch(e){ res.status(400).json({ embeddable:null, reason:'bad-url' }); return; }
    if(!/^https?:$/.test(target.protocol)){ res.status(400).json({ embeddable:null, reason:'bad-protocol' }); return; }

    const parentOrigin = req.headers.origin || 'https://premock.co';

    const controller = new AbortController();
    const timer = setTimeout(()=>controller.abort(), FETCH_TIMEOUT_MS);
    let resp;
    try {
      resp = await fetch(target.href, {
        method: 'GET',
        redirect: 'follow',
        signal: controller.signal,
        headers: {
          'User-Agent': BROWSER_UA,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'sec-ch-ua': '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
          'sec-ch-ua-mobile': '?0',
          'sec-ch-ua-platform': '"macOS"',
          'Sec-Fetch-Dest': 'document',
          'Sec-Fetch-Mode': 'navigate',
          'Sec-Fetch-Site': 'none',
          'Sec-Fetch-User': '?1',
          'Upgrade-Insecure-Requests': '1'
        }
      });
    } catch(e){
      clearTimeout(timer);
      res.json({ embeddable:null, reason:'fetch-failed' });   // unreachable / timed out → unknown
      return;
    }
    clearTimeout(timer);

    // A framing header is authoritative regardless of status code. But if there's NO framing
    // header AND the response isn't a clean 200, the site likely bot-blocked our datacenter
    // request (e.g. getir.com → 405, amazon.com → 202) and we never saw its real headers — so
    // report "unverifiable" (null) and let the client fall back to its heuristic, rather than
    // wrongly declaring it embeddable.
    const xfo = resp.headers.get('x-frame-options');
    const csp = resp.headers.get('content-security-policy');
    const hasFramingHeader = !!xfo || /frame-ancestors/i.test(csp || '');
    if(!hasFramingHeader && resp.status !== 200){
      res.json({ embeddable:null, reason:'unverifiable', status: resp.status });
      return;
    }

    const embeddable = isEmbeddable(resp.headers, parentOrigin);
    res.json({ embeddable, reason: embeddable===false ? 'blocked' : 'ok', status: resp.status });
  }
);
