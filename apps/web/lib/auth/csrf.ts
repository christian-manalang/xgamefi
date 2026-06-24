import { isSameOrigin } from "@xgamefi/shared/auth";
import { env } from "@xgamefi/config/env";
import { AuthError } from "./guards";

export function assertCsrf(req: Request): void {
  const origin = req.headers.get("origin");
  const referer = req.headers.get("referer");
  if (isSameOrigin(origin, env.APP_BASE_URL)) return;
  if (isSameOrigin(referer, env.APP_BASE_URL)) return;
  throw new AuthError(403, "CSRF");
}
