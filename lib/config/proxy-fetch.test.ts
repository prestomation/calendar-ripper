import { describe, it, expect, vi, beforeEach } from "vitest";
import { getFetchForConfig } from "./proxy-fetch.js";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

function fakeResponse(body: string, status = 200): Response {
    return new Response(body, { status });
}

describe("getFetchForConfig", () => {
    beforeEach(() => {
        vi.resetAllMocks();
    });

    it("returns a direct fetch function when proxy is false", async () => {
        const fetchFn = getFetchForConfig({ proxy: false });
        mockFetch.mockResolvedValueOnce(fakeResponse("ok"));

        await fetchFn("https://example.com/");

        expect(mockFetch).toHaveBeenCalledWith("https://example.com/", undefined);
    });

    it("returns a direct fetch function when proxy is undefined", async () => {
        const fetchFn = getFetchForConfig({});
        mockFetch.mockResolvedValueOnce(fakeResponse("ok"));

        await fetchFn("https://example.com/");

        expect(mockFetch).toHaveBeenCalledWith("https://example.com/", undefined);
    });

    it('returns direct fetch for "outofband" proxy', async () => {
        const fetchFn = getFetchForConfig({ proxy: "outofband" });
        mockFetch.mockResolvedValueOnce(fakeResponse("ok"));

        await fetchFn("https://example.com/");

        expect(mockFetch).toHaveBeenCalledWith("https://example.com/", undefined);
    });
});
