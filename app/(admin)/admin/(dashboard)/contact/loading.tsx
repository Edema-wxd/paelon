/**
 * Shown while the contact queue resolves. Mirrors `bookings/loading.tsx` —
 * see that file's comment for why this route needs its own loading state.
 */
export default function ContactLoading() {
  return (
    <div className="mx-auto max-w-6xl" role="status" aria-live="polite">
      <span className="sr-only">Loading contact submissions</span>

      <div aria-hidden className="animate-pulse">
        <div className="h-8 w-40 rounded-md bg-secondary" />
        <div className="mt-3 h-4 w-96 max-w-full rounded-full bg-secondary" />

        <div className="mt-8 rounded-xl border border-border bg-white p-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }, (_, index) => (
              <div key={index} className="h-10 rounded-md bg-secondary" />
            ))}
          </div>
        </div>

        <div className="mt-8 h-6 w-32 rounded-full bg-secondary" />
        <div className="mt-4 space-y-px overflow-hidden rounded-xl border border-border bg-white">
          {Array.from({ length: 8 }, (_, index) => (
            <div key={index} className="flex items-center gap-4 p-3">
              <div className="h-4 w-40 rounded-full bg-secondary" />
              <div className="h-4 w-20 rounded-full bg-secondary" />
              <div className="h-4 w-24 rounded-full bg-secondary" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
