"use client";

import { RainbowKitProvider } from "@rainbow-me/rainbowkit";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { WagmiProvider } from "wagmi";
import { appChain, wagmiConfig } from "../lib/wagmiConfig";

/**
 * Mounts wallet and query providers once so every page can use wagmi hooks safely.
 */
export function Web3Providers({ children }: Readonly<{ children: ReactNode }>) {
  const [queryClient] = useState(() => new QueryClient());
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        {mounted ? <RainbowKitProvider initialChain={appChain}>{children}</RainbowKitProvider> : children}
      </QueryClientProvider>
    </WagmiProvider>
  );
}
