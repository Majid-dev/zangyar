import type { NextConfig } from "next";

import { DEV_LAN_ORIGINS } from "./src/lib/dev-origins";

const nextConfig: NextConfig = {
  /**
   * Hosts allowed to load dev-server resources from a different origin, so the app
   * can be opened on a phone over the LAN. See `src/lib/dev-origins.ts` for why the
   * same list is also applied to the auth config, and why a missing entry leaves the
   * page looking fine but inert.
   *
   * Development only: the dev-resource block this lifts does not run in a
   * production build.
   */
  allowedDevOrigins: [...DEV_LAN_ORIGINS],
};

export default nextConfig;
