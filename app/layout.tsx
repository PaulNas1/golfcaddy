import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { AuthProvider } from "@/contexts/AuthContext";
import DevServiceWorkerCleanup from "@/components/DevServiceWorkerCleanup";
import PushNotificationsManager from "@/components/PushNotificationsManager";

const geist = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist",
  weight: "100 900",
  display: "swap",
});

const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
  display: "swap",
});

export const metadata: Metadata = {
  title: "GolfCaddy",
  description: "Private golf group competition and community app",
  manifest: process.env.NODE_ENV === "production" ? "/manifest.json" : undefined,
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
      <body className={`${geist.variable} ${geistMono.variable} font-sans antialiased`}>
        <DevServiceWorkerCleanup />
        <AuthProvider>
          <PushNotificationsManager />
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
