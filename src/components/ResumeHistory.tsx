"use client";

import { useEffect, useRef, useState } from "react";
import { invalidateHistoryCache, getHistoryCache, setHistoryCache } from "@/lib/history-cache";

interface HistoryItem {
  id: string;
  candidateName: string;
  jdPreview: string;
  jdIndustry: string | null;
  companies: string[];
  resumeContent: {
    summary?: string;
    workExperience?: string;
    skills?: string;
    education?: string;
    contactInfo?: string;
    targetCompany?: string;
  };
  createdAt: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function parseKeySkills(skillsText: string | undefined): string[] {
  if (!skillsText) return [];
  const skills: string[] = [];
  for (const line of skillsText.split("\n")) {
    const m = line.match(/^\*\*[^*]+?:\*?\*\s*(.*)/);
    if (!m) continue;
    for (let part of m[1].split(",")) {
      part = part.trim()
        .replace(/\s*\([^,)]{1,11}\)/g, "")
        .replace(/\s*\([^)]*$/, "")
        .replace(/\)$/, "")
        .trim();
      if (part.length > 1) skills.push(part);
    }
  }
  return skills;
}

function industryColor(industry: string | null) {
  const map: Record<string, string> = {
    fintech:    "bg-blue-900/50 text-blue-300",
    healthtech: "bg-green-900/50 text-green-300",
    enterprise: "bg-purple-900/50 text-purple-300",
    saas:       "bg-indigo-900/50 text-indigo-300",
  };
  return industry ? (map[industry] ?? "bg-slate-700 text-slate-300") : "bg-slate-700 text-slate-300";
}

// ── View Modal ─────────────────────────────────────────────────────────────

function ViewModal({ item, onClose }: { item: HistoryItem; onClose: () => void }) {
  const rc = item.resumeContent;
  const sections: { title: string; content: string | undefined }[] = [
    { title: "Summary",         content: rc.summary },
    { title: "Work Experience", content: rc.workExperience },
    { title: "Skills",          content: rc.skills },
    { title: "Education",       content: rc.education },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/70 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="w-full max-w-2xl bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl mt-8 mb-8">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
          <div>
            <div className="font-semibold text-white">{item.candidateName}</div>
            {item.resumeContent.targetCompany && (
              <div className="text-sm text-slate-400 mt-0.5">{item.resumeContent.targetCompany}</div>
            )}
          </div>
          <button onClick={onClose} aria-label="Close" className="text-slate-400 hover:text-white text-xl leading-none">✕</button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-5 font-mono text-sm text-slate-200">
          {sections.map(({ title, content }) =>
            content ? (
              <div key={title}>
                <h3 className="text-indigo-400 font-bold uppercase text-xs tracking-widest mb-2 border-b border-slate-700 pb-1">
                  {title}
                </h3>
                <div className="whitespace-pre-wrap leading-relaxed text-slate-300">{content}</div>
              </div>
            ) : null
          )}
        </div>
      </div>
    </div>
  );
}

// ── Component ──────────────────────────────────────────────────────────────

export function ResumeHistory({ userId }: { userId: string }) {
  const [items, setItems]           = useState<HistoryItem[]>([]);
  const [hasMore, setHasMore]       = useState(false);
  const [loading, setLoading]       = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [deleting, setDeleting]     = useState<string | null>(null);
  const [viewItem, setViewItem]     = useState<HistoryItem | null>(null);
  const [search, setSearch]         = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function buildUrl(q: string, offset: number) {
    const params = new URLSearchParams({ limit: "10", offset: String(offset) });
    if (q.trim()) params.set("q", q.trim());
    return `/api/resume/history?${params}`;
  }

  useEffect(() => {
    const cached = getHistoryCache<HistoryItem>(userId);
    if (cached && !search.trim()) {
      setItems(cached.items);
      setHasMore(cached.hasMore);
      setLoading(false);
      return;
    }
    setLoading(true);
    fetch(buildUrl(search, 0))
      .then((r) => r.json())
      .then((data) => {
        const fetched: HistoryItem[] = data.resumes ?? [];
        const more: boolean = data.hasMore ?? false;
        if (!search.trim()) setHistoryCache(userId, fetched, more);
        setItems(fetched);
        setHasMore(more);
        setLoading(false);
      })
      .catch((e) => { setFetchError(String(e)); setLoading(false); });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  function handleSearchChange(value: string) {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setSearch(value), 300);
  }

  async function loadMore() {
    setLoadingMore(true);
    try {
      const data = await fetch(buildUrl(search, items.length)).then((r) => r.json());
      const more: HistoryItem[] = data.resumes ?? [];
      const updated = [...items, ...more];
      const moreAvail: boolean = data.hasMore ?? false;
      setItems(updated);
      setHasMore(moreAvail);
      if (!search.trim()) setHistoryCache(userId, updated, moreAvail);
    } catch (e) {
      setFetchError(String(e));
    } finally {
      setLoadingMore(false);
    }
  }

  async function downloadPDF(item: HistoryItem) {
    setActionError(null);
    setDownloading(item.id);
    try {
      const res = await fetch("/api/resume/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resumeId: item.id }),
      });
      if (!res.ok) throw new Error(await res.text());
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const fileBase = item.resumeContent.targetCompany || item.candidateName || "resume";
      a.download = `${fileBase.replace(/[^\w\s-]/g, "").replace(/\s+/g, "_")}_resume.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setActionError(`PDF failed: ${String(e)}`);
    } finally {
      setDownloading(null);
    }
  }

  async function deleteResume(item: HistoryItem) {
    if (!confirm(`Delete resume for ${item.resumeContent.targetCompany || item.candidateName}?`)) return;
    setActionError(null);
    setDeleting(item.id);
    try {
      const res = await fetch("/api/resume/delete", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resumeId: item.id }),
      });
      if (!res.ok) throw new Error(await res.text());
      const updated = items.filter((i) => i.id !== item.id);
      setItems(updated);
      invalidateHistoryCache(userId);
    } catch (e) {
      setActionError(`Delete failed: ${String(e)}`);
    } finally {
      setDeleting(null);
    }
  }

  if (loading) {
    return <div className="flex items-center justify-center py-20 text-slate-500 text-sm">Loading history...</div>;
  }

  if (fetchError) {
    return <div className="text-red-400 text-sm py-8 text-center">Failed to load history: {fetchError}</div>;
  }

  return (
    <>
      {viewItem && <ViewModal item={viewItem} onClose={() => setViewItem(null)} />}

      <div className="space-y-3">
        {/* Search */}
        <input
          type="text"
          defaultValue=""
          onChange={(e) => handleSearchChange(e.target.value)}
          placeholder="Search by target company…"
          className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
        />

        {actionError && (
          <div className="rounded-lg border border-red-700 bg-red-950 text-red-300 text-sm px-4 py-3 flex items-center justify-between gap-3">
            <span>{actionError}</span>
            <button onClick={() => setActionError(null)} aria-label="Dismiss" className="text-red-400 hover:text-red-200 shrink-0">✕</button>
          </div>
        )}

        {!loading && items.length === 0 && (
          <div className="text-slate-500 text-sm py-8 text-center">
            {search.trim() ? <>No resumes match &quot;{search}&quot;.</> : "No resumes generated yet."}
          </div>
        )}

        {items.map((item: HistoryItem) => {
          const date = new Date(item.createdAt).toLocaleDateString("en-US", {
            month: "short", day: "numeric", year: "numeric",
          });
          const company = item.resumeContent.targetCompany || null;
          const skills = parseKeySkills(item.resumeContent.skills);
          const visibleSkills = skills.slice(0, 12);
          const extraCount = skills.length - visibleSkills.length;

          return (
            <div key={item.id} className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col gap-3">
              {/* Title row */}
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-white">{item.candidateName}</span>
                    {item.jdIndustry && (
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${industryColor(item.jdIndustry)}`}>
                        {item.jdIndustry}
                      </span>
                    )}
                    <span className="text-xs text-slate-500">{date}</span>
                  </div>
                  {company
                    ? <p className="mt-0.5 text-sm text-slate-300">{company}</p>
                    : <p className="mt-1 text-xs text-slate-500 line-clamp-1">{item.jdPreview}</p>
                  }
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={() => setViewItem(item)}
                    className="text-xs font-medium text-slate-400 hover:text-white border border-slate-700 hover:border-slate-500 rounded-lg px-3 py-1.5 transition-colors"
                  >
                    View
                  </button>
                  <button
                    onClick={() => downloadPDF(item)}
                    disabled={downloading === item.id}
                    aria-label={`Download PDF for ${item.candidateName}`}
                    className="text-xs font-medium text-indigo-400 hover:text-indigo-300 border border-slate-700 hover:border-indigo-500 rounded-lg px-3 py-1.5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {downloading === item.id ? "..." : "↓ PDF"}
                  </button>
                  <button
                    onClick={() => deleteResume(item)}
                    disabled={deleting === item.id}
                    aria-label={`Delete resume for ${item.candidateName}`}
                    className="text-xs font-medium text-slate-600 hover:text-red-400 border border-slate-700 hover:border-red-700 rounded-lg px-2 py-1.5 transition-colors disabled:opacity-40"
                  >
                    {deleting === item.id ? "..." : "✕"}
                  </button>
                </div>
              </div>

              {/* Companies */}
              <div className="flex flex-wrap gap-1">
                {item.companies.map((name: string, i: number) => (
                  <span key={i} className="text-xs bg-slate-800 text-slate-300 rounded px-2 py-0.5 font-medium">
                    {name}
                  </span>
                ))}
              </div>

              {/* Key skills */}
              {visibleSkills.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {visibleSkills.map((s, i) => (
                    <span key={i} className="text-xs bg-indigo-950/60 text-indigo-300 border border-indigo-900/50 rounded px-2 py-0.5">
                      {s}
                    </span>
                  ))}
                  {extraCount > 0 && (
                    <span className="text-xs text-slate-500 px-1 py-0.5">+{extraCount} more</span>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {hasMore && (
          <button
            onClick={loadMore}
            disabled={loadingMore}
            className="w-full py-2 text-sm text-slate-400 hover:text-white border border-slate-800 hover:border-slate-600 rounded-xl transition-colors disabled:opacity-40"
          >
            {loadingMore ? "Loading..." : "Load more"}
          </button>
        )}
      </div>
    </>
  );
}
