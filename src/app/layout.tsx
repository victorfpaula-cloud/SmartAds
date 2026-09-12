import type { Metadata } from "next";
import { Manrope, Space_Grotesk } from "next/font/google";
import "./globals.css";

export const metadata: Metadata = {
  title: "SmartAds",
  description: "Gerenciador de anúncios Meta Ads simplificado, pra agência com múltiplos clientes",
};

// Mesmo par de fontes dos apps irmãos: Space Grotesk pros títulos/números (classe font-display,
// ver tailwind.config.ts), Manrope pro corpo. Via next/font — hospedadas no próprio build, sem
// chamada externa ao Google Fonts em produção.
const fonteDisplay = Space_Grotesk({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-display",
});
const fonteCorpo = Manrope({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-body",
});

// Repetida como estilo inline (não só classe Tailwind) — aplica antes mesmo do CSS externo
// terminar de carregar, evitando um flash de tela branca na abertura (mesmo ajuste do ShoppingHub).
const CorDeFundo = "#07080a";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="pt-BR"
      className={`${fonteDisplay.variable} ${fonteCorpo.variable}`}
      style={{ backgroundColor: CorDeFundo }}
    >
      <body
        className="bg-ink-950 font-sans text-neutral-100 antialiased"
        style={{ backgroundColor: CorDeFundo }}
      >
        {children}
      </body>
    </html>
  );
}
