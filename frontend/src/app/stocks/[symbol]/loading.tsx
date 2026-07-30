export default function LoadingStockPage() {
  return (
    <div className="space-y-3">
      <div className="h-10 w-full animate-pulse rounded-xl bg-panel" />
      <div className="grid gap-3 lg:grid-cols-[360px_1fr]">
        <div className="h-[600px] animate-pulse rounded-2xl bg-panel" />
        <div className="space-y-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-32 animate-pulse rounded-2xl bg-panel" />
          ))}
        </div>
      </div>
    </div>
  );
}
