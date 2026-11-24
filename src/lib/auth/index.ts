import "server-only";

// Authentication configuration lives in ./auth-options so a transaction-bound
// instance can share exactly one definition. This module is the public boundary
// the rest of the application imports.
export {
  authOptions,
  getAuth,
  getAuthForTransaction,
  MOBILE_ACCOUNT_EMAIL_DOMAIN,
  mobileAccountEmail,
} from "./auth-options";
