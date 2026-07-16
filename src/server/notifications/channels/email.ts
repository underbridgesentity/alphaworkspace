/**
 * Email channel (Resend). The fallback nudge and digest carrier — never the
 * firehose. Type-specific templates keep messages short and human.
 */
import { sendEmail } from "@/server/email/send";
import { escapeHtml, renderEmail } from "@/server/email/layout";
import type { ChannelAdapter } from "./index";

const APP_URL = () => process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

export const emailChannel: ChannelAdapter = {
  async send(_db, user, input) {
    const { title, body, url } = input.payload;
    const link = url ? new URL(url, APP_URL()).toString() : APP_URL();

    const subject = title;
    const html = renderEmail({
      heading: title,
      bodyHtml: body
        ? `<p style="margin:0;">${escapeHtml(String(body)).replace(/\n/g, "<br/>")}</p>`
        : "<p style=\"margin:0;\">Open Alpha for the details.</p>",
      cta: { label: "Open in Alpha", url: link },
      footnote:
        "You're getting this because it needs you. Tune notifications in Alpha → Settings → Notifications.",
    });

    const outcome = await sendEmail({
      to: user.email,
      subject,
      html,
      text: `${title}\n\n${body ?? ""}\n\n${link}`,
    });
    return outcome;
  },
};
