/** Shown while the FAQs list resolves. Mirrors the other admin list views. */
export default function FaqsLoading() {
  return (
    <div className="mx-auto max-w-6xl" role="status" aria-live="polite">
      <span className="sr-only">Loading faqs</span>

      <div aria-hidden className="animate-pulse">
        <div className="h-8 w-40 rounded-md bg-secondary" />
        <div className="mt-3 h-4 w-96 max-w-full rounded-full bg-secondary" />

        <div className="mt-8 rounded-xl border border-border bg-white p-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="h-10 rounded-md bg-secondary" />
            <div className="h-10 rounded-md bg-secondary" />
          </div>
        </div>

        <div className="mt-8 h-6 w-28 rounded-full bg-secondary" />
        <div className="mt-4 space-y-px overflow-hidden rounded-xl border border-border bg-white">
          {Array.from({ length: 8 }, (_, index) => (
            <div key={index} className="flex items-center gap-4 p-3">
              <div className="h-4 w-56 rounded-full bg-secondary" />
              <div className="h-4 w-24 rounded-full bg-secondary" />
              <div className="h-4 w-16 rounded-full bg-secondary" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
