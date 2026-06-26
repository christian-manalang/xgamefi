import type { ReactNode } from "react";
import { WalletConnect } from "./_components/wallet-connect";

export default function StorefrontLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b-2 border-outline-variant bg-surface-container-low">
        <div className="container-max mx-auto px-4 py-4 flex items-center justify-between">
          <a href="/" className="font-display text-[24px] font-semibold text-on-surface">
            xGameFi
          </a>
          <WalletConnect />
        </div>
      </header>
      <main className="flex-1">{children}</main>
    </div>
  );
}
