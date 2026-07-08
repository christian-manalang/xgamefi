import { redirect } from "next/navigation";
import { getPrincipal } from "../../../lib/auth/guards";
import { LoginForm } from "./login-form";
import { BrowseShops } from "../../../components/browse-shops";

export default async function LoginPage() {
  const principal = await getPrincipal();
  if (principal?.kind === "user") redirect(principal.role === "ADMIN" ? "/admin" : "/dashboard");

  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-background px-margin-mobile gap-8">
      <section className="w-full max-w-md border-2 border-outline-variant bg-surface-container-low p-8">
        <h1 className="font-display text-2xl font-semibold italic text-on-surface mb-1">xGameFi</h1>
        <p className="font-mono text-xs uppercase tracking-[0.1em] text-primary-fixed mb-8">Operator access</p>
        <LoginForm />
        <p className="mt-6 text-center font-mono text-xs uppercase tracking-[0.1em] text-on-surface-variant">
          Need a studio?{" "}
          <a href="/register" className="text-primary-fixed hover:underline">Create one</a>
        </p>
      </section>
      <BrowseShops />
    </main>
  );
}
