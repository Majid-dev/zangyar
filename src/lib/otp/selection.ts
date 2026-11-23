import "server-only";

import { getOtpConfig, type OtpConfig } from "./config";
import { assertOtpProviderAllowed, currentOtpEnvironment } from "./environment";
import type { OtpProvider } from "./provider";
import { DevelopmentOtpProvider } from "./providers/development";

/**
 * Resolves the configured provider name to a concrete implementation.
 *
 * This is the only place that knows which providers exist, and the only place
 * provider-specific settings (the fixed code, current environment) are read. The
 * OTP service depends on the returned interface alone, which is what allows a
 * real SMS provider to be added later by extending this function — with no change
 * to the service, the activation flow, or the UI.
 *
 * The safety gate runs here, before any provider is constructed.
 */
export function selectOtpProvider(config: OtpConfig = getOtpConfig(), environment = currentOtpEnvironment()): OtpProvider {
  assertOtpProviderAllowed({
    ...environment,
    provider: config.provider,
    fixedCode: config.fixedCode,
    hashSecret: config.hashSecret,
  });

  switch (config.provider) {
    case "development":
      return new DevelopmentOtpProvider(config);
    default:
      // Unreachable: the gate refuses every other name. Kept so a newly added
      // provider name cannot be silently accepted here.
      throw new Error(`Unsupported OTP provider: ${config.provider}`);
  }
}
