export const dynamic = "force-dynamic";

import { Navbar } from "@/components/layout/Navbar";
import { MobileNav } from "@/components/layout/MobileNav";
import { ProfileCompletenessBanner } from "@/components/layout/ProfileCompletenessBanner";
import { FirstLoginTour } from "@/components/layout/FirstLoginTour";

export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col min-h-dvh">
      <Navbar />
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 py-4 pb-20 md:pb-4 space-y-3">
        <ProfileCompletenessBanner />
        {children}
      </main>
      <MobileNav />
      <FirstLoginTour />
    </div>
  );
}
