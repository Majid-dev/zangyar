import "server-only";

// Public boundary of the OTP infrastructure layer. The service and the auth
// plugin import from here; provider internals stay private to this folder.
export { generateOtpCode, hashOtpCode, otpExpiry, verifyOtpCode } from "./code";
export { getOtpConfig, redactedOtpSummary, type OtpConfig, type OtpProviderName } from "./config";
export { assertOtpConfigurationSafe, assertOtpProviderAllowed, currentOtpEnvironment, OtpConfigurationError, type OtpEnvironment } from "./environment";
export { OTP_PURPOSES, OTP_PURPOSE_LABELS, isOtpPurpose, type OtpPolicy, type OtpPurpose, type OtpPurposePolicies } from "./purpose";
export type { OtpDeliveryRequest, OtpDeliveryResult, OtpProvider } from "./provider";
export { DevelopmentOtpProvider, RandomOtpProvider } from "./providers/development";
export { selectOtpProvider } from "./selection";
