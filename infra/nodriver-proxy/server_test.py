"""
Unit tests for the nodriver proxy sidecar server.

These test the aiohttp handler logic with a mocked browser. They do NOT
require Chrome to be installed.

Run:
    python -m pytest infra/nodriver-proxy/server_test.py
"""

import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from aiohttp.test_utils import AioHTTPTestCase, TestClient, TestServer
from aiohttp import web

from server import NodriverProxy


@pytest.fixture
def proxy():
    """Create a NodriverProxy with a mocked browser."""
    p = NodriverProxy(timeout=5)
    p.browser = MagicMock()
    return p


@pytest.fixture
def mock_tab():
    tab = AsyncMock()
    tab.get_content = AsyncMock(return_value="<html><body>Hello</body></html>")
    tab.close = AsyncMock()
    tab.sleep = AsyncMock()
    return tab


def make_app(proxy: NodriverProxy) -> web.Application:
    app = web.Application()
    app.router.add_route("*", "/", proxy.handle_proxy)
    app.router.add_get("/health", proxy.handle_health)
    return app


@pytest.mark.asyncio
async def test_health_with_browser(proxy):
    app = make_app(proxy)
    async with TestClient(TestServer(app)) as client:
        resp = await client.get("/health")
        assert resp.status == 200
        assert await resp.text() == "ok"


@pytest.mark.asyncio
async def test_health_without_browser():
    proxy = NodriverProxy()
    proxy.browser = None
    app = make_app(proxy)
    async with TestClient(TestServer(app)) as client:
        resp = await client.get("/health")
        assert resp.status == 503


@pytest.mark.asyncio
async def test_missing_url_param(proxy):
    app = make_app(proxy)
    async with TestClient(TestServer(app)) as client:
        resp = await client.get("/")
        assert resp.status == 400
        assert "Missing" in await resp.text()


@pytest.mark.asyncio
async def test_invalid_wait_param(proxy):
    app = make_app(proxy)
    async with TestClient(TestServer(app)) as client:
        resp = await client.get("/", params={"url": "https://example.com", "wait": "abc"})
        assert resp.status == 400
        assert "Invalid wait" in await resp.text()


@pytest.mark.asyncio
async def test_successful_fetch(proxy, mock_tab):
    proxy.browser.get = AsyncMock(return_value=mock_tab)
    app = make_app(proxy)
    async with TestClient(TestServer(app)) as client:
        resp = await client.get("/", params={"url": "https://example.com"})
        assert resp.status == 200
        body = await resp.text()
        assert "Hello" in body
        mock_tab.close.assert_awaited_once()


@pytest.mark.asyncio
async def test_fetch_with_wait(proxy, mock_tab):
    proxy.browser.get = AsyncMock(return_value=mock_tab)
    app = make_app(proxy)
    async with TestClient(TestServer(app)) as client:
        resp = await client.get("/", params={"url": "https://example.com", "wait": "3000"})
        assert resp.status == 200
        # sleep should have been called with 3.0 seconds
        mock_tab.sleep.assert_any_await(3.0)


@pytest.mark.asyncio
async def test_fetch_error_returns_502(proxy):
    proxy.browser.get = AsyncMock(side_effect=RuntimeError("connection failed"))
    app = make_app(proxy)
    async with TestClient(TestServer(app)) as client:
        resp = await client.get("/", params={"url": "https://example.com"})
        assert resp.status == 502
        assert "connection failed" in await resp.text()


@pytest.mark.asyncio
async def test_tab_closed_on_error(proxy, mock_tab):
    mock_tab.get_content = AsyncMock(side_effect=RuntimeError("render failed"))
    proxy.browser.get = AsyncMock(return_value=mock_tab)
    app = make_app(proxy)
    async with TestClient(TestServer(app)) as client:
        resp = await client.get("/", params={"url": "https://example.com"})
        assert resp.status == 502
        mock_tab.close.assert_awaited_once()
