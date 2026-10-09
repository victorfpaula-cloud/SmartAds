import { exigirAmbiente } from "@/lib/ambiente";

/** Tudo em /estrategias é da franquia: sem ambiente volta pro Início; dentro de uma conta única vai
 * pro começo dela. */
export default async function EstrategiasLayout({ children }: { children: React.ReactNode }) {
  await exigirAmbiente("franquia");
  return children;
}
