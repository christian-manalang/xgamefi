import { requirePrincipal } from "../../../../../lib/auth/guards";
import { toMeDto } from "@xgamefi/shared/dto/auth";
import { jsonOk, errorToResponse } from "../../../../../lib/http";

export async function GET(_req: Request): Promise<Response> {
  try {
    const principal = await requirePrincipal();
    return jsonOk(toMeDto(principal));
  } catch (e) {
    return errorToResponse(e);
  }
}
