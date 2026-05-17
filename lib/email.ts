import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM = "GolfCaddy <hello@golfcaddy.club>";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://golfcaddy.club";

// ─── Welcome (on group creation) ─────────────────────────────────────────────

export async function sendWelcomeEmail({
  to,
  adminName,
  groupName,
  trialEndsAt,
}: {
  to: string;
  adminName: string;
  groupName: string;
  trialEndsAt: Date;
}) {
  const endsOn = new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(trialEndsAt);

  await resend.emails.send({
    from: FROM,
    to,
    subject: `Welcome to GolfCaddy — ${groupName} is ready to go`,
    html: buildEmail({
      preheader: `Your group is set up and your 30-day free trial has started. Let's get a round on the books.`,
      heading: `Welcome to GolfCaddy ⛳`,
      body: `Hi ${adminName},<br><br>
<strong>${groupName}</strong> is all set up and your 30-day free trial has started. You've got until <strong>${endsOn}</strong> to explore everything GolfCaddy has to offer.<br><br>
Here's what to do first:<br>
• Invite your crew — share your group link so members can join<br>
• Create your first round — set the course, date, and format<br>
• Set up your season — handicaps and leaderboards update automatically after every round<br><br>
Any questions? Just reply to this email — we're happy to help.`,
      ctaLabel: "Go to GolfCaddy",
      ctaUrl: `${APP_URL}/home`,
      footer: "You're receiving this because you created a GolfCaddy group.",
    }),
  });
}

// ─── Payment Confirmed ────────────────────────────────────────────────────────

export async function sendPaymentConfirmedEmail({
  to,
  adminName,
  groupName,
  planName,
}: {
  to: string;
  adminName: string;
  groupName: string;
  planName: string;
}) {
  await resend.emails.send({
    from: FROM,
    to,
    subject: `You're subscribed — welcome to GolfCaddy ${planName}`,
    html: buildEmail({
      preheader: `Payment confirmed. ${groupName} is now on the ${planName} plan.`,
      heading: "You're all set",
      body: `Hi ${adminName},<br><br>
Payment confirmed — <strong>${groupName}</strong> is now on the <strong>${planName}</strong> plan. Full access is restored and your rounds, leaderboards, and history are right where you left them.<br><br>
You can manage your subscription, update payment details, or download invoices any time from your billing portal.`,
      ctaLabel: "Manage billing",
      ctaUrl: `${APP_URL}/admin/settings/billing`,
      footer: "You're receiving this because you're the admin of a GolfCaddy group.",
    }),
  });
}

// ─── Payment Failed ───────────────────────────────────────────────────────────

export async function sendPaymentFailedEmail({
  to,
  adminName,
  groupName,
}: {
  to: string;
  adminName: string;
  groupName: string;
}) {
  await resend.emails.send({
    from: FROM,
    to,
    subject: `Action needed — payment failed for ${groupName}`,
    html: buildEmail({
      preheader: `We couldn't process your payment. Update your details to keep access.`,
      heading: "Payment failed",
      body: `Hi ${adminName},<br><br>
We weren't able to process the payment for <strong>${groupName}</strong>. This can happen when a card expires or has insufficient funds.<br><br>
Your group still has access for now, but if the payment isn't resolved soon your account will be suspended. Update your payment details to keep everything running smoothly.`,
      ctaLabel: "Update payment details",
      ctaUrl: `${APP_URL}/admin/settings/billing`,
      footer: "You're receiving this because you're the admin of a GolfCaddy group.",
    }),
  });
}

// ─── Trial Warning (7 days before expiry) ────────────────────────────────────

export async function sendTrialWarningEmail({
  to,
  adminName,
  groupName,
  trialEndsAt,
}: {
  to: string;
  adminName: string;
  groupName: string;
  trialEndsAt: Date;
}) {
  const daysLeft = Math.ceil((trialEndsAt.getTime() - Date.now()) / 86_400_000);
  const endsOn = new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(trialEndsAt);

  await resend.emails.send({
    from: FROM,
    to,
    subject: `Your GolfCaddy trial ends in ${daysLeft} day${daysLeft !== 1 ? "s" : ""}`,
    html: buildEmail({
      preheader: `Your ${groupName} trial ends on ${endsOn} — pick a plan to keep going.`,
      heading: `Your trial ends in ${daysLeft} day${daysLeft !== 1 ? "s" : ""}`,
      body: `Hi ${adminName},<br><br>
Just a heads-up — your free GolfCaddy trial for <strong>${groupName}</strong> ends on <strong>${endsOn}</strong>.<br><br>
Your rounds, leaderboards, handicaps, and history will all be waiting for you. Choose a plan before your trial ends so your crew doesn't miss a beat.`,
      ctaLabel: "Choose a plan",
      ctaUrl: `${APP_URL}/subscription`,
      footer: "You're receiving this because you're the admin of a GolfCaddy group on trial.",
    }),
  });
}

// ─── Trial Expired ────────────────────────────────────────────────────────────

export async function sendTrialExpiredEmail({
  to,
  adminName,
  groupName,
}: {
  to: string;
  adminName: string;
  groupName: string;
}) {
  await resend.emails.send({
    from: FROM,
    to,
    subject: `Your GolfCaddy trial has ended`,
    html: buildEmail({
      preheader: `Your ${groupName} trial has ended — your data is safe, pick a plan to restore access.`,
      heading: "Your free trial has ended",
      body: `Hi ${adminName},<br><br>
Your GolfCaddy trial for <strong>${groupName}</strong> has now ended.<br><br>
The good news: your rounds, leaderboards, handicaps, and history are all safe and waiting for you. Pick a plan below to restore access and keep the round going.`,
      ctaLabel: "Restore access",
      ctaUrl: `${APP_URL}/subscription`,
      footer: "You're receiving this because you're the admin of a GolfCaddy group whose trial has ended.",
    }),
  });
}

// ─── Email builder ────────────────────────────────────────────────────────────

function buildEmail({
  preheader,
  heading,
  body,
  ctaLabel,
  ctaUrl,
  footer,
}: {
  preheader: string;
  heading: string;
  body: string;
  ctaLabel: string;
  ctaUrl: string;
  footer: string;
}) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${heading}</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <!-- Preheader (hidden preview text) -->
  <div style="display:none;max-height:0;overflow:hidden;color:#f4f4f5;font-size:1px;">${preheader}</div>

  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;">

          <!-- Logo / wordmark -->
          <tr>
            <td align="center" style="padding-bottom:24px;">
              <span style="font-size:28px;">⛳</span>
              <span style="display:block;font-size:18px;font-weight:700;color:#15803d;letter-spacing:-0.5px;margin-top:4px;">GolfCaddy</span>
            </td>
          </tr>

          <!-- Card -->
          <tr>
            <td style="background:#ffffff;border-radius:16px;padding:36px 32px;box-shadow:0 1px 4px rgba(0,0,0,0.06);">

              <h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#111827;line-height:1.3;">${heading}</h1>

              <p style="margin:0 0 28px;font-size:15px;color:#4b5563;line-height:1.6;">${body}</p>

              <!-- CTA -->
              <table cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
                <tr>
                  <td style="background:#16a34a;border-radius:10px;">
                    <a href="${ctaUrl}" style="display:inline-block;padding:13px 28px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;">${ctaLabel} →</a>
                  </td>
                </tr>
              </table>

              <p style="margin:0;font-size:13px;color:#9ca3af;">
                Or paste this link into your browser:<br>
                <a href="${ctaUrl}" style="color:#16a34a;word-break:break-all;">${ctaUrl}</a>
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:20px 8px 0;text-align:center;">
              <p style="margin:0;font-size:12px;color:#9ca3af;line-height:1.6;">${footer}<br>
              Questions? Reply to this email or contact us at <a href="mailto:hello@golfcaddy.club" style="color:#6b7280;">hello@golfcaddy.club</a></p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
