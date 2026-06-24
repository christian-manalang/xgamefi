import { redirect } from "next/navigation";
import { getPrincipal } from "../../../lib/auth/guards";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  const principal = await getPrincipal();
  if (principal?.kind === "user") redirect(principal.role === "ADMIN" ? "/admin" : "/dashboard");

  return (
    <main className="min-h-screen flex items-center justify-center bg-background px-margin-mobile">
      <section className="w-full max-w-md border-2 border-outline-variant bg-surface-container-low p-8">
        <h1 className="font-display text-2xl font-semibold italic text-on-surface mb-1">xGameFi</h1>
        <p className="font-mono text-xs uppercase tracking-[0.1em] text-primary-fixed mb-8">Operator access</p>
        <LoginForm />
      </section>
    </main>
  );
}
