import type { Metadata } from "next";
import { MailCheck } from "lucide-react";

export const metadata: Metadata = { title: "Check your email" };

export default function CheckEmailPage() {
  return (
    <div className="text-center">
      <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-accent-soft">
        <MailCheck className="size-6 text-accent" aria-hidden />
      </div>
      <h1 className="mt-4 text-2xl font-semibold tracking-tight">
        Check your email
      </h1>
      <p className="mt-2 text-muted">
        Your sign-in link is on its way. It works once and expires in 24
        hours — the tab can be closed.
      </p>
      {process.env.NODE_ENV !== "production" && !process.env.RESEND_API_KEY && (
        <p className="mt-4 rounded-control bg-raised px-3.5 py-2.5 text-sm text-faint">
          Dev mode without RESEND_API_KEY: the link was printed to the server
          console.
        </p>
      )}
    </div>
  );
}
