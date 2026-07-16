import "server-only";
import { Resend } from "resend";

/**
 * Email transport. With RESEND_API_KEY set, sends via Resend; without it
 * (local dev), logs the message to the console so flows stay testable.
 */

const FROM = process.env.EMAIL_FROM ?? "Alpha Workspace <onboarding@resend.dev>";

let resend: Resend | null = null;
function client(): Resend | null {
  if (!process.env.RESEND_API_KEY) return null;
  resend ??= new Resend(process.env.RESEND_API_KEY);
  return resend;
}

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export async function sendEmail(input: SendEmailInput): Promise<"sent" | "logged"> {
  const c = client();
  if (!c) {
    console.info(
      `[email:dev] to=${input.to} subject="${input.subject}"\n${input.text ?? input.html}`,
    );
    return "logged";
  }
  const { error } = await c.emails.send({
    from: FROM,
    to: input.to,
    subject: input.subject,
    html: input.html,
    text: input.text,
  });
  if (error) throw new Error(`resend: ${error.message}`);
  return "sent";
}
