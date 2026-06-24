import { SideRail } from "./_components/SideRail";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <SideRail />
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  );
}
