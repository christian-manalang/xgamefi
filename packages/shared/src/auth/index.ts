export * from "./tokens";
export * from "./wallet";
export * from "./csrf";
export * from "./ratelimit-keys";

// THE canonical Principal type (canonical-interfaces §Auth).
export type Principal =
  | { kind: "user"; userId: string; role: "ADMIN" | "STUDIO_OWNER" | "STUDIO_MEMBER"; studioId?: string }
  | { kind: "player"; playerId: string; walletAddress: string };
