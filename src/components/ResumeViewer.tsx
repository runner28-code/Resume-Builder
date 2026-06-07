"use client";

import { useEffect, useState } from "react";
import type { Job } from "@/store/resume-store";
import { useResumeStore } from "@/store/resume-store";
import { ResumeEditor } from "@/components/ResumeEditor";

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard permission denied or non-HTTPS origin — no-op
    }
  }
  return (
    <button
      onClick={handleCopy}
      className="px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-700 hover:bg-slate-600 text-slate-200 transition-colors"
    >
      {copied ? "✓ Copied" : "Copy"}
    </button>
  );
}

type Tab = "resume" | "raw";

export function ResumeViewer({ job }: { job: Job }) {
  const saveJob = useResumeStore((s) => s.saveJob);
  const { resumeData, step } = job;
  if (!resumeData) return null;

  return step === "editing"
    ? <EditingView job={job} saveJob={saveJob} />
    : <DoneView job={job} />;
}

// ── Editing mode ──────────────────────────────────────────────────────────

function EditingView({ job, saveJob }: { job: Job; saveJob: (id: string, r: import("@/store/resume-store").ResumeData) => Promise<void> }) {
  const rd = job.resumeData!;
  const [summary, setSummary]               = useState(rd.summary);
  const [workExperience, setWorkExperience] = useState(rd.workExperience);
  const [skills, setSkills]                 = useState(rd.skills);
  const [education, setEducation]           = useState(rd.education);
  const [saving, setSaving]                 = useState(false);
  const [saveError, setSaveError]           = useState<string | null>(null);

  useEffect(() => {
    function warn(e: BeforeUnloadEvent) { e.preventDefault(); }
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);

  async function handleSave() {
    setSaving(true);
    setSaveError(null);
    try {
      await saveJob(job.id, { ...rd, summary, workExperience, skills, education });
    } catch (e) {
      setSaveError(String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-slate-400">Edit directly on the resume, then save.</p>
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium disabled:opacity-50 transition-colors shrink-0"
        >
          {saving ? "Saving…" : "Save Resume"}
        </button>
      </div>

      {saveError && (
        <div className="rounded-lg border border-red-700 bg-red-950 text-red-300 text-sm px-4 py-3 flex items-center justify-between gap-3">
          <span>{saveError}</span>
          <button onClick={() => setSaveError(null)} className="text-red-400 hover:text-red-200 shrink-0">✕</button>
        </div>
      )}

      {/* Editable resume — PDF layout with inline textareas */}
      <div className="rounded-lg border border-slate-600 shadow-2xl overflow-hidden">
        <ResumeEditor
          candidateName={rd.candidateName}
          contactInfo={rd.contactInfo}
          summary={summary}
          workExperience={workExperience}
          skills={skills}
          education={education}
          onChange={(field, value) => {
            if (field === "summary") setSummary(value);
            else if (field === "workExperience") setWorkExperience(value);
            else if (field === "skills") setSkills(value);
            else if (field === "education") setEducation(value);
          }}
        />
      </div>
    </div>
  );
}


// ── Keyword score panel ───────────────────────────────────────────────────

function ScorePanel({ keywords, resumeText }: { keywords: string[]; resumeText: string }) {
  if (keywords.length === 0) return null;
  const lower = resumeText.toLowerCase();
  const hits = keywords.filter((kw) => lower.includes(kw.toLowerCase()));
  const pct = Math.round((hits.length / keywords.length) * 100);
  const color = pct >= 75 ? "text-green-400" : pct >= 50 ? "text-yellow-400" : "text-red-400";
  const barColor = pct >= 75 ? "bg-green-500" : pct >= 50 ? "bg-yellow-500" : "bg-red-500";
  const missed = keywords.filter((kw) => !lower.includes(kw.toLowerCase()));

  return (
    <div className="rounded-xl border border-slate-700 bg-slate-900 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">JD Keyword Match</span>
        <span className={`text-sm font-bold ${color}`}>{hits.length}/{keywords.length} — {pct}%</span>
      </div>
      <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${pct}%` }} />
      </div>
      {missed.length > 0 && (
        <div>
          <p className="text-xs text-slate-500 mb-1.5">Missing keywords:</p>
          <div className="flex flex-wrap gap-1">
            {missed.map((kw) => (
              <span key={kw} className="text-xs bg-red-950/60 text-red-300 border border-red-900/50 rounded px-2 py-0.5">{kw}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Done mode ─────────────────────────────────────────────────────────────

function DoneView({ job }: { job: Job }) {
  const [tab, setTab] = useState<Tab>("resume");
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const { resumeData, resumeId } = job;
  if (!resumeData) return null;
  const { summary, workExperience, skills, education, rawText, candidateName, targetCompany } = resumeData;

  async function downloadPDF() {
    if (!resumeId) return;
    setDownloadError(null);
    setDownloading(true);
    try {
      const res = await fetch("/api/resume/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resumeId }),
      });
      if (!res.ok) throw new Error(await res.text().catch(() => "PDF generation failed"));
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const fileBase = targetCompany || candidateName || "resume";
      a.download = `${fileBase.replace(/[^\w\s-]/g, "").replace(/\s+/g, "_")}_resume.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setDownloadError(String(e));
    } finally {
      setDownloading(false);
    }
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: "resume", label: "Resume" },
    { key: "raw",    label: "Raw" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-1">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                tab === t.key
                  ? "bg-indigo-600 text-white"
                  : "bg-slate-800 text-slate-400 hover:text-slate-200"
              }`}
            >
              {t.label}
            </button>
          ))}
          <CopyButton text={rawText} />
        </div>
        <button
          onClick={downloadPDF}
          disabled={downloading || !resumeId}
          className="px-4 py-1.5 rounded-lg bg-green-700 hover:bg-green-600 text-white text-sm font-medium disabled:opacity-50 transition-colors"
        >
          {downloading ? "Generating PDF…" : "⬇ Download PDF"}
        </button>
      </div>

      {downloadError && (
        <div className="rounded-lg border border-red-700 bg-red-950 text-red-300 text-sm px-4 py-3 flex items-center justify-between gap-3">
          <span>{downloadError}</span>
          <button onClick={() => setDownloadError(null)} className="text-red-400 hover:text-red-200 shrink-0">✕</button>
        </div>
      )}

      <ScorePanel keywords={job.draftMeta?.jdKeywords ?? []} resumeText={rawText} />

      <div className="bg-slate-900 border border-slate-700 rounded-xl p-6 min-h-80">
        {tab === "resume" && (
          <div className="space-y-6 font-mono text-sm text-slate-200">
            <Section title="Summary"         content={summary} />
            <Section title="Work Experience" content={workExperience} />
            <Section title="Skills"          content={skills} />
            <Section title="Education"       content={education} />
          </div>
        )}
        {tab === "raw" && (
          <pre className="text-xs text-slate-400 whitespace-pre-wrap overflow-auto">{rawText}</pre>
        )}
      </div>
    </div>
  );
}

function Section({ title, content }: { title: string; content: string }) {
  return (
    <div>
      <h2 className="text-indigo-400 font-bold uppercase text-xs tracking-widest mb-2 border-b border-slate-700 pb-1">
        {title}
      </h2>
      <div className="whitespace-pre-wrap text-slate-200 leading-relaxed">{content}</div>
    </div>
  );
}
