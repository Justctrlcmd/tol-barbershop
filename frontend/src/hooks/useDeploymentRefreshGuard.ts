"use client";

import { useEffect, useRef } from "react";

const activeGuards = new Set<symbol>();

export function isDeploymentRefreshBlocked(): boolean {
  return activeGuards.size > 0;
}

export function useDeploymentRefreshGuard(blocked: boolean): void {
  const guardId = useRef(Symbol("deployment-refresh-guard"));

  useEffect(() => {
    const id = guardId.current;

    if (blocked) {
      activeGuards.add(id);
    } else {
      activeGuards.delete(id);
    }

    return () => {
      activeGuards.delete(id);
    };
  }, [blocked]);
}
