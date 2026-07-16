import { redirect } from "next/navigation";
import { getUser, withWorkspace } from "@/server/session";
import { getBootstrap } from "@/server/bootstrap";
import { AppError } from "@/server/dal/errors";
import { AppProviders } from "@/components/providers";
import { WorkspaceProvider } from "@/lib/client/workspace";
import { AppShell } from "@/components/app/shell";

export default async function WorkspaceLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode;
  params: Promise<{ ws: string }>;
}>) {
  const { ws } = await params;
  const user = await getUser();
  if (!user) redirect(`/sign-in?next=${encodeURIComponent(`/w/${ws}`)}`);

  let bootstrap;
  try {
    const ctx = await withWorkspace(ws);
    bootstrap = await getBootstrap(ctx, user);
  } catch (err) {
    if (err instanceof AppError) redirect("/app");
    throw err;
  }

  return (
    <AppProviders>
      <WorkspaceProvider slug={bootstrap.workspace.slug} initial={bootstrap}>
        <AppShell>{children}</AppShell>
      </WorkspaceProvider>
    </AppProviders>
  );
}
