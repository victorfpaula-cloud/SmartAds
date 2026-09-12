"use client";

import { useState } from "react";
import { MapContainer, TileLayer, Marker, Circle, useMapEvents } from "react-leaflet";
import { X } from "@phosphor-icons/react";

// Ícone padrão do Leaflet depende de arquivos que o bundler do Next não resolve sozinho — sem
// isso o marcador aparece quebrado (ícone ausente). Usa os mesmos PNGs do próprio pacote via CDN
// do unpkg (só os ícones, não o script) pra não precisar copiar assets pro /public.
import L from "leaflet";
const iconePadrao = L.icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});

function CliqueNoMapa({ onClique }: { onClique: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(evento) {
      onClique(evento.latlng.lat, evento.latlng.lng);
    },
  });
  return null;
}

export default function MapaClicavel({
  valorInicial,
  onConfirmar,
  onFechar,
}: {
  valorInicial?: { latitude: number; longitude: number; raioKm: number } | null;
  onConfirmar: (ponto: { latitude: number; longitude: number; raioKm: number; nome: string }) => void;
  onFechar: () => void;
}) {
  const centroInicial: [number, number] = valorInicial
    ? [valorInicial.latitude, valorInicial.longitude]
    : [-14.235, -51.9253]; // centro do Brasil, pra quando ainda não marcou nenhum ponto

  const [ponto, setPonto] = useState<[number, number] | null>(
    valorInicial ? [valorInicial.latitude, valorInicial.longitude] : null
  );
  const [raioKm, setRaioKm] = useState(valorInicial?.raioKm ?? 5);
  const [nome, setNome] = useState("");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-6 backdrop-blur-sm">
      <div className="flex max-h-[90dvh] w-full max-w-2xl flex-col overflow-y-auto rounded-2xl border border-white/10 bg-ink-900 shadow-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-white/10 bg-ink-900 px-5 py-3.5">
          <h3 className="text-sm font-semibold text-neutral-100">Marcar ponto no mapa</h3>
          <button
            onClick={onFechar}
            aria-label="Fechar"
            className="flex h-8 w-8 items-center justify-center rounded-full text-neutral-400 hover:bg-white/10 hover:text-neutral-200"
          >
            <X size={16} weight="bold" />
          </button>
        </div>

        <div className="h-72 w-full shrink-0 sm:h-80">
          <MapContainer
            center={centroInicial}
            zoom={ponto ? 12 : 4}
            style={{ height: "100%", width: "100%" }}
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <CliqueNoMapa onClique={(lat, lng) => setPonto([lat, lng])} />
            {ponto && (
              <>
                <Marker position={ponto} icon={iconePadrao} />
                <Circle center={ponto} radius={raioKm * 1000} pathOptions={{ color: "#6366f1" }} />
              </>
            )}
          </MapContainer>
        </div>

        <div className="flex flex-col gap-3 border-t border-white/10 px-5 py-4">
          <p className="text-xs text-neutral-500">
            {ponto ? "Clique em outro ponto pra mover a marcação." : "Clique no mapa pra marcar o centro do público."}
          </p>

          <div>
            <label className="text-xs font-semibold text-neutral-400">Raio: {raioKm} km</label>
            <input
              type="range"
              min={1}
              max={80}
              value={raioKm}
              onChange={(e) => setRaioKm(Number(e.target.value))}
              className="mt-1.5 w-full accent-accent"
            />
          </div>

          <input
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Rótulo desse ponto (opcional, ex: Perto do shopping X)"
            className="h-9 w-full rounded-lg border border-white/14 bg-ink-850 px-2.5 text-sm text-neutral-100"
          />

          <div className="flex justify-end gap-2">
            <button
              onClick={onFechar}
              className="rounded-lg border border-white/10 px-3.5 py-2 text-xs font-medium text-neutral-400 hover:text-neutral-200"
            >
              Cancelar
            </button>
            <button
              disabled={!ponto}
              onClick={() =>
                ponto &&
                onConfirmar({ latitude: ponto[0], longitude: ponto[1], raioKm, nome: nome.trim() })
              }
              className="rounded-lg bg-accent px-4 py-2 text-xs font-semibold text-white hover:bg-accent-strong disabled:opacity-40"
            >
              Usar este ponto
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
