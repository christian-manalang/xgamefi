import { prisma } from "@xgamefi/db";
import { getPrincipal, requireStudio } from "@/lib/auth";
import { redirect } from "next/navigation";
import { toAdminStudioDto, toApiKeyDto, toWebhookDeliveryDto } from "@xgamefi/shared";
import { StudioSettingsClient } from "./_components/studio-settings-client";

export default async function StudioSettingsPage() {
  const principal = await getPrincipal();
  if (!principal || principal.kind !== "user" || !principal.studioId) redirect("/login");
  const studioId = principal.studioId;

  await requireStudio(studioId);

  const [studio, apiKeys, deliveries] = await Promise.all([
    prisma.studio.findUnique({ where: { id: studioId } }),
    prisma.apiKey.findMany({ where: { studioId }, orderBy: { createdAt: "desc" } }),
    prisma.webhookDelivery.findMany({
      where: { studioId },
      orderBy: { createdAt: "desc" },
      take: 21,
    }),
  ]);

  if (!studio) redirect("/login");

  const hasMoreDeliveries = deliveries.length > 20;
  const deliveryPage = hasMoreDeliveries ? deliveries.slice(0, 20) : deliveries;

  return (
    <StudioSettingsClient
      studio={toAdminStudioDto(studio)}
      apiKeys={apiKeys.map(toApiKeyDto)}
      initialDeliveries={deliveryPage.map(toWebhookDeliveryDto)}
    />
  );
}
