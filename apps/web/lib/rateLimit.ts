export { rateLimit } from "./auth/ratelimit";

export const RATE_LIMITED_PATHS = [
  "/api/v1/auth/login",
  "/api/v1/auth/wallet/challenge",
  "/api/v1/auth/wallet/verify",
  "/api/v1/checkout/quote",
  "/api/v1/checkout/submit",
  "/api/v1/p2p/listings",
] as const;
