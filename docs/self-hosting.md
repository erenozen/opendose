# Running your own copy of OpenDose

OpenDose is a folder of static files: the browser does all the work, so
any web server can host it, and it needs no database, no backend and no
internet once built. Run your own copy when your institution wants tools on
its own servers, or on a computer that is never online.

What your users get is the same app as opendose.erenozen.dev: it contacts
only the server it was loaded from (see "Your data and privacy" in the app,
or `#privacy` after the address).

## 1. Build it (once, on a computer with internet)

You need [Node.js 22](https://nodejs.org/) and a copy of this repository
(the whole repository: the build copies the Python engine from `engine/`).

```bash
git clone https://github.com/erenozen/opendose.git
cd opendose/web
npm ci          # the JavaScript packages
npm run build   # → web/dist
```

The build downloads NumPy, SciPy and the .xlsx reader (about 17 MB) and
checks each file against its published SHA-256; a file that does not match
stops the build. They are cached in `web/node_modules/.cache`, so later
builds work offline.

`web/dist` (about 40 MB) is the whole site. Copy it anywhere.

## 2. Serve it, with the security headers

Serve `web/dist` at the root of a host name (`https://opendose.your-lab.org/`,
not `https://your-lab.org/opendose/`: the app expects to sit at `/`).

Send the security headers below with every file. They are what makes the
browser refuse to contact any other server, so do not leave them out. The
single source is [`web/public/_headers`](../web/public/_headers); the
examples below match it at the time of writing, so compare after updating.

The server must also send `.wasm` files as `application/wasm` and `.mjs`
files as `text/javascript` (recent nginx, Apache and Caddy already do).

### nginx

```nginx
server {
    listen 443 ssl;
    server_name opendose.your-lab.org;
    # ssl_certificate … / ssl_certificate_key …
    root /srv/opendose/dist;

    add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; connect-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; worker-src 'self' blob:; manifest-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'" always;
    add_header Referrer-Policy "no-referrer" always;
    add_header Permissions-Policy "camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=(), bluetooth=(), browsing-topics=()" always;
    add_header X-Content-Type-Options "nosniff" always;

    location / { try_files $uri =404; }
}
```

### Apache (with `mod_headers`)

```apache
<VirtualHost *:443>
    ServerName opendose.your-lab.org
    # SSLEngine on / SSLCertificateFile … / SSLCertificateKeyFile …
    DocumentRoot /srv/opendose/dist
    AddType application/wasm .wasm
    AddType text/javascript .mjs
    Header always set Content-Security-Policy "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; connect-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; worker-src 'self' blob:; manifest-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"
    Header always set Referrer-Policy "no-referrer"
    Header always set Permissions-Policy "camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=(), bluetooth=(), browsing-topics=()"
    Header always set X-Content-Type-Options "nosniff"
</VirtualHost>
```

### Caddy

```caddy
opendose.your-lab.org {
    root * /srv/opendose/dist
    file_server
    header {
        Content-Security-Policy "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; connect-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; worker-src 'self' blob:; manifest-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"
        Referrer-Policy "no-referrer"
        Permissions-Policy "camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=(), bluetooth=(), browsing-topics=()"
        X-Content-Type-Options "nosniff"
    }
}
```

### Cloudflare (as opendose.erenozen.dev does)

Edit `wrangler.jsonc` (name and route) and run `npx wrangler deploy` from
the repository root. Cloudflare applies `web/dist/_headers` by itself.

### One computer, no server

```bash
cd opendose/web
node scripts/serve-dist.mjs 5300    # http://localhost:5300/
```

`serve-dist.mjs` applies `_headers` too. Keep it on `localhost`: it is
meant for one machine, not for a network.

## 3. A computer that is never online

Build on a computer with internet (step 1), copy `web/dist` to the offline
computer, and serve it there as in step 2 (for one person,
`serve-dist.mjs` on `localhost` is enough; it needs Node.js on that
computer too).

## Use `https` (or `localhost`)

Browsers allow two features only on `https://` addresses or on `localhost`:
the offline cache (the app opening without the network) and the encryption
behind password-protected share links. Over plain `http://` on a network
the app still analyses data, but without those two.

## 4. Check your copy

The same test that guards opendose.erenozen.dev can check your server: it
uses the app with marked data and fails if anything leaves the page, any
other server is contacted, or the security headers are missing.

```bash
cd opendose/web
npx playwright install chromium      # once: a test browser
node scripts/e2e-privacy.mjs https://opendose.your-lab.org/
```

It ends with `ALL PASSED`, or lists what failed.

## 5. Updating

```bash
cd opendose
git pull
cd web && npm ci && npm run build
```

Then replace the served folder with the new `web/dist`. Browsers pick up
the new version the next time the page is opened (the page itself is
always checked with the server first).
