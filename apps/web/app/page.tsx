import { redirect } from "next/navigation";
import { getPrincipal } from "../lib/auth/guards";

export default async function Home() {
  const principal = await getPrincipal();
  if (!principal) redirect("/login");

  return (
    <main className="min-h-screen flex items-center justify-center">
      <h1 className="font-mono uppercase tracking-[0.1em] text-primary-fixed">
        xGameFi · SYSTEM STATUS: NOMINAL
      </h1>
    </main>
  );
}
