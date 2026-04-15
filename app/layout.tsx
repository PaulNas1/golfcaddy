import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AuthProvider } from "@/contexts/AuthContext";
import DevServiceWorkerCleanup from "@/components/DevServiceWorkerCleanup";

export const metadata: Metadata = {
  title: "GolfCaddy",
  description: "Private golf group competition and community app",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "GolfCaddy",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#15803d",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="apple-touch-icon" href="/icons/icon-192x192.png" />
      </head>
      <body className="font-sans antialiased">
        {process.env.NODE_ENV === "development" ? <DevServiceWorkerCleanup /> : null}
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
