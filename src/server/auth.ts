import "server-only";
import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import ResendProvider from "next-auth/providers/resend";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { db } from "@/server/db";
import {
  accounts,
  sessions,
  users,
  verificationTokens,
} from "@/server/db/schema";
import { sendEmail } from "@/server/email/send";
import { renderEmail } from "@/server/email/layout";

/**
 * Auth.js v5. Magic link (Resend-backed; console fallback without a key via
 * our email transport) + Google. JWT sessions keep the hot path db-free; the
 * adapter stores users/accounts/verification tokens.
 */

const providers = [
  ResendProvider({
    // Delivery goes through our transport, so a missing RESEND_API_KEY logs
    // the link in dev instead of breaking sign-in.
    apiKey: process.env.RESEND_API_KEY ?? "unused-when-overridden",
    from: process.env.EMAIL_FROM ?? "Alpha Workspace <onboarding@resend.dev>",
    maxAge: 24 * 60 * 60,
    async sendVerificationRequest({ identifier, url }) {
      await sendEmail({
        to: identifier,
        subject: "Your Alpha Workspace sign-in link",
        html: renderEmail({
          heading: "Sign in to Alpha Workspace",
          bodyHtml:
            '<p style="margin:0;">Tap the button and you\'re in. This link works once and expires in 24 hours.</p>',
          cta: { label: "Sign in", url },
          footnote: "Didn't request this? You can safely ignore it.",
        }),
        text: `Sign in to Alpha Workspace: ${url}`,
      });
    },
  }),
  ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
    ? [
        Google({
          // Both providers verify email ownership, so linking by email is
          // the friendly behaviour for small teams.
          allowDangerousEmailAccountLinking: true,
        }),
      ]
    : []),
];

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  session: { strategy: "jwt", maxAge: 30 * 24 * 60 * 60 },
  secret:
    process.env.AUTH_SECRET ??
    (process.env.NODE_ENV !== "production" ? "dev-only-secret" : undefined),
  trustHost: true,
  pages: {
    signIn: "/sign-in",
    verifyRequest: "/sign-in/check-email",
    error: "/sign-in",
  },
  providers,
  callbacks: {
    jwt({ token, user }) {
      if (user?.id) token.sub = user.id;
      return token;
    },
    session({ session, token }) {
      if (token.sub) session.user.id = token.sub;
      return session;
    },
  },
});

export const googleEnabled = Boolean(
  process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET,
);
