import { redirect } from "next/navigation";

/**
 * Entry point. Authenticated visitors go to the dashboard; everyone else is
 * sent to the mobile-number login surface rather than a marketing page.
 */
export default function Home() {
  redirect("/dashboard");
}
