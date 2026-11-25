import type { Metadata, Viewport } from "next";
import { Vazirmatn } from "next/font/google";

import "./globals.css";

const vazirmatn = Vazirmatn({
  subsets: ["arabic"],
  variable: "--font-vazirmatn",
});

export const metadata: Metadata = {
  title: "زنگ‌یار | مدرسه در جریان، خانواده در کنار",
  description: "مدیریت مدرسه، حضور و غیاب و ارتباط با خانواده‌ها",
  applicationName: "زنگ‌یار",
  manifest: "/manifest.webmanifest",
  // The tab icon and the iOS home-screen icon are file conventions under this
  // directory (`favicon.ico`, `apple-icon.png`), so Next derives their tags from
  // the files rather than from entries here.
  openGraph: {
    type: "website",
    siteName: "زنگ‌یار",
    locale: "fa_IR",
    title: "زنگ‌یار | مدرسه در جریان، خانواده در کنار",
    description: "مدیریت مدرسه، حضور و غیاب و ارتباط با خانواده‌ها",
    images: [{ url: "/logo/zangyar-icon-512x512.png", width: 512, height: 512, alt: "زنگ‌یار" }],
  },
};

/**
 * The browser chrome colour, so a mobile browser tints to the app's own navy
 * rather than to white.
 */
export const viewport: Viewport = {
  themeColor: "#173b57",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fa" dir="rtl" className={vazirmatn.variable}>
      <body>{children}</body>
    </html>
  );
}
