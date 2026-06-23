import BigNumber from "bignumber.js";
import { Prisma } from "@xgamefi/db";

// Stellar uses 7 decimal places (stroops). Round half-down deterministically.
const STELLAR_DP = 7;

function toBig(v: Prisma.Decimal): BigNumber {
  return new BigNumber(v.toString());
}

export function feeAmount(gross: Prisma.Decimal, bps: number): Prisma.Decimal {
  const fee = toBig(gross)
    .multipliedBy(bps)
    .dividedBy(10000)
    .decimalPlaces(STELLAR_DP, BigNumber.ROUND_DOWN);
  return new Prisma.Decimal(fee.toFixed());
}

export function netAmount(gross: Prisma.Decimal, bps: number): Prisma.Decimal {
  const net = toBig(gross).minus(toBig(feeAmount(gross, bps)));
  return new Prisma.Decimal(net.decimalPlaces(STELLAR_DP, BigNumber.ROUND_DOWN).toFixed());
}

export function toStellarAmount(v: Prisma.Decimal): string {
  return toBig(v).toFixed(STELLAR_DP);
}

export function fromStellarAmount(s: string): Prisma.Decimal {
  return new Prisma.Decimal(s);
}
