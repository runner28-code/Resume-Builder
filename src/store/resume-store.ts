import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ReusePlan } from "@/lib/reuse-strategy";
import { mapWithConcurrency } from "@/lib/concurrency";
import { invalidateHistoryCache } from "@/lib/history-cache";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface ContactFields {
  email: string;
  phone: string;
  linkedin: string;
  location: string;
  website: string;
}

export interface EducationEntry {
  id: string;
  degree: string;
  school: string;
  year: string;
}

export interface Company {
  id: string;
  name: string;
  role: string;
  startDate: string;
  endDate: string;
}

export interface ApiKeys {
  anthropic: string;
  tavily: string;
  voyage: string;
}

export interface ResumeData {
  summary: string;
  workExperience: string;
  skills: string;
  education: string;
  rawText: string;
  // Snapshotted at generation time so PDF download stays correct if the profile later changes
  candidateName: string;
  contactInfo: string;
  targetCompany: string | null;
}

export type PipelineStep =
  | "idle"
  | "analyzing"
  | "searching"
  | "overview"
  | "researching"
  | "generating"
  | "editing"
  | "done"
  | "error";

export interface DraftMeta {
  sessionId: string;
  candidateName: string;
  contactInfo: string;
  jdText: string;
  jdEmbedding: number[];
  jdKeywords: string[];
  jdIndustry: string | null;
  targetCompany: string | null;
  companies: Array<{ name: string; role: string; startDate: string; endDate: string }>;
  teamSelections: Record<string, { selectedTeam: string; reason: string }>;
  researchKeys: string[];
  bulletsByRole: Record<string, string[]>;
}

export interface Job {
  id: string;
  targetJD: string;
  step: PipelineStep;
  progress: number;
  statusNote: string;
  error: string | null;
  resumeId: string | null;
  resumeData: ResumeData | null;
  streamingText: string | null;
  draftMeta: DraftMeta | null;
  reusePlan: ReusePlan | null;
  topMatches: Array<{ resumeId: string; similarity: number; jdIndustry: string | null }>;
  teamSelections: Record<string, { selectedTeam: string; reason: string }>;
  claudeCost: number;
}

export interface Profile {
  id: string;
  label: string;
  candidateName: string;
  contact: ContactFields;
  educationEntries: EducationEntry[];
  companies: Company[];
}

// ── Helpers (exported for use in components) ───────────────────────────────────

export function formatContactInfo(contact: ContactFields): string {
  return [contact.email, contact.phone, contact.linkedin, contact.location, contact.website]
    .filter(Boolean)
    .join(" · ");
}

export function formatEducation(entries: EducationEntry[]): string {
  return entries
    .map((e) => [e.degree, e.school, e.year].filter(Boolean).join(", "))
    .join("\n");
}

function makeProfile(): Profile {
  return {
    id: `profile_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    label: "My Profile",
    candidateName: "",
    contact: { email: "", phone: "", linkedin: "", location: "", website: "" },
    educationEntries: [],
    companies: [],
  };
}

function newJob(jd = ""): Job {
  return {
    id: `job_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    targetJD: jd,
    step: "idle",
    progress: 0,
    statusNote: "",
    error: null,
    resumeId: null,
    resumeData: null,
    streamingText: null,
    draftMeta: null,
    reusePlan: null,
    topMatches: [],
    teamSelections: {},
    claudeCost: 0,
  };
}

function apiHeaders(keys: ApiKeys): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (keys.anthropic) h["x-anthropic-key"] = keys.anthropic;
  if (keys.tavily)    h["x-tavily-key"]    = keys.tavily;
  if (keys.voyage)    h["x-voyage-key"]    = keys.voyage;
  return h;
}

async function post(url: string, body: object, keys: ApiKeys) {
  const res = await fetch(url, {
    method: "POST",
    headers: apiHeaders(keys),
    body: JSON.stringify(body),
  });
  if (res.status === 401) {
    window.location.href = "/login";
    throw new Error("Session expired — redirecting to login");
  }
  if (!res.ok) {
    const msg = await res.text().catch(() => res.statusText);
    throw new Error(`${url} failed: ${msg || res.statusText}`);
  }
  return res.json();
}

// Streams NDJSON from /api/resume/generate, calling onChunk for each text delta.
// Returns the final metadata object sent as the last line.
async function streamGenerate(
  body: object,
  keys: ApiKeys,
  onChunk: (text: string) => void,
): Promise<{ resume: unknown; draftMeta: unknown; claudeCost: number }> {
  const res = await fetch("/api/resume/generate", {
    method: "POST",
    headers: apiHeaders(keys),
    body: JSON.stringify(body),
  });
  if (res.status === 401) {
    window.location.href = "/login";
    throw new Error("Session expired — redirecting to login");
  }
  if (!res.ok) {
    const msg = await res.text().catch(() => res.statusText);
    throw new Error(`/api/resume/generate failed: ${msg || res.statusText}`);
  }

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let meta: { resume: unknown; draftMeta: unknown; claudeCost: number } | null = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      let obj: Record<string, unknown>;
      try {
        obj = JSON.parse(line) as Record<string, unknown>;
      } catch {
        throw new Error(`Malformed response from generate stream: ${line.slice(0, 120)}`);
      }
      if (obj.error) throw new Error(String(obj.error));
      if (obj.done) {
        meta = obj as { resume: unknown; draftMeta: unknown; claudeCost: number };
      } else if (typeof obj.t === "string") {
        onChunk(obj.t);
      }
    }
  }

  if (!meta) throw new Error("Generate stream ended without final metadata");
  return meta;
}

// ── Store ──────────────────────────────────────────────────────────────────────

interface ResumeStore {
  // Profiles (persisted)
  profiles: Profile[];
  activeProfileId: string | null;
  apiKeys: ApiKeys;

  // Jobs (session only, not persisted)
  jobs: Job[];

  // Profile actions
  addProfile: () => string;
  deleteProfile: (id: string) => void;
  updateProfile: (id: string, patch: Partial<Omit<Profile, "id">>) => void;
  setActiveProfile: (id: string) => void;
  setApiKeys: (keys: ApiKeys) => void;

  // Job management
  addJob: () => void;
  removeJob: (id: string) => void;
  updateJobJD: (id: string, jd: string) => void;
  resetJobs: () => void;

  // Pipeline
  runAll: () => Promise<void>;
  saveJob: (id: string, editedResume: ResumeData) => Promise<void>;
}

export const useResumeStore = create<ResumeStore>()(
  persist(
    (set, get) => ({
      profiles: [],
      activeProfileId: null,
      apiKeys: { anthropic: "", tavily: "", voyage: "" },
      jobs: [newJob()],

      addProfile: () => {
        const p = makeProfile();
        set((s) => ({ profiles: [...s.profiles, p] }));
        return p.id;
      },

      deleteProfile: (id) =>
        set((s) => {
          const profiles = s.profiles.filter((p) => p.id !== id);
          const activeProfileId =
            s.activeProfileId === id ? (profiles[0]?.id ?? null) : s.activeProfileId;
          return { profiles, activeProfileId };
        }),

      updateProfile: (id, patch) =>
        set((s) => ({
          profiles: s.profiles.map((p) => (p.id === id ? { ...p, ...patch } : p)),
        })),

      setActiveProfile: (id) => set({ activeProfileId: id }),

      setApiKeys: (keys) => set({ apiKeys: keys }),

      addJob: () => set((s) => ({ jobs: [...s.jobs, newJob()] })),

      removeJob: (id) =>
        set((s) => {
          const filtered = s.jobs.filter((j) => j.id !== id);
          return { jobs: filtered.length > 0 ? filtered : [newJob()] };
        }),

      updateJobJD: (id, jd) =>
        set((s) => ({
          jobs: s.jobs.map((j) => (j.id === id ? { ...j, targetJD: jd } : j)),
        })),

      resetJobs: () => set({ jobs: [newJob()] }),

      runAll: async () => {
        const s = get();
        const { apiKeys, activeProfileId, profiles } = s;

        const activeProfile = profiles.find((p) => p.id === activeProfileId);
        if (!activeProfile) return;

        const { candidateName, contact, educationEntries } = activeProfile;
        // Strip any company rows the user left with a blank name
        const companies = activeProfile.companies.filter((c) => c.name.trim());
        if (companies.length === 0) return;

        const contactInfo = formatContactInfo(contact);
        const education = formatEducation(educationEntries);
        const companyNames = companies.map((c) => c.name);

        const pending = s.jobs.filter(
          (j) => (j.step === "idle" || j.step === "error") && j.targetJD.trim()
        );
        if (pending.length === 0) return;

        const patchJob = (id: string, patch: Partial<Job> | ((prev: Job) => Partial<Job>)) => {
          set((st) => {
            const idx = st.jobs.findIndex((j) => j.id === id);
            if (idx === -1) return st;
            const prev = st.jobs[idx];
            const update = typeof patch === "function" ? patch(prev) : patch;
            const jobs = [...st.jobs];
            jobs[idx] = { ...prev, ...update };
            return { jobs };
          });
        };

        // Batch-embed all pending JDs in one Voyage API call before the pipeline starts.
        // Falls back gracefully: if the call fails, each route embeds individually.
        const embeddingByJobId = new Map<string, number[]>();
        try {
          const embedData = await post("/api/resume/embed-batch", { jdTexts: pending.map((j) => j.targetJD) }, apiKeys);
          pending.forEach((j, i) => {
            const emb: number[] = embedData.embeddings?.[i] ?? [];
            if (emb.length > 0) embeddingByJobId.set(j.id, emb);
          });
        } catch (e) {
          console.warn("[store] embed-batch failed — routes will embed individually:", String(e));
        }

        await mapWithConcurrency(pending, 2, async (job) => {
          const jd = job.targetJD;
          const sessionId = `session_${Date.now()}_${job.id}`;
          const preEmbedding = embeddingByJobId.get(job.id);

          try {
            // Stage 1: JD Analysis
            patchJob(job.id, { step: "analyzing", progress: 8, statusNote: "Reading the job description...", error: null, claudeCost: 0 });
            const analyzedData = await post("/api/resume/analyze-jd", { jobDescription: jd }, apiKeys);
            patchJob(job.id, (p) => ({ claudeCost: p.claudeCost + (analyzedData.claudeCost ?? 0) }));
            const { analysis: jdAnalysis } = analyzedData;

            // Stage 2: Semantic Search
            patchJob(job.id, { step: "searching", progress: 18, statusNote: "Searching your resume history..." });
            const searchData = await post("/api/resume/search", {
              jdText: jd,
              companyNames,
              ...(preEmbedding ? { jdEmbedding: preEmbedding } : {}),
            }, apiKeys);
            patchJob(job.id, (p) => ({ claudeCost: p.claudeCost + (searchData.claudeCost ?? 0) }));
            const { plan: reusePlan, topMatches } = searchData;
            patchJob(job.id, { reusePlan, topMatches });

            const pathBDetail = reusePlan.skipTeamResearch
              ? "reusing team research from a similar resume"
              : "running fresh research for this JD";
            const pathLabels: Record<string, string> = {
              A: "Found a very similar resume — adapting it for your new JD",
              B: `Found partial match — ${pathBDetail}`,
              C: "New territory — running full research pipeline",
            };
            patchJob(job.id, { statusNote: pathLabels[reusePlan.path] });

            // PATH A: skip all research
            if (reusePlan.path === "A") {
              patchJob(job.id, { step: "generating", progress: 75, statusNote: "Adapting your resume...", streamingText: "" });
              const genDataA = await streamGenerate({
                candidateName, contactInfo, targetJD: jd,
                companies, teamSelections: reusePlan.referenceResume?.teamSelections ?? {},
                teamResearch: {}, jdAnalysis, education, sessionId, reusePlan,
                referenceResume: reusePlan.referenceResume,
              }, apiKeys, (chunk) => {
                patchJob(job.id, (p) => ({ streamingText: (p.streamingText ?? "") + chunk }));
              });
              patchJob(job.id, (p) => ({ claudeCost: p.claudeCost + (genDataA.claudeCost ?? 0) }));
              patchJob(job.id, { step: "editing", progress: 100, resumeData: genDataA.resume as ResumeData, draftMeta: genDataA.draftMeta as DraftMeta, streamingText: null });
              return;
            }

            // PATH B / C
            let teamSelections = reusePlan.referenceResume?.teamSelections ?? {};
            let teamResearch: Record<string, object> = {};

            if (!reusePlan.skipCompanyOverview) {
              patchJob(job.id, { step: "overview", progress: 38, statusNote: "Researching companies & selecting teams..." });
              const overviewData = await post("/api/resume/overview-and-select", { companies, jdAnalysis }, apiKeys);
              patchJob(job.id, (p) => ({ claudeCost: p.claudeCost + (overviewData.claudeCost ?? 0) }));
              teamSelections = overviewData.selections;
              patchJob(job.id, { teamSelections: overviewData.selections });
            }

            if (!reusePlan.skipTeamResearch) {
              patchJob(job.id, { step: "researching", progress: 60, statusNote: "Researching selected teams..." });
              const teamsToResearch = companies.map((c) => ({
                company: c.name,
                team: (teamSelections as Record<string, { selectedTeam: string }>)[c.name]?.selectedTeam ?? c.name,
                role: c.role,
                startDate: c.startDate,
                endDate: c.endDate,
              }));
              const researchData = await post("/api/resume/research-team", { teams: teamsToResearch }, apiKeys);
              patchJob(job.id, (p) => ({ claudeCost: p.claudeCost + (researchData.claudeCost ?? 0) }));
              teamResearch = researchData.teamResearch;
            }

            patchJob(job.id, { step: "generating", progress: 75, statusNote: "Writing your resume...", streamingText: "" });
            const genData = await streamGenerate({
              candidateName, contactInfo, targetJD: jd,
              companies, teamSelections, teamResearch, jdAnalysis, education, sessionId,
              reusePlan, referenceResume: reusePlan.referenceResume,
              ...(preEmbedding ? { jdEmbedding: preEmbedding } : {}),
            }, apiKeys, (chunk) => {
              patchJob(job.id, (p) => ({ streamingText: (p.streamingText ?? "") + chunk }));
            });
            patchJob(job.id, (p) => ({ claudeCost: p.claudeCost + (genData.claudeCost ?? 0) }));
            patchJob(job.id, { step: "editing", progress: 100, resumeData: genData.resume as ResumeData, draftMeta: genData.draftMeta as DraftMeta, streamingText: null });
          } catch (err) {
            patchJob(job.id, { step: "error", error: String(err) });
          }
        });
      },

      saveJob: async (id: string, editedResume: ResumeData) => {
        const { apiKeys, jobs } = get();
        const job = jobs.find((j) => j.id === id);
        if (!job?.draftMeta) return;
        try {
          const result = await post("/api/resume/save", {
            resumeData: editedResume,
            draftMeta: job.draftMeta,
          }, apiKeys);
          set((s) => ({
            jobs: s.jobs.map((j) =>
              j.id === id
                ? { ...j, step: "done" as const, resumeId: result.resumeId, resumeData: editedResume }
                : j
            ),
          }));
          invalidateHistoryCache();
        } catch (err) {
          set((s) => ({
            jobs: s.jobs.map((j) =>
              j.id === id ? { ...j, step: "error" as const, error: String(err) } : j
            ),
          }));
        }
      },
    }),
    {
      name: "resume-profile",
      version: 3,
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        // Reset any jobs that were mid-pipeline when the page was closed/refreshed
        const IN_PROGRESS: PipelineStep[] = ["analyzing", "searching", "overview", "researching", "generating"];
        state.jobs = state.jobs
          .map((j) =>
            IN_PROGRESS.includes(j.step)
              ? { ...j, step: "error" as const, error: "Session was interrupted — click Retry to regenerate" }
              : j
          )
          .slice(-20); // cap persisted jobs to prevent localStorage bloat
        // Backfill company IDs for profiles saved before the id field was added
        state.profiles = state.profiles.map((p) => ({
          ...p,
          companies: p.companies.map((c, idx) =>
            c.id ? c : { ...c, id: `co_bf_${p.id}_${idx}` }
          ),
        }));
      },
      migrate: (persisted: unknown, version: number) => {
        if (version < 2) {
          const old = persisted as {
            candidateName?: string;
            contactInfo?: string;
            education?: string;
            companies?: Array<{ name: string; startDate: string; endDate: string }>;
            apiKeys?: ApiKeys;
          };
          if (old.candidateName) {
            const p = makeProfile();
            p.label = "My Profile";
            p.candidateName = old.candidateName;
            // Best-effort split of old free-text contactInfo
            const parts = (old.contactInfo ?? "").split(/\s*[·|]\s*/).filter(Boolean);
            p.contact.email    = parts[0] ?? "";
            p.contact.phone    = parts[1] ?? "";
            p.contact.linkedin = parts[2] ?? "";
            p.contact.location = parts[3] ?? "";
            if (old.education) {
              p.educationEntries = [{ id: "edu_migrated", degree: old.education, school: "", year: "" }];
            }
            p.companies = (old.companies ?? []).map((c, idx) => ({ id: `co_migrated_${idx}`, ...c, role: "" }));
            return {
              profiles: [p],
              activeProfileId: p.id,
              apiKeys: old.apiKeys ?? { anthropic: "", tavily: "", voyage: "" },
            };
          }
        }
        return persisted;
      },
      partialize: (state) => ({
        profiles: state.profiles,
        activeProfileId: state.activeProfileId,
        apiKeys: state.apiKeys,
        jobs: state.jobs,
      }),
    }
  )
);
