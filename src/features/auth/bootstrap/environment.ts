/**
 * Environment gate for the demo tenant bootstrap.
 *
 * The seed writes a known demo account with a known password, so it must never
 * be reachable from a production deployment or against a non-local database.
 * Every check here runs *before* the first write, and a refusal leaves the
 * database untouched.
 */
export class DemoSeedEnvironmentError extends Error {
  constructor(
    public readonly code: "NOT_DEVELOPMENT" | "NON_LOCAL_DATABASE" | "MISSING_DATABASE_URL",
    message: string,
  ) {
    super(message);
    this.name = "DemoSeedEnvironmentError";
  }
}

export type DemoSeedEnvironment = {
  nodeEnv: string | undefined;
  databaseUrl: string | undefined;
  /** Test-only escape hatch; ignored in production. */
  allowNonDevelopment?: string | undefined;
};

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

export function databaseHostOf(databaseUrl: string) {
  try {
    return new URL(databaseUrl).hostname;
  } catch {
    return null;
  }
}

/**
 * Returns the host the seed is about to write to, or throws. Callers use the
 * return value only for logging; the authorization decision is the throw.
 */
export function assertDemoSeedAllowed(environment: DemoSeedEnvironment) {
  const nodeEnv = environment.nodeEnv ?? "";

  // Production is refused unconditionally: no flag, variable, or override can
  // enable demo credentials in a production environment.
  if (nodeEnv === "production") {
    throw new DemoSeedEnvironmentError(
      "NOT_DEVELOPMENT",
      "The demo tenant seed is restricted to development and refuses to run in production.",
    );
  }

  const override = environment.allowNonDevelopment === "1";
  if (nodeEnv !== "development" && !override) {
    throw new DemoSeedEnvironmentError(
      "NOT_DEVELOPMENT",
      `The demo tenant seed only runs in development (current NODE_ENV: ${nodeEnv || "unset"}).`,
    );
  }

  if (!environment.databaseUrl) {
    throw new DemoSeedEnvironmentError("MISSING_DATABASE_URL", "DATABASE_URL is required.");
  }

  const host = databaseHostOf(environment.databaseUrl);
  if (host === null) {
    throw new DemoSeedEnvironmentError("MISSING_DATABASE_URL", "DATABASE_URL is not a valid connection URL.");
  }

  if (!LOOPBACK_HOSTS.has(host)) {
    throw new DemoSeedEnvironmentError(
      "NON_LOCAL_DATABASE",
      `The demo tenant seed only writes to a local database (resolved host: ${host}).`,
    );
  }

  return { nodeEnv, host };
}
