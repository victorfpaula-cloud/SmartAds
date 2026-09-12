import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      // Sem isso, "/8", "/12" e "/14" (bordas e fundos bem sutis, tipo border-white/8) não geram
      // nenhum CSS — o Tailwind só aceita opacidade "/N" se N estiver nessa escala. Mesmo ajuste
      // já usado no ShoppingHub, pelo mesmo motivo.
      opacity: {
        8: "0.08",
        12: "0.12",
        14: "0.14",
      },
      colors: {
        // Mesma família "ink" dos apps irmãos — fundo escuro em camadas.
        ink: {
          950: "#07080a",
          900: "#111318",
          850: "#15171d",
          800: "#1a1c23",
        },
        // Acento índigo — o mesmo tom usado no design "líquido" da tela de Reservas do Chatbot
        // Direct (reaproveitado aqui por pedido explícito, em vez do roxo do ShoppingHub).
        accent: {
          DEFAULT: "#6366f1",
          strong: "#818cf8",
        },
        warn: "#fbbf24",
        danger: "#f87171",
        ok: "#34d399",
      },
      fontFamily: {
        display: ["var(--font-display)", "sans-serif"],
        sans: ["var(--font-body)", "sans-serif"],
      },
      keyframes: {
        "pop-in": {
          "0%": { opacity: "0", transform: "scale(0.85)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
        // "none" (não "translateY(0)") de propósito — mesmo cuidado documentado no chatbot-direct:
        // "translateY(0)" ainda conta como "tem transform" pro CSS pra sempre (fill-mode "both"),
        // criando um contexto de empilhamento que prende z-index internos e esconde dropdown atrás
        // de outros cards. "none" de verdade não cria contexto nenhum.
        entrada: {
          "0%": { opacity: "0", transform: "translateY(14px)" },
          "100%": { opacity: "1", transform: "none" },
        },
      },
      animation: {
        "pop-in": "pop-in 0.45s ease-out",
        entrada: "entrada 0.65s cubic-bezier(0.16,1,0.3,1) both",
      },
    },
  },
  plugins: [],
};

export default config;
