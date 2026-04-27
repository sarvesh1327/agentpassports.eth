import type { Metadata } from "next";
import type { ReactNode } from "react";
import { SiteHeader } from "../components/SiteHeader";
import "./globals.css";

// Shared app metadata used by Next.js for the current scaffolded routes.
export const metadata: Metadata = {
  title: "AgentPassport.eth",
  description: "ENS-native identity and sponsored execution for onchain agents"
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <SiteHeader />
        {children}
      </body>
    </html>
  );
}
