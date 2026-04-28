import type { Metadata } from "next";
import type { ReactNode } from "react";
import { SiteHeader } from "../components/SiteHeader";
import { Web3Providers } from "../components/Web3Providers";
import "@rainbow-me/rainbowkit/styles.css";
import "./globals.css";

// Shared app metadata used by Next.js for the current scaffolded routes.
export const metadata: Metadata = {
  title: "AgentPassports.eth",
  description: "ENS-native identity and sponsored execution for onchain agents"
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
