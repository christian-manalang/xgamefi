import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function load(name: string) {
  return JSON.parse(readFileSync(join(__dirname, "..", name), "utf8"));
}

describe("railway configs", () => {
  it("web runs migrate deploy + generate in the release step and never seeds", () => {
    const web = load("railway.web.json");
    const release = web.deploy.preDeployCommand ?? web.deploy.releaseCommand ?? "";
    expect(release).toContain("prisma migrate deploy");
    expect(release).toContain("prisma generate");
    expect(release).not.toContain("db:seed");
    expect(web.deploy.startCommand).toContain("web");
    expect(web.deploy.healthcheckPath).toBe("/api/health");
  });

  it("worker config has a start command and no seed", () => {
    const worker = load("railway.worker.json");
    expect(worker.deploy.startCommand).toContain("worker");
    const release = worker.deploy.preDeployCommand ?? worker.deploy.releaseCommand ?? "";
    expect(release).not.toContain("db:seed");
  });
});
