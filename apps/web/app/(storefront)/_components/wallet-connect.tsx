"use client";

import { useCallback, useEffect, useState } from "react";
import {
  getAddress,
  isConnected,
  requestAccess,
  signMessage,
} from "@stellar/freighter-api";

type MePlayer = {
  kind: "player";
  playerId: string;
  walletAddress: string;
};

function challengeMessage(walletAddress: string, nonce: string): string {
  return `xGameFi login\naddress: ${walletAddress}\nnonce: ${nonce}`;
}

function formatAddress(address: string): string {
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

export function WalletConnect() {
  const [me, setMe] = useState<MePlayer | null>(null);
  const [loading, setLoading] = useState(false);
  const [freighterAvailable, setFreighterAvailable] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchMe = useCallback(async () => {
    try {
      const res = await fetch("/api/v1/auth/me", { credentials: "include" });
      if (!res.ok) {
        setMe(null);
        return;
      }
      const json = (await res.json()) as { data?: MePlayer | { kind: "user" } };
      if (json.data?.kind === "player") {
        setMe(json.data);
      } else {
        setMe(null);
      }
    } catch {
      setMe(null);
    }
  }, []);

  useEffect(() => {
    isConnected()
      .then((r) => setFreighterAvailable(r.isConnected && !r.error))
      .catch(() => setFreighterAvailable(false));
    fetchMe();
  }, [fetchMe]);

  async function handleConnect() {
    setLoading(true);
    setError(null);
    try {
      const access = await requestAccess();
      if (access.error) throw new Error(access.error);

      const addressRes = await getAddress();
      if (addressRes.error) throw new Error(addressRes.error);
      const walletAddress = addressRes.address;
      if (!walletAddress) throw new Error("No wallet address returned");

      const challengeRes = await fetch("/api/v1/auth/wallet/challenge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ walletAddress }),
      });
      if (!challengeRes.ok) {
        const body = await challengeRes.json().catch(() => ({ error: { code: "CHALLENGE_FAILED" } }));
        throw new Error(body.error?.code ?? "Challenge failed");
      }
      const challengeJson = (await challengeRes.json()) as { data: { nonce: string } };
      const { nonce } = challengeJson.data;

      const signed = await signMessage(challengeMessage(walletAddress, nonce), {
        address: walletAddress,
      });
      if ("error" in signed && signed.error) throw new Error(signed.error);

      let signatureBase64: string;
      if (typeof signed.signedMessage === "string") {
        signatureBase64 = signed.signedMessage;
      } else if (signed.signedMessage) {
        signatureBase64 = Buffer.from(signed.signedMessage).toString("base64");
      } else {
        throw new Error("No signature returned");
      }

      const verifyRes = await fetch("/api/v1/auth/wallet/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ walletAddress, signature: signatureBase64 }),
      });
      if (!verifyRes.ok) {
        const body = await verifyRes.json().catch(() => ({ error: { code: "VERIFY_FAILED" } }));
        throw new Error(body.error?.code ?? "Verify failed");
      }

      await fetchMe();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Connect failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleDisconnect() {
    await fetch("/api/v1/auth/logout", {
      method: "POST",
      credentials: "include",
    });
    setMe(null);
  }

  if (!freighterAvailable) {
    return (
      <a
        href="https://www.freighter.app/"
        target="_blank"
        rel="noopener noreferrer"
        className="font-mono uppercase tracking-[0.1em] text-[12px] px-4 py-2 border-2 border-outline-variant text-on-surface-variant hover:border-primary-fixed transition-colors"
      >
        Install Freighter
      </a>
    );
  }

  if (me?.kind === "player") {
    return (
      <div className="flex items-center gap-3">
        <span className="font-mono text-[12px] text-on-surface-variant">
          {formatAddress(me.walletAddress)}
        </span>
        <button
          type="button"
          onClick={handleDisconnect}
          className="font-mono uppercase tracking-[0.1em] text-[12px] px-4 py-2 border-2 border-outline-variant text-on-surface hover:border-primary-fixed transition-colors"
        >
          Disconnect
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3">
      {error ? (
        <span className="text-[12px] text-error" data-testid="wallet-error">
          {error}
        </span>
      ) : null}
      <button
        type="button"
        onClick={handleConnect}
        disabled={loading}
        className="bg-primary-fixed text-on-primary-fixed font-mono uppercase tracking-[0.1em] text-[12px] px-4 py-2 hover:bg-primary-fixed-dim transition-colors disabled:opacity-50"
        data-testid="wallet-connect-button"
      >
        {loading ? "Connecting…" : "Connect Wallet"}
      </button>
    </div>
  );
}
