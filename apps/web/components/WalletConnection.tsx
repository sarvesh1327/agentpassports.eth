"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useEffect, useState } from "react";
import { useEnsName } from "wagmi";

/**
 * Renders the wallet entry point without making the server layout a client component.
 * RainbowKit's default account label can stay address-first, so the custom
 * renderer prefers reverse ENS when available and falls back to the wallet label.
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

  return (
    <ConnectButton.Custom>
      {({ account, chain, mounted: rainbowMounted, openAccountModal, openChainModal, openConnectModal }) => {
        const ready = mounted && rainbowMounted;
        if (!ready) {
          return <button className="wallet-placeholder" disabled type="button">Connect wallet</button>;
        }
        if (!account || !chain) {
          return <button className="wallet-placeholder wallet-placeholder--active" onClick={openConnectModal} type="button">Connect wallet</button>;
        }
        return <WalletIdentity address={account.address as `0x${string}`} fallbackName={account.displayName} onAccount={openAccountModal} onChain={openChainModal} />;
      }}
    </ConnectButton.Custom>
  );
}

function WalletIdentity(props: { address: `0x${string}`; fallbackName: string; onAccount: () => void; onChain: () => void }) {
  const ens = useEnsName({ address: props.address });
  const ensName = ens.data ?? null;
  const displayName = ensName ?? props.fallbackName;

  return (
    <div className="wallet-identity" aria-label="Connected wallet">
      <button className="wallet-identity__chain" onClick={props.onChain} type="button">Sepolia</button>
      <button className="wallet-identity__account" onClick={props.onAccount} title={props.address} type="button">
        <span className="wallet-identity__ens">{displayName}</span>
        {ensName ? <span className="wallet-identity__address">{props.fallbackName}</span> : null}
      </button>
    </div>
  );
}
