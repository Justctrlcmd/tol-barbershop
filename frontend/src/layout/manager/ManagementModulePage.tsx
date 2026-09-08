"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

type ManagementModuleHeaderActionsContextValue = {
  setHeaderActions: (actions: ReactNode) => void;
};

const ManagementModuleHeaderActionsContext = createContext<ManagementModuleHeaderActionsContextValue | null>(null);

export function useManagementModuleHeaderActions() {
  const context = useContext(ManagementModuleHeaderActionsContext);

  if (!context) {
    throw new Error("useManagementModuleHeaderActions must be used within ManagementModulePage");
  }

  return context;
}

type ManagementModulePageProps = {
  title: string;
  description: string;
  children: ReactNode;
};

export function ManagementModulePage({
  title,
  description,
  children,
}: ManagementModulePageProps) {
  const [headerActions, setHeaderActions] = useState<ReactNode>(null);

  return (
    <ManagementModuleHeaderActionsContext.Provider value={{ setHeaderActions }}>
      <div className="min-h-full w-full bg-slate-100 font-sans">
        <header className="relative flex flex-col gap-4 px-4 pt-4 sm:flex-row sm:items-start sm:justify-between sm:px-6 sm:pt-6">
          <div className="pr-24 sm:pr-0">
            <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">
              {title}
            </h1>
            <p className="mt-1 text-sm text-gray-500">{description}</p>
          </div>
          {headerActions ? <div className="absolute right-4 top-4 flex shrink-0 gap-2 sm:static">{headerActions}</div> : null}
        </header>
        {children}
      </div>
    </ManagementModuleHeaderActionsContext.Provider>
  );
}
