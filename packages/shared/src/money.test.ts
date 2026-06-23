import { describe, it, expect } from "vitest";
import { Prisma } from "@xgamefi/db";
import { feeAmount, netAmount, toStellarAmount, fromStellarAmount } from "./money";

const D = (v: string) => new Prisma.Decimal(v);

describe("money", () => {
  it("feeAmount applies bps and rounds DOWN to 7dp", () => {
    // 1.0000000 * 500/10000 = 0.05
    expect(feeAmount(D("1"), 500).toString()).toBe("0.05");
    // 0.0000001 * 500/10000 = 0.000000005 -> rounds down to 0
    expect(feeAmount(D("0.0000001"), 500).toString()).toBe("0");
  });

  it("netAmount is gross minus fee", () => {
    expect(netAmount(D("1"), 500).toString()).toBe("0.95");
    expect(netAmount(D("10"), 250).toString()).toBe("9.75");
  });

  it("feeAmount handles 0 and 10000 bps boundaries", () => {
    expect(feeAmount(D("5"), 0).toString()).toBe("0");
    expect(feeAmount(D("5"), 10000).toString()).toBe("5");
  });

  it("toStellarAmount always formats to exactly 7 decimals", () => {
    expect(toStellarAmount(D("1"))).toBe("1.0000000");
    expect(toStellarAmount(D("0.95"))).toBe("0.9500000");
    expect(toStellarAmount(D("12.3456789"))).toBe("12.3456789");
  });

  it("fromStellarAmount round-trips", () => {
    expect(fromStellarAmount("1.0000000").equals(D("1"))).toBe(true);
    expect(toStellarAmount(fromStellarAmount("0.9500000"))).toBe("0.9500000");
  });
});
