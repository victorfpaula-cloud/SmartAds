import { exigirAmbiente } from "@/lib/ambiente";

export default async function Layout({ children }: { children: React.ReactNode }) {
  await exigirAmbiente();
  return children;
}
