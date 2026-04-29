"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useAccount, useEnsName } from "wagmi";
import { WalletConnection } from "./WalletConnection";
import { AgentPassportsLogo, UiIcon } from "./icons/UiIcons";

/**
 * Provides the compact product navigation shared by the frontend pages.
 */
export function SiteHeader() {
  const pathname = usePathname();
  const [queryOwnerName, setQueryOwnerName] = useState<string | null>(null);
  const { address } = useAccount();
  const connectedEns = useEnsName({ address });
  const connectedOwnerName = connectedEns.data?.trim().toLowerCase() ?? null;
  const ownerName = readOwnerName(pathname, queryOwnerName) ?? connectedOwnerName;
  const dashboardHref = ownerName ? `/owner/${encodeURIComponent(ownerName)}` : "/";
  const registerHref = ownerName ? `/register?owner=${encodeURIComponent(ownerName)}` : "/register";
  const activeSection = pathname.startsWith("/register")
    ? "register"
    : pathname.startsWith("/owner") || pathname.startsWith("/agent")
      ? "dashboard"
      : "dashboard";

  useEffect(() => {
    setQueryOwnerName(new URLSearchParams(window.location.search).get("owner")?.trim().toLowerCase() ?? null);
  }, [pathname]);

  return (
    <header className="site-header">
      <Link className="site-header__brand" href="/">
        <AgentPassportsLogo className="site-header__logo" size={32} title="AgentPassports" />
        agentPassports.eth
      </Link>
      <nav className="site-header__nav" aria-label="Primary navigation">
        <Link aria-current={activeSection === "dashboard" ? "page" : undefined} href={dashboardHref}>Dashboard</Link>
        <Link aria-current={activeSection === "register" ? "page" : undefined} href={registerHref}>Register Agent</Link>
        <Link href="/mcp">MCP</Link>
        <Link href="https://github.com/sarvesh1327/agentpassports.eth">Docs <UiIcon name="external" size={14} /></Link>
      </nav>
      <WalletConnection />
    </header>
  );
}

function readOwnerName(pathname: string, queryOwnerName: string | null): string | null {
  if (queryOwnerName) {
    return queryOwnerName;
  }

  const [, route, encodedName] = pathname.split("/");
  if (!encodedName) {
    return null;
  }

  const decodedName = decodeURIComponent(encodedName).trim().toLowerCase();
  if (route === "owner") {
    return decodedName;
  }

  if (route === "agent") {
    const labels = decodedName.split(".");
    return labels.length > 2 ? labels.slice(1).join(".") : null;
  }

  return null;
}
