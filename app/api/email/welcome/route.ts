import { NextRequest, NextResponse } from "next/server";
import { sendWelcomeEmail } from "@/lib/email";

export const runtime = "nodejs";

// Called client-side (fire-and-forget) immediately after a group is created.
// Auth is implicit — we trust the payload since group creation already succeeded.
export async function POST(request: NextRequest) {
  try {
    const { to, adminName, groupName, trialEndsAt } = await request.json();
    if (!to || !adminName || !groupName || !trialEndsAt) {
      return NextResponse.json({ error: "Missing fields." }, { status: 400 });
    }
    await sendWelcomeEmail({
      to,
      adminName,
      groupName,
      trialEndsAt: new Date(trialEndsAt),
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[email/welcome]", err);
    return NextResponse.json({ ok: false });
  }
}
