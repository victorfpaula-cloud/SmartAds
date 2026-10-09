import AbasPagina from "@/components/AbasPagina";
import { lerAmbiente } from "@/lib/ambiente";

/** Campanha oficial da rede: o molde (sequência), a campanha aplicada nas unidades e os planos. */
export function AbasCampanhaOficial() {
  return (
    <AbasPagina
      abas={[
        { href: "/estrategias/moldes", label: "1. Moldes (sequências)" },
        { href: "/estrategias/campanhas-mae", label: "2. Campanhas oficiais" },
        { href: "/estrategias/planos", label: "3. Planos aplicados" },
      ]}
    />
  );
}

/** Seção "Campanhas" da franquia: o que está no ar, a campanha oficial e o calendário numa só área.
 * Só aparece dentro de uma franquia — conta única tem o próprio menu. */
export async function AbasCampanhas() {
  if ((await lerAmbiente())?.tipo !== "franquia") return null;
  return (
    <AbasPagina
      abas={[
        { href: "/campanhas", label: "No ar" },
        { href: "/estrategias/campanhas-mae", label: "Campanha oficial", tambem: ["/estrategias/moldes", "/estrategias/planos"] },
        { href: "/estrategias/calendario", label: "Calendário" },
      ]}
    />
  );
}

/** Seção "Unidades" da franquia: o que se configura por unidade (boost, delivery, públicos) e o semáforo. */
export async function AbasUnidades() {
  if ((await lerAmbiente())?.tipo !== "franquia") return null;
  return (
    <AbasPagina
      abas={[
        { href: "/boost", label: "Boost" },
        { href: "/delivery", label: "Delivery" },
        { href: "/publicos", label: "Públicos" },
        { href: "/estrategias/semaforo", label: "Semáforo", tambem: ["/estrategias/diagnostico"] },
      ]}
    />
  );
}
