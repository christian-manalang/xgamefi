import { SideRail } from "./_components/SideRail";
import { LogoutButton } from "./_components/logout-button";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <SideRail />
      <div className="flex flex-col flex-1 overflow-hidden">
        <div className="flex justify-end p-4 border-b-2 border-outline-variant">
          <LogoutButton />
        </div>
        <main className="flex-1 overflow-auto p-8">{children}</main>
      </div>
    </div>
  );
}
