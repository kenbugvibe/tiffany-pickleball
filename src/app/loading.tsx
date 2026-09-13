export default function Loading() {
  return (
    <main className="min-h-screen bg-cream-50">
      <div className="h-16 bg-court-950" />
      <div className="h-80 animate-pulse bg-court-800" />
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-8">
        <div className="h-8 w-56 animate-pulse rounded-lg bg-court-800/10" />
        <div className="mt-6 h-32 animate-pulse rounded-2xl bg-white" />
        <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }, (_, index) => (
            <div
              key={index}
              className="h-36 animate-pulse rounded-2xl bg-white"
            />
          ))}
        </div>
      </div>
    </main>
  );
}
