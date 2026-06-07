"use client";

import type { Job, PipelineStep } from "@/store/resume-store";

const STEPS: { key: PipelineStep; label: string }[] = [
  { key: "analyzing",   label: "Analyzing JD" },
  { key: "searching",   label: "Searching history" },
  { key: "overview",    label: "Company & teams" },
  { key: "researching", label: "Researching teams" },
  { key: "generating",  label: "Writing resume" },
  { key: "editing",     label: "Review & save" },
  { key: "done",        label: "Complete" },
];

function matchLabel(similarity: number): { label: string; classes: string } {
  if (similarity >= 60) return { label: "Strong match", classes: "border-green-700 bg-green-950 text-green-300" };
  if (similarity >= 35) return { label: "Moderate match", classes: "border-yellow-700 bg-yellow-950 text-yellow-300" };
  return { label: "Weak match", classes: "border-red-700 bg-red-950 text-red-300" };
}

export function JobCard({ job, index }: { job: Job; index: number }) {
  const currentIdx = STEPS.findIndex((s) => s.key === job.step);

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-slate-300">JD {index + 1}</span>
        <span className="text-xs font-mono text-amber-400">${job.claudeCost.toFixed(4)}</span>
      </div>

      {/* JD preview */}
      <p className="text-xs text-slate-500 truncate">
        {job.targetJD.slice(0, 120) || "—"}
      </p>

      {/* Progress bar */}
      {job.step !== "idle" && (
        <>
          <div>
            <div className="flex justify-between text-xs text-slate-400 mb-1">
              <span className="truncate">{job.statusNote}</span>
              <span className="shrink-0 ml-2">{job.progress}%</span>
            </div>
            <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  job.step === "done"
                    ? "bg-green-500"
                    : job.step === "error"
                    ? "bg-red-500"
                    : "bg-indigo-500"
                }`}
                style={{ width: `${job.progress}%` }}
              />
            </div>
          </div>

          {/* Step pills */}
          <div className="flex gap-1 flex-wrap">
            {STEPS.map((s, i) => (
              <span
                key={s.key}
                className={`text-xs px-2 py-0.5 rounded-full ${
                  i < currentIdx
                    ? "bg-green-900 text-green-300"
                    : i === currentIdx
                    ? "bg-indigo-700 text-indigo-200 animate-pulse"
                    : "bg-slate-800 text-slate-600"
                }`}
              >
                {s.label}
              </span>
            ))}
          </div>

          {/* Reuse path badge */}
          {job.reusePlan && (
            <div
              className={`rounded-lg px-3 py-2 text-xs border ${
                job.reusePlan.path === "A"
                  ? "border-green-700 bg-green-950 text-green-300"
                  : job.reusePlan.path === "B"
                  ? "border-yellow-700 bg-yellow-950 text-yellow-300"
                  : "border-slate-700 bg-slate-800 text-slate-400"
              }`}
            >
              <span className="font-semibold">
                {job.reusePlan.path === "A" && "✓ Adapting a very similar resume"}
                {job.reusePlan.path === "B" && "↻ Reusing past research, writing fresh bullets"}
                {job.reusePlan.path === "C" && "⟳ Full pipeline — researching from scratch"}
              </span>
              <span className="ml-2 opacity-70">
                {job.reusePlan.estimatedCost} · {job.reusePlan.estimatedTime}
              </span>
            </div>
          )}

          {/* Match confidence */}
          {job.topMatches.length > 0 && (() => {
            const top = job.topMatches[0].similarity;
            const { label, classes } = matchLabel(top);
            return (
              <div className={`rounded-lg px-3 py-2 text-xs border ${classes}`}>
                <span className="font-semibold">{label}</span>
                <span className="ml-2 opacity-70">{top}% similarity to past resumes</span>
                {top < 35 && (
                  <p className="mt-1 opacity-90">
                    This JD may require skills not well represented in your history. Review the output carefully before applying.
                  </p>
                )}
              </div>
            );
          })()}

          {/* Error */}
          {job.step === "error" && job.error && (
            <div className="rounded-lg px-3 py-2 border border-red-700 bg-red-950 text-red-300 text-xs">
              {job.error}
            </div>
          )}
        </>
      )}
    </div>
  );
}
