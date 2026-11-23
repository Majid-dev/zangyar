import process from "node:process";

/**
 * Development credential values for the demo tenant bootstrap.
 *
 * These are local-only demo credentials. The seed refuses to run outside a
 * development environment, and nothing here is surfaced by an application
 * route or written to production configuration. Every value can be overridden
 * with an environment variable for a local scenario.
 */
export type DemoSeedConfig = {
  schoolName: string;
  schoolSlug: string;
  schoolPhone: string;
  schoolAddress: string;
  adminName: string;
  adminMobile: string;
  adminPassword: string;
};

const DEFAULTS: DemoSeedConfig = {
  schoolName: "مدرسه نمونه زنگ‌یار",
  schoolSlug: "demo-school",
  schoolPhone: "02112345678",
  schoolAddress: "تهران، خیابان نمونه، پلاک ۱۲",
  adminName: "مدیر مدرسه آزمایشی",
  adminMobile: "09120000000",
  adminPassword: "ZangYar@12345",
};

export function getDemoSeedConfig(env: NodeJS.ProcessEnv = process.env): DemoSeedConfig {
  return {
    schoolName: env.DEMO_SCHOOL_NAME || DEFAULTS.schoolName,
    schoolSlug: env.DEMO_SCHOOL_SLUG || DEFAULTS.schoolSlug,
    schoolPhone: env.DEMO_SCHOOL_PHONE || DEFAULTS.schoolPhone,
    schoolAddress: env.DEMO_SCHOOL_ADDRESS || DEFAULTS.schoolAddress,
    adminName: env.DEMO_ADMIN_NAME || DEFAULTS.adminName,
    adminMobile: env.DEMO_ADMIN_MOBILE || DEFAULTS.adminMobile,
    adminPassword: env.DEMO_ADMIN_PASSWORD || DEFAULTS.adminPassword,
  };
}

/** Summary safe to log and return: the demo password is deliberately absent. */
export function redactedSeedSummary(seedConfig: DemoSeedConfig) {
  return {
    schoolSlug: seedConfig.schoolSlug,
    schoolName: seedConfig.schoolName,
    adminMobile: seedConfig.adminMobile,
    adminName: seedConfig.adminName,
  };
}
