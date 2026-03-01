# Nodriver Proxy Sidecar

A local HTTP server that fetches pages using [nodriver](https://ultrafunkamsterdam.github.io/nodriver/) (headless Chrome). It provides the same `?url=` interface as the Lambda proxy but uses a real browser, defeating advanced bot detection (Cloudflare TLS fingerprinting, WAF, etc.).

## Prerequisites

- Python 3.12+
- Google Chrome or Chromium installed

## Setup

```bash
cd infra/nodriver-proxy
pip install -r requirements.txt
```

## Usage

Start the server:

```bash
python server.py                    # default port 9222
python server.py --port 8080        # custom port
python server.py --timeout 15       # custom page timeout (seconds)
```

Set the environment variable so rippers use it:

```bash
export NODRIVER_PROXY_URL=http://localhost:9222
```

### Endpoints

| Endpoint | Method | Description |
|---|---|---|
| `/?url=<target>` | GET | Fetch page via headless Chrome |
| `/?url=<target>&wait=3000` | GET | Fetch with explicit wait (ms) |
| `/health` | GET | Returns 200 when browser is ready |

### Ripper configuration

Set `proxy: "nodriver"` in a ripper's `ripper.yaml`:

```yaml
name: my-venue
proxy: "nodriver"
url: "https://www.example.com/events"
```

Or use the project-level toggle to switch all proxy-enabled rippers:

```bash
export DEFAULT_PROXY_TYPE=nodriver
```

This overrides `proxy: true` / `proxy: "lambda"` rippers to use the nodriver sidecar instead.

## CI Integration

In GitHub Actions, add steps before the build:

```yaml
- uses: actions/setup-python@v5
  with:
    python-version: "3.12"

- name: Start nodriver proxy
  run: |
    pip install -r infra/nodriver-proxy/requirements.txt
    python infra/nodriver-proxy/server.py &
    sleep 3  # wait for browser to start
  env:
    DISPLAY: ":99"

- name: Generate calendars
  env:
    NODRIVER_PROXY_URL: http://localhost:9222
```

## Architecture

```
Ripper (TypeScript)
  │
  │  GET http://localhost:9222/?url=https://target-site.com
  │
  ▼
server.py (Python/aiohttp)
  │
  │  nodriver.start() → persistent headless Chrome
  │  browser.get(url, new_tab=True)
  │  tab.get_content()
  │  tab.close()
  │
  ▼
Target website sees a real Chrome browser
```

- Single browser instance shared across requests
- Each request opens a fresh tab (isolation) and closes it after
- Default 1-second wait for JS rendering; configurable via `?wait=` parameter
- Graceful shutdown on SIGINT/SIGTERM
