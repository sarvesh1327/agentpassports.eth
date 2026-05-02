"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useAccount, useEnsName } from "wagmi";
import { WalletConnection } from "./WalletConnection";
import { AgentPassportsLogo, UiIcon } from "./icons/UiIcons";

/**
 * Provides the compact product navigation shared by the frontend pages.
 * Dashboard/Register are wallet-gated while disconnected so users meet the
 * owner-wallet requirement before entering those app routes.
 */
export function SiteHeader() {
  const pathname = usePathname();
  const [queryOwnerName, setQueryOwnerName] = useState<string | null>(null);
  const [walletUiMounted, setWalletUiMounted] = useState(false);
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
      : null;

  useEffect(() => {
    setWalletUiMounted(true);
    setQueryOwnerName(new URLSearchParams(window.location.search).get("owner")?.trim().toLowerCase() ?? null);
  }, [pathname]);

  return (
    <header className="site-header">
      <Link className="site-header__brand" href="/">
        <AgentPassportsLogo className="site-header__logo" size={36} title="AgentPassports" />
        <span>
          AgentPassports.eth
          <small>Agent permission manager</small>
        </span>
      </Link>
      {!walletUiMounted ? (
        <nav className="site-header__nav" aria-label="Primary navigation">
          <WalletGatedHeaderLink
            active={activeSection === "dashboard"}
            connected={false}
            data-wallet-gated="dashboard"
            href={dashboardHref}
            label="Dashboard"
          />
          <WalletGatedHeaderLink
            active={activeSection === "register"}
            connected={false}
            data-wallet-gated="register"
            href={registerHref}
            label="Register Agent"
          />
          <Link href="/mcp">MCP</Link>
          <Link href="https://github.com/sarvesh1327/agentpassports.eth">Docs <UiIcon name="external" size={14} /></Link>
        </nav>
      ) : (
        <ConnectButton.Custom>
          {({ account, chain, mounted, openConnectModal }) => {
            const isConnected = mounted && Boolean(account && chain && address);
            return (
              <nav className="site-header__nav" aria-label="Primary navigation">
                <WalletGatedHeaderLink
                  active={activeSection === "dashboard"}
                  connected={isConnected && Boolean(ownerName)}
                  data-wallet-gated="dashboard"
                  href={dashboardHref}
                  label="Dashboard"
                  onConnect={openConnectModal}
                />
                <WalletGatedHeaderLink
                  active={activeSection === "register"}
                  connected={isConnected}
                  data-wallet-gated="register"
                  href={registerHref}
                  label="Register Agent"
                  onConnect={openConnectModal}
                />
                <Link href="/mcp">MCP</Link>
                <Link href="https://github.com/sarvesh1327/agentpassports.eth">Docs <UiIcon name="external" size={14} /></Link>
              </nav>
            );
          }}
        </ConnectButton.Custom>
      )}
      <WalletConnection />
    </header>
  );
}

function WalletGatedHeaderLink(props: {
  active: boolean;
  connected: boolean;
  "data-wallet-gated": "dashboard" | "register";
  href: string;
  label: string;
  onConnect?: () => void;
}) {
  if (props.connected) {
    return (
      <Link aria-current={props.active ? "page" : undefined} data-wallet-gated={props["data-wallet-gated"]} href={props.href}>
        {props.label}
      </Link>
    );
  }

  return (
    <button
      aria-current={props.active ? "page" : undefined}
      data-wallet-gated={props["data-wallet-gated"]}
      onClick={props.onConnect}
      type="button"
    >
      {props.label}
    </button>
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
