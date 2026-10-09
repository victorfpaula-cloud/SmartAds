export default function Carregando() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-24 sm:px-6">
      <div className="flex flex-col gap-4">
        <div className="h-7 w-48 animate-pulse rounded-lg bg-white/[0.06]" />
        <div className="h-4 w-80 max-w-full animate-pulse rounded bg-white/[0.04]" />
        <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-2xl bg-white/[0.04]" />
          ))}
        </div>
        <div className="h-64 animate-pulse rounded-2xl bg-white/[0.04]" />
      </div>
    </main>
  );
}
