"use client";
import { useState } from "react";
import { InputForm } from "@/components/InputForm";
import { JobCard } from "@/components/ProgressPanel";
import { ResumeViewer } from "@/components/ResumeViewer";
import { ResumeHistory } from "@/components/ResumeHistory";
import { useResumeStore } from "@/store/resume-store";
import { logout } from "@/app/actions/auth";

export function HomeContent({ userId, userEmail }: { userId: string; userEmail: string }) {
  const { jobs, runAll, resetJobs } = useResumeStore();
  const [tab, setTab] = useState<"generate" | "history">("generate");
  const [expandedJob, setExpandedJob] = useState<string | null>(null);

  const isAnyRunning = jobs.some((j) => !["idle", "done", "editing", "error"].includes(j.step));
  const isAnyActive  = jobs.some((j) => j.step !== "idle");
  const doneJobs     = jobs.filter((j) => j.step === "done" || j.step === "editing");
  const allSettled   = isAnyActive && !isAnyRunning;

  // Auto-expand the first done job
  const viewJob = expandedJob
    ? (jobs.find((j) => j.id === expandedJob) ?? doneJobs[0] ?? null)
    : (doneJobs[0] ?? null);

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="max-w-5xl mx-auto px-4 py-10">

        {/* Header */}
        <div className="mb-8 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">
              Resume <span className="text-indigo-400">Builder</span>
            </h1>
            <p className="mt-1 text-slate-400 text-sm max-w-lg">
              Save your profile once, paste one or more job descriptions, and get tailored
              ATS-optimized resumes generated in parallel.
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {/* Tab toggle */}
            <div className="flex items-center gap-1 bg-slate-900 border border-slate-800 rounded-xl p-1">
              <button
                onClick={() => setTab("generate")}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  tab === "generate" ? "bg-indigo-600 text-white" : "text-slate-400 hover:text-white"
                }`}
              >
                Generate
              </button>
              <button
                onClick={() => setTab("history")}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  tab === "history" ? "bg-indigo-600 text-white" : "text-slate-400 hover:text-white"
                }`}
              >
                History
              </button>
            </div>

            {/* User menu */}
            <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 rounded-xl px-3 py-1.5">
              <span className="text-xs text-slate-400 max-w-35 truncate">{userEmail}</span>
              <form action={logout}>
                <button type="submit" className="text-xs text-slate-500 hover:text-slate-300 transition-colors">
                  Sign out
                </button>
              </form>
            </div>
          </div>
        </div>

        {/* ── Generate tab ── */}
        {tab === "generate" && (
          <>
            {/* Idle state: two-column form */}
            {!isAnyActive && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
                  <h2 className="text-lg font-semibold mb-4">Generate Resume</h2>
                  <InputForm />
                </div>
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
                  <h2 className="text-lg font-semibold mb-4">How It Works</h2>
                  <ol className="space-y-4 text-sm text-slate-400">
                    {[
                      ["Analyze JD", "Extracts ATS keywords, hard/soft requirements, and company type."],
                      ["Search History", "Checks past resumes for similar JDs — reuses research (PATH A/B)."],
                      ["Company Research", "Web-searches your previous employers: culture, tech stack, scale."],
                      ["Team Selection", "Picks the most JD-relevant team per company."],
                      ["Generate Resume", "Claude writes ATS-optimized bullets using the master prompt."],
                      ["Export PDF", "Downloads a clean, ATS-compatible PDF."],
                    ].map(([title, desc], i) => (
                      <li key={i} className="flex gap-3">
                        <span className="w-6 h-6 rounded-full bg-indigo-900 text-indigo-300 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                          {i + 1}
                        </span>
                        <div>
                          <div className="text-slate-200 font-medium">{title}</div>
                          <div className="mt-0.5 leading-relaxed">{desc}</div>
                        </div>
                      </li>
                    ))}
                  </ol>
                  <div className="mt-6 rounded-xl border border-slate-700 bg-slate-800 p-4">
                    <div className="text-xs text-slate-400 font-semibold uppercase tracking-wider mb-2">Cost per resume</div>
                    <div className="space-y-1 text-sm">
                      <div className="flex justify-between"><span className="text-green-400">Adapt existing (very similar JD)</span><span className="text-slate-300">~$0.005 · ~10s</span></div>
                      <div className="flex justify-between"><span className="text-yellow-400">Reuse research (partial match)</span><span className="text-slate-300">~$0.005 · ~15s</span></div>
                      <div className="flex justify-between"><span className="text-slate-400">Full pipeline (new territory)</span><span className="text-slate-300">~$0.030 · ~60s</span></div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Active/done state: progress board + results */}
            {isAnyActive && (
              <div className="space-y-8">
                {/* Job progress grid */}
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-semibold">
                      {isAnyRunning
                        ? `Generating ${jobs.filter((j) => j.step !== "idle").length} resume${jobs.length > 1 ? "s" : ""}…`
                        : `${doneJobs.length} resume${doneJobs.length !== 1 ? "s" : ""} ${doneJobs.some((j) => j.step === "editing") ? "ready to review" : "ready"}`}
                    </h2>
                    <div className="flex items-center gap-2">
                      {/* Retry errored jobs */}
                      {!isAnyRunning && jobs.some((j) => j.step === "error") && (
                        <button
                          onClick={runAll}
                          className="text-xs text-amber-400 hover:text-amber-300 border border-amber-800 rounded-lg px-3 py-1.5 transition-colors"
                        >
                          Retry failed
                        </button>
                      )}
                      {allSettled && (
                        <button
                          onClick={() => { resetJobs(); setExpandedJob(null); }}
                          className="text-xs text-slate-400 hover:text-white border border-slate-700 rounded-lg px-3 py-1.5 transition-colors"
                        >
                          Start over
                        </button>
                      )}
                    </div>
                  </div>

                  <div className={`grid gap-4 ${jobs.length > 1 ? "sm:grid-cols-2" : ""}`}>
                    {jobs.map((job, i) => (
                      <JobCard key={job.id} job={job} index={i} />
                    ))}
                  </div>
                </div>

                {/* Streaming preview — shown while a job is actively generating */}
                {(() => {
                  const streamingJob = jobs.find((j) => j.step === "generating" && j.streamingText);
                  if (!streamingJob) return null;
                  return (
                    <div>
                      <h2 className="text-lg font-semibold mb-3">
                        Writing resume…
                        <span className="ml-2 inline-block w-1.5 h-4 bg-indigo-400 animate-pulse rounded-sm align-middle" />
                      </h2>
                      <div className="bg-slate-900 border border-slate-700 rounded-xl p-5 max-h-80 overflow-y-auto">
                        <pre className="text-xs text-slate-400 whitespace-pre-wrap font-mono leading-relaxed">
                          {streamingJob.streamingText}
                        </pre>
                      </div>
                    </div>
                  );
                })()}

                {/* Results section */}
                {doneJobs.length > 0 && (
                  <div>
                    <h2 className="text-lg font-semibold mb-4">Results</h2>

                    {/* Tab selector when multiple done */}
                    {doneJobs.length > 1 && (
                      <div className="flex gap-1 flex-wrap mb-4">
                        {doneJobs.map((job) => {
                          const jdIdx = jobs.findIndex((j) => j.id === job.id);
                          return (
                            <button
                              key={job.id}
                              onClick={() => setExpandedJob(job.id)}
                              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                                viewJob?.id === job.id
                                  ? "bg-indigo-600 text-white"
                                  : "bg-slate-800 text-slate-400 hover:text-slate-200"
                              }`}
                            >
                              JD {jdIdx + 1}
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {viewJob && <ResumeViewer key={viewJob.id} job={viewJob} />}
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* ── History tab ── */}
        {tab === "history" && (
          <div className="max-w-2xl mx-auto">
            <h2 className="text-lg font-semibold mb-4">Your Resumes</h2>
            <ResumeHistory userId={userId} />
          </div>
        )}

      </div>
    </div>
  );
}
