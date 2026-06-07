"use client";

import { useState } from "react";
import { useResumeStore, formatContactInfo } from "@/store/resume-store";
import { ProfileModal } from "./ProfileModal";
import { ApiKeysModal } from "./ApiKeysModal";

export function InputForm() {
  const {
    profiles,
    activeProfileId,
    jobs,
    addJob,
    removeJob,
    updateJobJD,
    runAll,
    apiKeys,
  } = useResumeStore();

  const [showProfile, setShowProfile] = useState(false);
  const [showKeys, setShowKeys] = useState(false);

  const activeProfile = profiles.find((p) => p.id === activeProfileId) ?? null;
  const hasProfile = !!activeProfile?.candidateName && (activeProfile?.companies.length ?? 0) > 0;
  const hasKeys = !!(apiKeys.anthropic && apiKeys.tavily && apiKeys.voyage);
  const isAnyRunning = jobs.some((j) => j.step !== "idle" && j.step !== "done" && j.step !== "error");
  const readyJobs = jobs.filter((j) => j.targetJD.trim() && (j.step === "idle" || j.step === "error"));

  return (
    <div className="space-y-6">
      {/* Profile summary card */}
      <div className="rounded-xl border border-slate-700 bg-slate-800/60 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            {hasProfile && activeProfile ? (
              <>
                <div className="flex items-center gap-2">
                  <div className="font-semibold text-white">{activeProfile.candidateName}</div>
                  <span className="text-xs text-slate-500 bg-slate-700 rounded px-1.5 py-0.5">
                    {activeProfile.label}
                  </span>
                </div>
                {(() => {
                  const contactLine = formatContactInfo(activeProfile.contact);
                  return contactLine ? (
                    <div className="text-xs text-slate-400 mt-0.5 truncate">{contactLine}</div>
                  ) : null;
                })()}
                <div className="mt-2 flex flex-wrap gap-1">
                  {activeProfile.companies.map((c) => (
                    <span
                      key={c.id}
                      className="inline-flex items-center gap-1 text-xs bg-slate-700 text-slate-200 rounded-md px-2 py-0.5"
                    >
                      {c.name}
                      {c.role && <span className="text-slate-400">· {c.role}</span>}
                      <span className="text-slate-500">{c.startDate}–{c.endDate}</span>
                    </span>
                  ))}
                </div>
              </>
            ) : (
              <p className="text-sm text-slate-400">
                No profile saved yet. Set up your personal info once and reuse it for every resume.
              </p>
            )}
          </div>
          <button
            onClick={() => setShowProfile(true)}
            className="shrink-0 text-xs text-indigo-400 hover:text-indigo-300 border border-slate-600 hover:border-indigo-500 rounded-lg px-3 py-1.5 transition-colors"
          >
            {profiles.length > 0 ? "Manage Profiles" : "Create Profile"}
          </button>
        </div>
      </div>

      {/* API Keys row */}
      <div className="flex items-center justify-between rounded-xl border border-slate-700 bg-slate-800/60 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${hasKeys ? "bg-green-500" : "bg-amber-500"}`} />
          <span className="text-sm text-slate-300">
            {hasKeys ? "API keys configured" : "Using server API keys"}
          </span>
        </div>
        <button
          onClick={() => setShowKeys(true)}
          className="text-xs text-indigo-400 hover:text-indigo-300 border border-slate-600 hover:border-indigo-500 rounded-lg px-3 py-1.5 transition-colors"
        >
          {hasKeys ? "Edit Keys" : "Set API Keys"}
        </button>
      </div>

      {/* Job Description list */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium text-slate-300">
            Job Descriptions
            <span className="ml-2 text-xs text-slate-500">({jobs.length})</span>
          </label>
          <button
            onClick={addJob}
            disabled={isAnyRunning}
            className="text-xs text-indigo-400 hover:text-indigo-300 disabled:opacity-40 border border-slate-600 hover:border-indigo-500 rounded-lg px-3 py-1 transition-colors"
          >
            + Add JD
          </button>
        </div>

        {jobs.map((job, i) => (
          <div key={job.id} className="relative group">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-slate-500 font-medium">JD {i + 1}</span>
              {jobs.length > 1 && job.step === "idle" && (
                <button
                  onClick={() => removeJob(job.id)}
                  className="text-xs text-slate-600 hover:text-red-400 transition-colors"
                >
                  Remove
                </button>
              )}
            </div>
            <textarea
              value={job.targetJD}
              onChange={(e) => updateJobJD(job.id, e.target.value)}
              disabled={job.step !== "idle" && job.step !== "error"}
              placeholder="Paste the full job description here..."
              rows={job.step !== "idle" ? 3 : 8}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono text-xs resize-none disabled:opacity-60"
            />
            {job.step === "error" && (
              <p className="mt-1 text-xs text-red-400">{job.error}</p>
            )}
          </div>
        ))}
      </div>

      {/* Submit */}
      <button
        onClick={runAll}
        disabled={isAnyRunning || !hasProfile || readyJobs.length === 0}
        className="w-full py-3 rounded-xl font-semibold text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        {isAnyRunning
          ? "Generating…"
          : readyJobs.length > 1
          ? `Generate ${readyJobs.length} Resumes`
          : "Generate Resume"}
      </button>

      {showProfile && <ProfileModal onClose={() => setShowProfile(false)} />}
      {showKeys    && <ApiKeysModal onClose={() => setShowKeys(false)} />}
    </div>
  );
}
