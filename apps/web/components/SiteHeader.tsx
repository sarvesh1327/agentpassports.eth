import Link from "next/link";
import { WalletConnection } from "./WalletConnection";

/**
 * Provides the compact product navigation shared by the frontend pages.
 */
export function SiteHeader() {
  return (
    <header className="site-header">
      <Link className="site-header__brand" href="/">
        AgentPassports.eth
      </Link>
      <nav className="site-header__nav" aria-label="Primary navigation">
        <Link href="/register">Register</Link>
        <Link href="/run">Run</Link>
        <Link href="/revoke">Revoke</Link>
      </nav>
      <WalletConnection />
    </header>
  );
}
