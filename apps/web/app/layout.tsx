import type { Metadata } from "next";
import type { ReactNode } from "react";
import { SiteHeader } from "../components/SiteHeader";
import { Web3Providers } from "../components/Web3Providers";
import "@rainbow-me/rainbowkit/styles.css";
import "./globals.css";

// Shared app metadata used by Next.js for the current scaffolded routes.
export const metadata: Metadata = {
  title: "AgentPassports.eth",
  description: "Register agents, issue scoped Visas, and revoke access onchain with ENS-native AgentPassports.",
  icons: {
    icon: [
      { url: "/brand/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/brand/agentpassports-logo.png", sizes: "512x512", type: "image/png" }
    ],
    apple: [{ url: "/brand/apple-touch-icon.png", sizes: "180x180", type: "image/png" }]
  }
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <Web3Providers>
          <SiteHeader />
          {children}
        </Web3Providers>
      </body>
    </html>
  );
}
