import { redirect } from "next/navigation";

// "Mais" saiu do menu: tudo que ele guardava agora está direto na barra de cima.
export default function MaisPage() {
  redirect("/");
}
