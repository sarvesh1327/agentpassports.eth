"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useEffect, useState } from "react";

/**
 * Renders the wallet entry point without making the server layout a client component.
 */
export function WalletConnection() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <button className="wallet-placeholder" disabled type="button">
        Connect wallet
      </button>
    );
  }

  return <ConnectButton accountStatus="address" chainStatus="icon" showBalance={false} />;
}
