/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [
      {
        // Todas as páginas do app (fora os estáticos do _next, já versionados a cada deploy) —
        // força sempre buscar a versão mais nova em vez de reaproveitar uma tela antiga em cache
        // (mesmo ajuste feito nos apps irmãos, por causa do Safari no iPhone/iPad).
        source: "/((?!_next/static|_next/image|favicon.ico).*)",
        headers: [
          {
            key: "Cache-Control",
            value: "no-store, must-revalidate",
          },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
