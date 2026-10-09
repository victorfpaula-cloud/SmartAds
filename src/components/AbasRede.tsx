import AbasPagina from "@/components/AbasPagina";

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

/** Saúde das unidades: o semáforo e o radar de posts. */
export function AbasUnidades() {
  return (
    <AbasPagina
      abas={[
        { href: "/estrategias/semaforo", label: "Semáforo", tambem: ["/estrategias/diagnostico"] },
        { href: "/estrategias/postagens", label: "Radar de posts" },
      ]}
    />
  );
}
