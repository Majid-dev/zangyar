/**
 * LAN origins permitted to reach the development server from another device.
 *
 * Opening the app on a phone over the LAN (e.g. `http://192.168.1.76:3000`) needs
 * the machine's LAN address allowlisted in two independent places, because two
 * different layers reject an unrecognized host and each one fails in a different,
 * confusing way:
 *
 *   - Next.js blocks cross-origin requests to `/_next/*` dev resources, so no
 *     JavaScript loads and the page stays unhydrated: buttons do nothing, and a
 *     submit falls back to a native form GET.
 *   - Better Auth rejects the `Origin` header on state-changing requests, so
 *     sign-out (and sign-in) fail with `403 Invalid origin` even once the page is
 *     interactive.
 *
 * Both are keyed off the same list, so a phone that is allowed to load the app is
 * also allowed to authenticate against it — updating one and forgetting the other
 * produces a half-working page, which is harder to diagnose than a broken one.
 *
 * Subnets are wildcarded rather than a single address pinned, because a DHCP lease
 * change moves the machine's address and a pinned IP silently stops matching.
 *
 * Both consumers apply this in development only: Next.js ignores
 * `allowedDevOrigins` outside its dev server, and the auth config gates on
 * `NODE_ENV`. These origins must never be trusted in production, where trusting an
 * origin is what CSRF protection tests against.
 */
export const DEV_LAN_ORIGINS = ["192.168.1.*", "192.168.100.*"] as const;
