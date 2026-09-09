export const CURRENT_BUILD_VERSION =
  process.env.NEXT_PUBLIC_BUILD_VERSION ?? "development";

const VERSION_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

export function parseBuildVersion(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;

  const version = (payload as { version?: unknown }).version;
  if (typeof version !== "string") return null;

  const normalized = version.trim();
  return VERSION_PATTERN.test(normalized) ? normalized : null;
}

export function isNewDeployment(
  loadedVersion: string,
  serverVersion: string | null,
): boolean {
  return Boolean(serverVersion && loadedVersion !== serverVersion);
}

export function canAutoReload(
  refreshBlocked: boolean,
  alreadyAttemptedVersion: string | null,
  serverVersion: string,
): boolean {
  return !refreshBlocked && alreadyAttemptedVersion !== serverVersion;
}
