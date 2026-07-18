import { api, json, readJson } from "@/server/api-utils";
import { withWorkspace } from "@/server/session";
import { meetingEmailSchema } from "@/lib/validators";
import { getMeeting } from "@/server/dal/meetings";
import { listMembers } from "@/server/dal/workspaces";
import { ForbiddenError, ValidationError, RateLimitError } from "@/server/dal/errors";
import { checkRateLimit } from "@/server/ai/ratelimit";
import { sendEmail } from "@/server/email/send";
import { escapeHtml, renderEmail } from "@/server/email/layout";
import { formatDay } from "@/lib/dates";

const APP_URL = () => process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

/**
 * Email the meeting notes to chosen teammates. Creator-only (sharing the
 * notes is the recorder's call), recipients must be workspace members, and
 * everything user-generated is escaped at this boundary.
 */
export const POST = api(async (req, params) => {
  const ctx = await withWorkspace(params.ws);
  const { memberIds } = await readJson(req, meetingEmailSchema);
  if (!checkRateLimit(`meeting-email:${ctx.userId}`, 5, 60_000)) {
    throw new RateLimitError();
  }

  const meeting = await getMeeting(ctx, params.meetingId);
  if (meeting.createdBy?.id !== ctx.userId) {
    throw new ForbiddenError("Only the person who recorded it can email the notes");
  }
  if (meeting.status !== "ready") {
    throw new ValidationError("Wait for the meeting to finish processing");
  }

  const members = await listMembers(ctx);
  const recipients = members.filter((m) => memberIds.includes(m.id));
  if (recipients.length === 0) {
    throw new ValidationError("Pick at least one teammate");
  }

  const parts: string[] = [];
  if (meeting.summary) {
    parts.push(`<p style="margin:0 0 12px;">${escapeHtml(meeting.summary.tldr)}</p>`);
    if (meeting.summary.decisions.length > 0) {
      parts.push(
        `<p style="margin:16px 0 4px;font-weight:600;color:#0b1215;">Decisions</p><ul style="margin:0;padding-left:18px;">${meeting.summary.decisions
          .map((d) => `<li style="margin:2px 0;">${escapeHtml(d)}</li>`)
          .join("")}</ul>`,
      );
    }
    if (meeting.summary.risks.length > 0) {
      parts.push(
        `<p style="margin:16px 0 4px;font-weight:600;color:#0b1215;">Watch out for</p><ul style="margin:0;padding-left:18px;">${meeting.summary.risks
          .map((r) => `<li style="margin:2px 0;">${escapeHtml(r)}</li>`)
          .join("")}</ul>`,
      );
    }
  } else {
    parts.push(
      `<p style="margin:0 0 12px;">The transcript is ready in Alpha Workspace.</p>`,
    );
  }
  const items = meeting.actionItems.filter((i) => i.status !== "dismissed");
  if (items.length > 0) {
    parts.push(
      `<p style="margin:16px 0 4px;font-weight:600;color:#0b1215;">Action items</p><ul style="margin:0;padding-left:18px;">${items
        .map((i) => {
          const who = i.assigneeName ? ` (${escapeHtml(i.assigneeName)})` : "";
          const due = i.dueDate ? `, due ${escapeHtml(formatDay(i.dueDate))}` : "";
          return `<li style="margin:2px 0;">${escapeHtml(i.title)}${who}${due}</li>`;
        })
        .join("")}</ul>`,
    );
  }

  const html = renderEmail({
    heading: meeting.title,
    bodyHtml: parts.join(""),
    cta: {
      label: "Open the meeting",
      url: `${APP_URL()}/w/${ctx.workspace.slug}/meetings/${meeting.id}`,
    },
    footnote: `Sent by ${escapeHtml(
      meeting.createdBy?.name ?? meeting.createdBy?.email ?? "a teammate",
    )} from ${escapeHtml(ctx.workspace.name)} on Alpha Workspace.`,
  });

  let sent = 0;
  for (const r of recipients) {
    try {
      await sendEmail({
        to: r.email,
        subject: `Meeting notes: ${meeting.title}`,
        html,
      });
      sent++;
    } catch (err) {
      console.error("[meetings] notes email failed", r.email, err);
    }
  }
  if (sent === 0) throw new ValidationError("No emails could be sent. Try again");
  return json({ sent });
});
