import Link from "next/link";
import { Logo } from "@/components/ui/logo";
import { ForceLight } from "@/components/marketing/force-light";
import { NavCta } from "@/components/marketing/nav-cta";

export default function MarketingLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="min-h-dvh">
      <ForceLight />
      {/* Sticky so the CTA travels with the reader; translucent solid, not
          backdrop-blur, which repaints every scrolled frame on weak GPUs. */}
      <header className="sticky top-0 z-40 border-b border-line/60 bg-bg/95">
        <div className="mx-auto flex h-[4.5rem] w-full max-w-5xl items-center gap-3 px-4 sm:px-5 md:px-8">
        <Link href="/" className="press flex min-w-0 items-center gap-2.5" aria-label="Alpha Workspace home">
          <Logo size="md" />
        </Link>
        <nav className="ml-auto flex shrink-0 items-center gap-1 sm:gap-2">
          <Link
            href="/pricing"
            className="press hidden rounded-control px-3 py-2 text-sm text-muted hover:bg-raised hover:text-ink sm:block"
          >
            Pricing
          </Link>
          <Link
            href="/privacy"
            className="press hidden rounded-control px-3 py-2 text-sm text-muted hover:bg-raised hover:text-ink sm:block"
          >
            Privacy
          </Link>
          <NavCta />
        </nav>
        </div>
      </header>

      <main>{children}</main>

      <footer className="border-t border-dashed border-line-strong">
        <div className="mx-auto w-full max-w-5xl px-5 py-10 md:px-8">
          <p className="max-w-2xl text-sm text-muted">
            <span className="font-semibold text-ink">Alpha Workspace</span>{" "}
            is the project and work-management app for small teams that are
            done chasing status. It follows up on work so people don&apos;t
            have to: status reports itself, tasks cost nothing to create, and
            it keeps working when the connection doesn&apos;t.
          </p>
          <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-center">
            <div className="flex items-center gap-2">
              <Logo size="sm" />
            </div>
            <p className="text-sm text-faint sm:ml-2">
              Made in South Africa, for South African teams.
            </p>
            {/* Support has to be reachable from every marketing page: it is
                the address both stores check, and the only published way to
                reach a person. flex-wrap so five links still fit at 360px. */}
            <nav className="flex flex-wrap gap-x-4 gap-y-2 text-sm text-muted sm:ml-auto">
              <Link href="/pricing" className="hover:text-ink">
                Pricing
              </Link>
              <Link href="/support" className="hover:text-ink">
                Support
              </Link>
              <Link href="/privacy" className="hover:text-ink">
                Privacy &amp; POPIA
              </Link>
              <Link href="/sign-in" className="hover:text-ink">
                Sign in
              </Link>
            </nav>
          </div>
        </div>
      </footer>
    </div>
  );
}
