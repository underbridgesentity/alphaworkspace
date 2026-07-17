/**
 * Minimal branded email shell, consistent with the design language:
 * off-white paper, near-black ink, one burnt-orange action. Inline styles
 * only (email clients). Keep emails short, they are nudges, not surfaces.
 */

const APP_URL = () => process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

export interface EmailLayoutInput {
  heading: string;
  /** Pre-rendered paragraphs/blocks. Escape user content before passing in. */
  bodyHtml: string;
  cta?: { label: string; url: string };
  footnote?: string;
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function renderEmail({ heading, bodyHtml, cta, footnote }: EmailLayoutInput): string {
  return `<!doctype html>
<html>
<body style="margin:0;padding:0;background:#fbfaf2;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fbfaf2;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;">
        <tr><td style="padding:0 8px 20px;">
          <img src="${APP_URL()}/brand/logo-black.png" alt="Alpha Workspace" height="22" style="height:22px;width:auto;border:0;" />
        </td></tr>
        <tr><td style="background:#ffffff;border-radius:14px;padding:32px 32px 28px;font-family:'Instrument Sans','Segoe UI',system-ui,-apple-system,sans-serif;color:#0b1215;">
          <h1 style="margin:0 0 14px;font-size:20px;line-height:1.3;font-weight:600;letter-spacing:-0.01em;">${heading}</h1>
          <div style="font-size:15px;line-height:1.6;color:#3c4a50;">${bodyHtml}</div>
          ${
            cta
              ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:24px;"><tr><td style="border-radius:10px;background:#17685c;">
                   <a href="${cta.url}" style="display:inline-block;padding:11px 22px;font-family:'Instrument Sans','Segoe UI',system-ui,sans-serif;font-size:15px;font-weight:600;color:#fbfaf2;text-decoration:none;border-radius:10px;">${escapeHtml(cta.label)}</a>
                 </td></tr></table>`
              : ""
          }
        </td></tr>
        <tr><td style="padding:18px 8px 0;font-family:'Instrument Sans','Segoe UI',system-ui,sans-serif;font-size:12px;line-height:1.5;color:#8b9aa0;">
          ${footnote ?? "Alpha Workspace, the workspace that does the following up."}
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}
