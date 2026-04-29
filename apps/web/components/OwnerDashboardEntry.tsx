"use client";

import type { FormEvent } from "react";
import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Sends owners into the dashboard-first management flow for their ENS name.
 */
export function OwnerDashboardEntry() {
  const router = useRouter();
  const [ownerName, setOwnerName] = useState("");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedOwnerName = ownerName.trim().toLowerCase();
    if (!normalizedOwnerName) {
      return;
    }

    router.push(`/owner/${encodeURIComponent(normalizedOwnerName)}`);
  }

  return (
    <form className="owner-entry" onSubmit={handleSubmit}>
      <label>
        <span>Owner ENS</span>
        <input
          name="ownerName"
          onChange={(event) => setOwnerName(event.target.value)}
          placeholder="owner.eth"
          value={ownerName}
        />
      </label>
      <button type="submit">Open owner dashboard</button>
    </form>
  );
}
