import Link from "next/link";

export default function NaoEncontrado() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-24 sm:px-6">
      <div className="cartao-vidro mx-auto max-w-md p-6 text-center">
        <p className="text-sm font-semibold text-neutral-100">Essa página não existe (ou não é desse ambiente).</p>
        <Link href="/" className="mt-4 inline-block rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-strong">
          Ir pro Início
        </Link>
      </div>
    </main>
  );
}
