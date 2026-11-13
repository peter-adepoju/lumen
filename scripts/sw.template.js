// Lumen's service worker: makes the app open and work offline.
// Generated into public/sw.js by scripts/build-sw.mjs with a new version on every build.
const VERSION = "__VERSION__";
const PAGES = ["/today", "/learn", "/library", "/practice", "/progress", "/you", "/unwind", "/news", "/review", "/play", "/session", "/setup"];
const SHELL = `lumen-shell-${VERSION}`, STATIC = "lumen-static", RUNTIME = `lumen-runtime-${VERSION}`;

// Saves each page and every script and style it needs, so all of Lumen opens offline after one visit.
async function warm() {
  const shell = await caches.open(SHELL), stat = await caches.open(STATIC);
  const assets = new Set(["/icon.svg", "/icon-192.png", "/icon-512.png", "/apple-icon.png", "/manifest.webmanifest"]);
  await Promise.all(PAGES.map(async p => {
    try {
      const res = await fetch(p, { credentials: "same-origin" });
      if (!res.ok) return;
      const html = await res.clone().text();
      await shell.put(p, res);
      for (const m of html.matchAll(/(?:src|href)="(\/_next\/static\/[^"]+)"/g)) assets.add(m[1]);
    } catch {}
  }));
  await Promise.all([...assets].map(async a => { try { if (!(await stat.match(a))) { const r = await fetch(a); if (r.ok) await stat.put(a, r); } } catch {} }));
}

self.addEventListener("install", e => { e.waitUntil(warm().then(() => self.skipWaiting())); });
self.addEventListener("activate", e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== SHELL && k !== STATIC && k !== RUNTIME) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== location.origin) return;
  if (url.pathname.startsWith("/api/")) return; // sign-in, link checks and book search always go to the network

  // Built files never change once published: cache first.
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/pdfjs/")) {
    e.respondWith(caches.open(STATIC).then(async c => (await c.match(req)) ?? fetch(req).then(r => { if (r.ok) c.put(req, r.clone()); return r; })));
    return;
  }

  // Pages: the network first, so updates arrive; the saved copy when offline.
  if (req.mode === "navigate") {
    e.respondWith((async () => {
      try {
        const r = await fetch(req);
        if (r.ok && PAGES.includes(url.pathname)) (await caches.open(SHELL)).put(url.pathname, r.clone());
        else if (r.ok && url.pathname.startsWith("/read/")) (await caches.open(RUNTIME)).put(url.pathname, r.clone());
        return r;
      } catch {
        const shell = await caches.open(SHELL), rt = await caches.open(RUNTIME);
        return (await shell.match(url.pathname)) ?? (await rt.match(url.pathname))
          ?? (url.pathname.startsWith("/read/") ? (await rt.keys()).length ? rt.match((await rt.keys())[0]) : undefined : undefined)
          ?? (await shell.match("/today")) ?? Response.error();
      }
    })());
    return;
  }

  // Data for client-side page changes: fresh when online, saved copy offline.
  if (url.searchParams.has("_rsc") || req.headers.get("RSC") === "1") {
    e.respondWith(fetch(req).then(async r => { if (r.ok) (await caches.open(RUNTIME)).put(req, r.clone()); return r; }).catch(async () => (await caches.match(req)) ?? Response.error()));
    return;
  }

  // Icons, fonts and other files: serve the saved copy and refresh it in the background.
  e.respondWith(caches.open(RUNTIME).then(async c => {
    const hit = await c.match(req);
    const net = fetch(req).then(r => { if (r.ok) c.put(req, r.clone()); return r; }).catch(() => hit ?? Response.error());
    return hit ?? net;
  }));
});

// Reminders: tapping the notification opens Today.
self.addEventListener("notificationclick", e => {
  e.notification.close();
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const open = all.find(c => new URL(c.url).origin === location.origin);
    if (open) { await open.focus(); return open.navigate?.("/today"); }
    return self.clients.openWindow("/today");
  })());
});
