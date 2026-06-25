import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const API = join(__dirname, "..");
const SENSITIVE: Array<[string, string]> = [
  ["admin/settings/route.ts", "platform.settings.update"],
  ["studios/route.ts", "studio.onboard"],
  ["studios/[id]/route.ts", "studio.update"],
  ["studios/[id]/api-keys/route.ts", "apikey.issue"],
  ["studios/[id]/api-keys/[keyId]/route.ts", "apikey.revoke"],
  ["studios/[id]/webhook/route.ts", "webhook.config"],
  ["studios/[id]/webhooks/deliveries/[deliveryId]/retry/route.ts", "webhook.retry"],
  ["studios/[id]/webhooks/test/route.ts", "webhook.test"],
];

describe("audit-log coverage on sensitive actions", () => {
  it.each(SENSITIVE)("%s writes audit action %s", (rel, action) => {
    const src = readFileSync(join(API, rel), "utf8");
    expect(src).toContain("writeAudit");
    expect(src).toContain(action);
  });
});
