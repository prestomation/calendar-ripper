"""
Nodriver proxy sidecar server.

A local HTTP server that fetches pages using nodriver (headless Chrome),
providing the same ?url= interface as the Lambda proxy. This defeats
advanced bot detection (Cloudflare TLS fingerprinting, etc.) because
requests come from a real browser.

Start:
    python server.py [--port 9222]

Request:
    GET http://localhost:9222/?url=https://example.com
    GET http://localhost:9222/?url=https://example.com&wait=3000

Health check:
    GET http://localhost:9222/health
"""

import argparse
import asyncio
import logging
import signal
import sys

import nodriver
from aiohttp import web

logger = logging.getLogger("nodriver-proxy")

DEFAULT_PORT = 9222
DEFAULT_TIMEOUT = 10  # seconds


class NodriverProxy:
    def __init__(self, timeout: int = DEFAULT_TIMEOUT):
        self.browser: nodriver.Browser | None = None
        self.timeout = timeout

    async def start_browser(self) -> None:
        logger.info("Starting headless Chrome via nodriver...")
        self.browser = await nodriver.start(
            headless=True,
            browser_args=["--disable-gpu", "--no-sandbox"],
        )
        logger.info("Browser ready.")

    async def stop_browser(self) -> None:
        if self.browser:
            logger.info("Stopping browser...")
            self.browser.stop()
            self.browser = None

    async def fetch_page(self, url: str, wait_ms: int | None = None) -> tuple[str, int]:
        """Navigate to *url* in a new tab, return (html, status_code)."""
        if not self.browser:
            raise RuntimeError("Browser not started")

        tab = await self.browser.get(url, new_tab=True)
        try:
            if wait_ms:
                await tab.sleep(wait_ms / 1000)
            else:
                # Give the page a moment for JS to render
                await tab.sleep(1)

            content = await tab.get_content()
            return content, 200
        finally:
            await tab.close()

    # ---- aiohttp handlers ------------------------------------------------

    async def handle_proxy(self, request: web.Request) -> web.Response:
        target_url = request.query.get("url")
        if not target_url:
            return web.Response(
                status=400, text="Missing required query parameter: url"
            )

        wait_ms: int | None = None
        wait_param = request.query.get("wait")
        if wait_param:
            try:
                wait_ms = int(wait_param)
            except ValueError:
                return web.Response(status=400, text="Invalid wait parameter")

        logger.info("Fetching: %s", target_url)
        try:
            html, status = await asyncio.wait_for(
                self.fetch_page(target_url, wait_ms),
                timeout=self.timeout,
            )
            return web.Response(
                status=status,
                text=html,
                content_type="text/html",
            )
        except asyncio.TimeoutError:
            logger.warning("Timeout fetching %s", target_url)
            return web.Response(status=504, text="Proxy timeout")
        except Exception as exc:
            logger.exception("Error fetching %s", target_url)
            return web.Response(
                status=502, text=f"Proxy request failed: {exc}"
            )

    async def handle_health(self, _request: web.Request) -> web.Response:
        if self.browser:
            return web.Response(text="ok")
        return web.Response(status=503, text="browser not ready")


async def run_server(port: int, timeout: int) -> None:
    proxy = NodriverProxy(timeout=timeout)
    await proxy.start_browser()

    app = web.Application()
    app.router.add_route("*", "/", proxy.handle_proxy)
    app.router.add_get("/health", proxy.handle_health)

    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, "127.0.0.1", port)
    await site.start()
    logger.info("Nodriver proxy listening on http://127.0.0.1:%d", port)

    # Wait for shutdown signal
    stop = asyncio.Event()
    loop = asyncio.get_running_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        loop.add_signal_handler(sig, stop.set)
    await stop.wait()

    logger.info("Shutting down...")
    await runner.cleanup()
    await proxy.stop_browser()


def main() -> None:
    parser = argparse.ArgumentParser(description="Nodriver proxy sidecar")
    parser.add_argument("--port", type=int, default=DEFAULT_PORT)
    parser.add_argument("--timeout", type=int, default=DEFAULT_TIMEOUT)
    args = parser.parse_args()

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(name)s %(levelname)s %(message)s",
    )

    try:
        asyncio.run(run_server(args.port, args.timeout))
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
