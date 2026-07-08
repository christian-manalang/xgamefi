import { getPublishedShops } from "@/lib/catalogue-queries";

export async function GET(): Promise<Response> {
  const shops = await getPublishedShops();
  return Response.json({ shops }, { status: 200 });
}
