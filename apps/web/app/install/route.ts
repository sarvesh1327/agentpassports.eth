import { readFile } from "node:fs/promises";
import path from "node:path";

export const runtime = "nodejs";

export async function GET() {
  const candidates = [
    path.join(process.cwd(), "scripts", "install-agentpassports.sh"),
    path.join(process.cwd(), "..", "..", "scripts", "install-agentpassports.sh"),
    path.join(process.cwd(), "..", "..", "..", "scripts", "install-agentpassports.sh")
  ];
  let script: string | null = null;

  for (const candidate of candidates) {
    try {
      script = await readFile(candidate, "utf8");
      break;
    } catch {
      // Try the next monorepo/root candidate.
    }
  }

  if (!script) {
    return Response.redirect(
      "https://raw.githubusercontent.com/sarvesh1327/agentpassports.eth/main/scripts/install-agentpassports.sh",
      302
    );
  }

  return new Response(script, {
    headers: {
      "Cache-Control": "public, max-age=300",
      "Content-Disposition": "inline; filename=install-agentpassports.sh",
      "Content-Type": "text/x-shellscript; charset=utf-8"
    }
  });
}
