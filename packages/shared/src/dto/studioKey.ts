export type ApiKeyDto = {
  id: string;
  keyPrefix: string;
  scopes: string[];
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
};

export function toApiKeyDto(row: {
  id: string;
  keyPrefix: string;
  scopes: string[];
  lastUsedAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
}): ApiKeyDto {
  return {
    id: row.id,
    keyPrefix: row.keyPrefix,
    scopes: row.scopes,
    lastUsedAt: row.lastUsedAt ? row.lastUsedAt.toISOString() : null,
    revokedAt: row.revokedAt ? row.revokedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  };
}
