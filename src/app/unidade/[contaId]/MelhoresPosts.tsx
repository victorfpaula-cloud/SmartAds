"use client";

import { useState } from "react";
import Link from "next/link";
import { CaretDown } from "@phosphor-icons/react";

interface Post {
  id: string;
  caption?: string;
  media_type: string;
  media_url?: string;
  thumbnail_url?: string;
  permalink: string;
  timestamp: string;
  like_count?: number;
  comments_count?: number;
}

/** Os posts recentes que mais engajaram (curtidas + comentários), pra impulsionar de novo o que já deu
 * certo. Só busca na Meta quando a pessoa abre. */
export default function MelhoresPosts({ contaId, instagramBusinessId }: { contaId: string; instagramBusinessId: string }) {
  const [aberto, setAberto] = useState(false);
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  async function abrir() {
    const vaiAbrir = !aberto;
    setAberto(vaiAbrir);
    if (!vaiAbrir || posts) return;
    try {
      const r = await fetch(`/api/meta/posts-instagram?instagramBusinessId=${instagramBusinessId}`);
      const c = await r.json();
      if (!r.ok) throw new Error(c.erro || "Falha ao buscar os posts.");
      const pontos = (p: Post) => (p.like_count ?? 0) + (p.comments_count ?? 0);
      setPosts([...(c.posts as Post[])].sort((a, b) => pontos(b) - pontos(a)).slice(0, 5));
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao buscar os posts.");
    }
  }

  return (
    <section className="cartao-vidro overflow-hidden">
      <button onClick={abrir} className="flex w-full items-center justify-between gap-3 px-5 py-3.5 text-left">
        <div>
          <p className="text-sm font-semibold text-neutral-100">Melhores posts recentes</p>
          <p className="text-[11.5px] text-neutral-500">Os 5 que mais engajaram entre os últimos 30 posts — bons candidatos a impulsionar de novo.</p>
        </div>
        <CaretDown size={14} className={`shrink-0 text-neutral-500 transition ${aberto ? "rotate-180" : ""}`} />
      </button>
      {aberto && (
        <div className="border-t border-white/10 px-5 py-3">
          {erro ? (
            <p className="text-xs text-danger">{erro}</p>
          ) : !posts ? (
            <p className="text-xs text-neutral-500">Buscando no Instagram…</p>
          ) : posts.length === 0 ? (
            <p className="text-xs text-neutral-500">Nenhum post encontrado nessa conta.</p>
          ) : (
            <ul className="flex flex-col gap-2.5">
              {posts.map((p, i) => (
                <li key={p.id} className="flex items-center gap-3">
                  <span className="w-4 shrink-0 text-center text-xs font-bold text-neutral-500">{i + 1}</span>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.thumbnail_url || p.media_url} alt="" loading="lazy" referrerPolicy="no-referrer" className="h-11 w-11 shrink-0 rounded-lg border border-white/10 object-cover" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs text-neutral-200">{p.caption?.replace(/\s+/g, " ").slice(0, 90) || "(sem legenda)"}</p>
                    <p className="text-[10.5px] text-neutral-500">
                      {new Date(p.timestamp).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" })} ·{" "}
                      {(p.like_count ?? 0).toLocaleString("pt-BR")} curtidas · {(p.comments_count ?? 0).toLocaleString("pt-BR")} comentários ·{" "}
                      {p.media_type === "VIDEO" ? "Reels" : p.media_type === "CAROUSEL_ALBUM" ? "Carrossel" : "Foto"}
                    </p>
                  </div>
                  <a href={p.permalink} target="_blank" rel="noreferrer" className="shrink-0 text-[11px] text-neutral-400 hover:text-neutral-200">
                    ver
                  </a>
                  <Link href={`/campanhas/nova/${contaId}/engajamento?post=${p.id}`} className="shrink-0 rounded-lg border border-accent/40 bg-accent/10 px-2.5 py-1 text-[11px] font-semibold text-accent-strong hover:bg-accent/20">
                    Impulsionar
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
