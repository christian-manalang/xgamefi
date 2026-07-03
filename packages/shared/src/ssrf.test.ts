import { describe, it, expect } from "vitest";
import { assertPublicUrl, isBlockedIp } from "./ssrf";

// resolver stub: maps host -> IPs
const resolver = (map: Record<string, string[]>) => async (host: string) => {
  const ips = map[host];
  if (!ips) throw new Error(`no DNS for ${host}`);
  return ips;
};

describe("isBlockedIp", () => {
  it("blocks the cloud metadata IP 169.254.169.254", () => {
    expect(isBlockedIp("169.254.169.254")).toBe(true);
  });
  it("blocks loopback, private, and link-local ranges", () => {
    expect(isBlockedIp("127.0.0.1")).toBe(true);
    expect(isBlockedIp("10.1.2.3")).toBe(true);
    expect(isBlockedIp("172.16.0.1")).toBe(true);
    expect(isBlockedIp("192.168.1.1")).toBe(true);
    expect(isBlockedIp("169.254.0.1")).toBe(true);
    expect(isBlockedIp("::1")).toBe(true);
    expect(isBlockedIp("fc00::1")).toBe(true);
  });
  it("allows a public IP", () => {
    expect(isBlockedIp("93.184.216.34")).toBe(false);
  });
});

describe("assertPublicUrl", () => {
  it("rejects non-HTTPS URLs", async () => {
    await expect(assertPublicUrl("http://example.com", resolver({ "example.com": ["93.184.216.34"] })))
      .rejects.toThrow(/HTTPS/);
  });

  it("rejects a host that resolves to the metadata IP (DNS rebinding)", async () => {
    await expect(
      assertPublicUrl("https://evil.example.com", resolver({ "evil.example.com": ["169.254.169.254"] })),
    ).rejects.toThrow(/blocked/i);
  });

  it("rejects when ANY resolved IP is private (rebinding to mixed answers)", async () => {
    await expect(
      assertPublicUrl("https://mixed.example.com", resolver({ "mixed.example.com": ["93.184.216.34", "10.0.0.5"] })),
    ).rejects.toThrow(/blocked/i);
  });

  it("accepts a public host and pins the resolved IP onto the URL", async () => {
    const url = await assertPublicUrl("https://example.com/items", resolver({ "example.com": ["93.184.216.34"] }));
    expect(url.hostname).toBe("example.com");
    expect((url as URL & { resolvedIp?: string }).resolvedIp).toBe("93.184.216.34");
  });

  it("accepts http://localhost for local development", async () => {
    const url = await assertPublicUrl("http://localhost:3000/api/mock-game", resolver({ localhost: ["127.0.0.1"] }));
    expect(url.hostname).toBe("localhost");
    expect((url as URL & { resolvedIp?: string }).resolvedIp).toBe("127.0.0.1");
  });

  it("accepts http:// for single-label internal hostnames (e.g. Docker service names)", async () => {
    const url = await assertPublicUrl("http://web:3000/api/mock-game", resolver({ web: ["172.20.0.3"] }));
    expect(url.hostname).toBe("web");
    expect((url as URL & { resolvedIp?: string }).resolvedIp).toBe("172.20.0.3");
  });
});
