import { appUrl, env } from "../config/env.js";
import { logger } from "../lib/logger.js";

/**
 * Transactional email.
 *
 * Delivery failure never propagates to the caller. A password-reset request
 * whose email bounces must still return the same generic response as one that
 * succeeds, otherwise the response itself discloses whether an account exists.
 * Failures are logged for operators instead.
 */

interface Message {
  to: string;
  subject: string;
  heading: string;
  body: string;
  actionLabel?: string;
  actionUrl?: string;
  footer?: string;
}

/**
 * The transactional messages below compose their own fixed copy, so nothing
 * needs escaping. Announcements carry operator-authored text into the same
 * template, and an operator is not a reason to ship unescaped markup into
 * someone's mail client.
 */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function render({ heading, body, actionLabel, actionUrl, footer }: Message): string {
  const button = actionLabel && actionUrl
    ? `<p style="margin:32px 0"><a href="${actionUrl}" style="background:#18181b;color:#fff;padding:12px 22px;border-radius:8px;text-decoration:none;font-size:14px;display:inline-block">${actionLabel}</a></p>
       <p style="color:#71717a;font-size:12px;line-height:20px">If the button does not work, paste this address into your browser:<br><span style="color:#3f3f46;word-break:break-all">${actionUrl}</span></p>`
    : "";
  return `<!doctype html><html><body style="margin:0;background:#fafafa;font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,sans-serif">
  <div style="max-width:520px;margin:0 auto;padding:40px 24px">
    <p style="font-size:15px;font-weight:600;color:#18181b;margin:0 0 32px">Orbit+</p>
    <h1 style="font-size:20px;color:#18181b;margin:0 0 12px">${heading}</h1>
    <p style="color:#3f3f46;font-size:14px;line-height:22px;margin:0">${body}</p>
    ${button}
    ${footer ? `<p style="color:#a1a1aa;font-size:12px;line-height:20px;border-top:1px solid #e4e4e7;padding-top:20px;margin-top:32px">${footer}</p>` : ""}
  </div></body></html>`;
}

async function deliver(message: Message): Promise<void> {
  if (!env.RESEND_API_KEY) {
    // Development transport: the link is printed so the flow is testable
    // end to end without configuring a provider.
    logger.info(
      `[email:dev] to=${message.to} subject=${JSON.stringify(message.subject)}` +
      (message.actionUrl ? `\n[email:dev] link=${message.actionUrl}` : ""),
    );
    return;
  }
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.RESEND_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      from: env.EMAIL_FROM,
      to: [message.to],
      subject: message.subject,
      html: render(message),
    }),
  });
  if (!response.ok) {
    throw new Error(`Resend responded ${response.status}: ${await response.text().catch(() => "")}`);
  }
}

async function send(message: Message): Promise<void> {
  try {
    await deliver(message);
  } catch (error) {
    logger.error("Email delivery failed", {
      to: message.to,
      subject: message.subject,
      error: error instanceof Error ? error.message : error,
    });
  }
}

export async function sendPasswordResetEmail(to: string, token: string, ttlMinutes: number): Promise<void> {
  await send({
    to,
    subject: "Reset your Orbit+ password",
    heading: "Reset your password",
    body: `We received a request to reset the password for this account. This link expires in ${ttlMinutes} minutes and can be used once.`,
    actionLabel: "Choose a new password",
    actionUrl: `${appUrl}/reset-password?token=${encodeURIComponent(token)}`,
    footer: "If you did not request this, no action is needed and your password stays unchanged.",
  });
}

export async function sendVerificationEmail(to: string, token: string, ttlHours: number): Promise<void> {
  await send({
    to,
    subject: "Confirm your Orbit+ email address",
    heading: "Confirm your email",
    body: `Confirm this address to finish setting up your workspace. This link expires in ${ttlHours} hours.`,
    actionLabel: "Confirm email address",
    actionUrl: `${appUrl}/verify-email?token=${encodeURIComponent(token)}`,
  });
}

export async function sendPasswordChangedEmail(to: string): Promise<void> {
  await send({
    to,
    subject: "Your Orbit+ password was changed",
    heading: "Your password was changed",
    body: "The password for your account was just changed and all other active sessions were signed out.",
    footer: "If this was not you, reset your password immediately and review your active sessions.",
  });
}

/**
 * A published announcement, by email.
 *
 * Unlike the transactional messages above, this one lets delivery failure
 * propagate. A bounce here is not a security signal to be swallowed; it is an
 * outcome the operator needs recorded against the recipient, so the caller
 * catches it and writes it down.
 */
export async function sendAnnouncementEmail(input: {
  to: string;
  title: string;
  body: string;
  actionLabel?: string | null;
  actionUrl?: string | null;
}): Promise<void> {
  await deliver({
    to: input.to,
    // The subject is a header, not markup, so it carries the raw title.
    subject: input.title,
    heading: escapeHtml(input.title),
    body: escapeHtml(input.body).replace(/\n/g, "<br>"),
    ...(input.actionLabel && input.actionUrl
      ? {
          actionLabel: escapeHtml(input.actionLabel),
          // Inside an href, so quotes are what would break out of the
          // attribute. encodeURI leaves an already-valid URL intact.
          actionUrl: encodeURI(input.actionUrl),
        }
      : {}),
    footer: `You are receiving this because you have an Orbit+ account. <a href="${appUrl}/workspace/settings/profile">Manage announcement email</a>.`,
  });
}
