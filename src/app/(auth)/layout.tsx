import Link from "next/link";
import { Logo } from "@/components/ui/logo";

export default function AuthLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="min-h-dvh flex flex-col">
      <header className="px-5 py-4 sm:px-8">
        <Link href="/" className="inline-flex press" aria-label="Alpha Workspace home">
          <Logo size={26} />
        </Link>
      </header>
      <main className="flex-1 flex items-center justify-center px-5 pb-16">
        <div className="w-full max-w-sm animate-fade-up">{children}</div>
      </main>
      <footer className="px-5 py-4 text-center text-sm text-faint">
        <Link href="/privacy" className="hover:text-muted">
          Privacy
        </Link>
      </footer>
    </div>
  );
}
