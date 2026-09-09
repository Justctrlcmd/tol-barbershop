import type { Metadata, Viewport } from "next";
import { Poppins } from "next/font/google";
import Script from "next/script";

import { DeploymentVersionChecker } from "@/components/common/DeploymentVersionChecker";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider } from "@/contexts/AuthContext";
import { RealtimeProvider } from "@/contexts/RealtimeContext";
import { cn } from "@/lib/utils";
import "./globals.css";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#C0392B",
};

const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans",
});

export const metadata: Metadata = {
  title: "TOL Barbershop",
  description: "Premium barbershop experience",
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
  appleWebApp: {
    capable: true,
    title: "TOL Barbershop",
    statusBarStyle: "default",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={cn(poppins.variable, "h-full", "antialiased")}>
      <body className="min-h-dvh flex flex-col bg-background font-sans">
        <Script
          src="/reset-password-url-cleanup.js"
          strategy="beforeInteractive"
        />
        <AuthProvider>
          <RealtimeProvider>
            <DeploymentVersionChecker />
            {children}
          </RealtimeProvider>
        </AuthProvider>
        <Toaster />
      </body>
    </html>
  );
}
