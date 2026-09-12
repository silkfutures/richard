import type { Metadata } from "next";
import "./globals.css";
import RegisterPwa from "./register-pwa";

export const metadata: Metadata = {
  title: "Nathan — Command Centre",
  description: "Projects, priorities and the next right actions.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Command" },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
    apple: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased"><RegisterPwa/>{children}</body>
    </html>
  );
}
