"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { WalletConnection } from "./WalletConnection";
import { AgentPassportsLogo, UiIcon } from "./icons/UiIcons";

/**
 * Provides the compact product navigation shared by the frontend pages.
 */
export function SiteHeader() {
  const pathname = usePathname();
  const [queryOwnerName, setQueryOwnerName] = useState<string | null>(null);
  const ownerName = readOwnerName(pathname, queryOwnerName);
  const dashboardHref = ownerName ? `/owner/${encodeURIComponent(ownerName)}` : "/";
  const registerHref = ownerName ? `/register?owner=${encodeURIComponent(ownerName)}` : "/";
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
        <Link href="/">MCP</Link>
        <Link href="/">Docs <UiIcon name="external" size={14} /></Link>
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
