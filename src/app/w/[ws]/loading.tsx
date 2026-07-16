/** Route-level skeleton while a workspace page streams in. */
export default function WorkspaceLoading() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 pt-6 md:px-6">
      <div className="skeleton h-7 w-40" />
      <div className="mt-2 skeleton h-4 w-64" />
      <div className="mt-6 space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="skeleton h-11" />
        ))}
      </div>
    </div>
  );
}
