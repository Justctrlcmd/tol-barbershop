"use client";

import { useEffect } from "react";
import { toast } from "sonner";

import { isDeploymentRefreshBlocked } from "@/hooks/useDeploymentRefreshGuard";
import {
  canAutoReload,
  CURRENT_BUILD_VERSION,
  isNewDeployment,
  parseBuildVersion,
} from "@/lib/deployment-version";

const INITIAL_CHECK_DELAY_MS = 3_000;
const VERSION_CHECK_INTERVAL_MS = 5 * 60 * 1_000;
const VERSION_CHECK_TIMEOUT_MS = 5_000;
const PENDING_RELOAD_CHECK_MS = 1_000;
const RELOAD_ATTEMPT_KEY = "tol_deployment_reload_version";
const UPDATE_TOAST_ID = "deployment-update-available";

function readReloadAttempt(): string | null {
  try {
    return window.sessionStorage.getItem(RELOAD_ATTEMPT_KEY);
  } catch {
    return null;
  }
}

function rememberReloadAttempt(version: string): void {
  try {
    window.sessionStorage.setItem(RELOAD_ATTEMPT_KEY, version);
  } catch {}
}

function clearReloadAttempt(): void {
  try {
    window.sessionStorage.removeItem(RELOAD_ATTEMPT_KEY);
  } catch {}
}

export function DeploymentVersionChecker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;

    let disposed = false;
    let inFlight: Promise<void> | null = null;
    let pendingVersion: string | null = null;
    let submissionBlockedUntil = 0;
    const activeControllers = new Set<AbortController>();

    const reload = (version: string, userInitiated = false) => {
      const blocked =
        isDeploymentRefreshBlocked() || Date.now() < submissionBlockedUntil;
      const attemptedVersion = readReloadAttempt();

      if (
        !userInitiated &&
        !canAutoReload(blocked, attemptedVersion, version)
      ) {
        pendingVersion = version;
        toast.info("New version available", {
          id: UPDATE_TOAST_ID,
          description: blocked
            ? "Finish your current form, or update when you are ready."
            : "The latest version is ready to load.",
          duration: Infinity,
          action: {
            label: "Update now",
            onClick: () => reload(version, true),
          },
        });
        return;
      }

      rememberReloadAttempt(version);
      window.location.reload();
    };

    const checkVersion = () => {
      if (disposed || inFlight) return inFlight;

      const controller = new AbortController();
      activeControllers.add(controller);
      const timeoutId = window.setTimeout(
        () => controller.abort(),
        VERSION_CHECK_TIMEOUT_MS,
      );

      inFlight = fetch("/version", {
        cache: "no-store",
        headers: { Accept: "application/json" },
        signal: controller.signal,
      })
        .then(async (response) => {
          if (!response.ok || disposed) return;

          const serverVersion = parseBuildVersion(await response.json());
          if (!isNewDeployment(CURRENT_BUILD_VERSION, serverVersion)) {
            if (serverVersion === CURRENT_BUILD_VERSION) {
              clearReloadAttempt();
            }
            return;
          }

          reload(serverVersion!);
        })
        .catch(() => undefined)
        .finally(() => {
          window.clearTimeout(timeoutId);
          activeControllers.delete(controller);
          inFlight = null;
        });

      return inFlight;
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") void checkVersion();
    };
    const handleFocus = () => void checkVersion();
    const handleSubmit = () => {
      submissionBlockedUntil = Date.now() + 30_000;
    };

    const initialCheckId = window.setTimeout(
      () => void checkVersion(),
      INITIAL_CHECK_DELAY_MS,
    );
    const intervalId = window.setInterval(
      () => void checkVersion(),
      VERSION_CHECK_INTERVAL_MS,
    );
    const pendingReloadId = window.setInterval(() => {
      if (pendingVersion && !isDeploymentRefreshBlocked()) {
        reload(pendingVersion);
      }
    }, PENDING_RELOAD_CHECK_MS);

    document.addEventListener("visibilitychange", handleVisibilityChange);
    document.addEventListener("submit", handleSubmit, true);
    window.addEventListener("focus", handleFocus);

    return () => {
      disposed = true;
      window.clearTimeout(initialCheckId);
      window.clearInterval(intervalId);
      window.clearInterval(pendingReloadId);
      activeControllers.forEach((controller) => controller.abort());
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      document.removeEventListener("submit", handleSubmit, true);
      window.removeEventListener("focus", handleFocus);
    };
  }, []);

  return null;
}
