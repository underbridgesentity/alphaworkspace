import Link from "next/link";
import { Logo } from "@/components/ui/logo";

function Wordmark({ small = false }: { small?: boolean }) {
  return (
    <span className={small ? "text-sm tracking-tight" : "tracking-tight"}>
      <span className="font-semibold text-ink">Alpha</span>
      <span className="text-muted">Workspace</span>
    </span>
  );
}

export default function MarketingLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex h-16 w-full max-w-5xl items-center gap-6 px-5 md:px-8">
        <Link href="/" className="press flex items-center gap-2" aria-label="Alpha Workspace home">
          <Logo size={24} wordmark={false} />
          <Wordmark />
        </Link>
        <nav className="ml-auto flex items-center gap-1 sm:gap-2">
          <Link
            href="/pricing"
            className="press rounded-control px-3 py-2 text-sm text-muted hover:bg-raised hover:text-ink"
          >
            Pricing
          </Link>
          <Link
            href="/privacy"
            className="press hidden rounded-control px-3 py-2 text-sm text-muted hover:bg-raised hover:text-ink sm:block"
          >
            Privacy
          </Link>
          <Link
            href="/sign-in"
            className="press rounded-control px-3 py-2 text-sm text-muted hover:bg-raised hover:text-ink"
          >
            Sign in
          </Link>
          <Link
            href="/sign-in"
            className="press rounded-control bg-accent px-4 py-2 text-sm font-semibold text-on-accent hover:bg-accent-hover"
          >
            Start free
          </Link>
        </nav>
      </header>

      <main>{children}</main>

      <footer className="border-t border-line">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-5 py-10 sm:flex-row sm:items-center md:px-8">
          <div className="flex items-center gap-2">
            <Logo size={20} wordmark={false} />
            <Wordmark small />
          </div>
          <p className="text-sm text-faint sm:ml-2">
            Made in South Africa, for South African teams.
          </p>
          <nav className="flex gap-4 text-sm text-muted sm:ml-auto">
            <Link href="/pricing" className="hover:text-ink">
              Pricing
            </Link>
            <Link href="/privacy" className="hover:text-ink">
              Privacy &amp; POPIA
            </Link>
            <Link href="/sign-in" className="hover:text-ink">
              Sign in
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
