"use client";
import { Suspense, lazy } from "react";
import { usePathname, useRouter } from "next/navigation";
import Sidebar, { PageId } from "@/components/Sidebar";
import { DashboardProvider, useDashboard } from "@/components/DashboardContext";

// ponytail: lazy-load the heavy AI settings panel (1.1k lines + all provider
// logic) so it does not inflate every page's JS bundle. Skeleton while loading.
const AISettings = lazy(() => import("@/components/AISettings"));
const UserMenu = lazy(() => import("@/components/UserMenu"));

function SettingsSlot() {
  const { aiProvider, aiModel, modelsData, handleProviderChange, refreshModels } = useDashboard();
  return (
    <Suspense fallback={<div className="h-8 w-40 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" />}>
      <AISettings onProviderChange={handleProviderChange} selectedProvider={aiProvider} selectedModel={aiModel} modelsData={modelsData} refreshModels={refreshModels} />
    </Suspense>
  );
}

function InnerLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const activePage = (pathname?.split("/")[1] || "dashboard") as PageId;

  const handleNavigate = (page: PageId) => { router.push(`/${page}`); };

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50 dark:bg-slate-900">
      <Sidebar activePage={activePage} onNavigate={handleNavigate} />
      <main className="flex-1 min-w-0 flex flex-col h-screen pt-[57px] lg:pt-0">
        <header className="sticky top-0 z-30 bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm border-b border-slate-200 dark:border-slate-700 hidden lg:block">
          <div className="flex items-center justify-end gap-3 px-6 lg:px-8 py-3">
            {activePage !== "settings" && <SettingsSlot />}
            <Suspense fallback={<div className="h-8 w-8 animate-pulse rounded-full bg-slate-100 dark:bg-slate-800" />}>
              <UserMenu />
            </Suspense>
          </div>
        </header>
        <div className="lg:hidden sticky top-[57px] z-20 bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm border-b border-slate-200 dark:border-slate-700">
          <div className="flex items-center justify-end gap-2 px-4 py-2">
            {activePage !== "settings" && <SettingsSlot />}
            <Suspense fallback={<div className="h-8 w-8 animate-pulse rounded-full bg-slate-100 dark:bg-slate-800" />}>
              <UserMenu />
            </Suspense>
          </div>
        </div>
        <div className={`flex-1 min-h-0 px-4 sm:px-6 lg:px-8 py-6 lg:py-8 ${activePage === "ticket" ? "overflow-hidden" : "overflow-y-auto"}`}>
          {children}
        </div>
      </main>
    </div>
  );
}

export default function DashboardShell({ children }: { children: React.ReactNode }) {
  return (
    <DashboardProvider>
      <InnerLayout>{children}</InnerLayout>
    </DashboardProvider>
  );
}
