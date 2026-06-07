"use client";

import { useState } from "react";
import {
  useResumeStore,
  type Profile,
  type ContactFields,
  type EducationEntry,
  type Company,
} from "@/store/resume-store";

interface Props {
  onClose: () => void;
}

type View = "list" | "edit";

function makeBlankDraft(): Omit<Profile, "id"> {
  return {
    label: "New Profile",
    candidateName: "",
    contact: { email: "", phone: "", linkedin: "", location: "", website: "" },
    educationEntries: [],
    companies: [],
  };
}

function makeBlankEdu(): EducationEntry {
  return {
    id: `edu_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    degree: "",
    school: "",
    year: "",
  };
}

function makeBlankCompany(): Company {
  return { id: `co_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, name: "", role: "", startDate: "", endDate: "" };
}

const inputCls =
  "bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm";
const inputSmCls =
  "bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 text-xs";

export function ProfileModal({ onClose }: Props) {
  const {
    profiles,
    activeProfileId,
    addProfile,
    updateProfile,
    deleteProfile,
    setActiveProfile,
  } = useResumeStore();

  const [view, setView] = useState<View>("list");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Omit<Profile, "id">>(makeBlankDraft());

  function openEdit(profile: Profile | null) {
    if (profile) {
      setEditingId(profile.id);
      setDraft({
        label: profile.label,
        candidateName: profile.candidateName,
        contact: { ...profile.contact },
        educationEntries: profile.educationEntries.map((e) => ({ ...e })),
        companies: profile.companies.map((c) => ({ ...c })),
      });
    } else {
      setEditingId(null);
      setDraft(makeBlankDraft());
    }
    setView("edit");
  }

  function handleSave() {
    if (editingId) {
      updateProfile(editingId, draft);
      setActiveProfile(editingId);
    } else {
      const newId = addProfile();
      updateProfile(newId, draft);
      setActiveProfile(newId);
    }
    setView("list");
  }

  const patchContact = (key: keyof ContactFields, value: string) =>
    setDraft((d) => ({ ...d, contact: { ...d.contact, [key]: value } }));

  const addEdu = () =>
    setDraft((d) => ({ ...d, educationEntries: [...d.educationEntries, makeBlankEdu()] }));

  const removeEdu = (id: string) =>
    setDraft((d) => ({ ...d, educationEntries: d.educationEntries.filter((e) => e.id !== id) }));

  const patchEdu = (id: string, key: keyof Omit<EducationEntry, "id">, value: string) =>
    setDraft((d) => ({
      ...d,
      educationEntries: d.educationEntries.map((e) => (e.id === id ? { ...e, [key]: value } : e)),
    }));

  const addCompany = () =>
    setDraft((d) => ({ ...d, companies: [...d.companies, makeBlankCompany()] }));

  const removeCompany = (id: string) =>
    setDraft((d) => ({ ...d, companies: d.companies.filter((c) => c.id !== id) }));

  const patchCompany = (id: string, key: keyof Omit<Company, "id">, value: string) =>
    setDraft((d) => ({
      ...d,
      companies: d.companies.map((c) => (c.id === id ? { ...c, [key]: value } : c)),
    }));

  const canSave =
    !!draft.candidateName.trim() &&
    draft.companies.length > 0 &&
    draft.companies.every((c) => c.name.trim());

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
          <div className="flex items-center gap-3">
            {view === "edit" && (
              <button
                onClick={() => setView("list")}
                className="text-slate-400 hover:text-white text-sm"
              >
                ← Back
              </button>
            )}
            <h2 className="text-lg font-semibold">
              {view === "list" ? "Profiles" : editingId ? "Edit Profile" : "New Profile"}
            </h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-slate-400 hover:text-white text-xl leading-none"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto px-6 py-5">
          {view === "list" ? (
            <div className="space-y-3">
              {profiles.length === 0 && (
                <p className="text-sm text-slate-400 text-center py-6">
                  No profiles yet. Create one to get started.
                </p>
              )}
              {profiles.map((p) => (
                <div
                  key={p.id}
                  className={`flex items-center gap-3 rounded-xl border px-4 py-3 transition-colors ${
                    p.id === activeProfileId
                      ? "border-indigo-500 bg-indigo-950/40"
                      : "border-slate-700 bg-slate-800/50"
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-white text-sm">{p.label}</span>
                      {p.id === activeProfileId && (
                        <span className="text-xs text-indigo-400 font-semibold bg-indigo-950 px-1.5 py-0.5 rounded">
                          Active
                        </span>
                      )}
                    </div>
                    {p.candidateName && (
                      <div className="text-xs text-slate-400 mt-0.5 truncate">{p.candidateName}</div>
                    )}
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    {p.id !== activeProfileId && (
                      <button
                        onClick={() => setActiveProfile(p.id)}
                        className="text-xs text-indigo-400 hover:text-indigo-300 font-medium"
                      >
                        Use
                      </button>
                    )}
                    <button
                      onClick={() => openEdit(p)}
                      className="text-xs text-slate-400 hover:text-white"
                    >
                      Edit
                    </button>
                    {profiles.length > 1 && (
                      <button
                        onClick={() => deleteProfile(p.id)}
                        className="text-xs text-red-500 hover:text-red-300"
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </div>
              ))}
              <button
                onClick={() => openEdit(null)}
                className="w-full mt-1 py-2.5 rounded-xl border border-dashed border-slate-600 text-sm text-slate-400 hover:text-white hover:border-slate-400 transition-colors"
              >
                + New Profile
              </button>
            </div>
          ) : (
            <div className="space-y-5">
              {/* Profile label */}
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1 uppercase tracking-wide">
                  Profile Name
                </label>
                <input
                  type="text"
                  value={draft.label}
                  onChange={(e) => setDraft((d) => ({ ...d, label: e.target.value }))}
                  placeholder="e.g. Engineering, Product, Remote"
                  className={inputCls + " w-full"}
                />
              </div>

              {/* Personal info */}
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-2 uppercase tracking-wide">
                  Personal Info
                </label>
                <div className="space-y-2">
                  <input
                    type="text"
                    value={draft.candidateName}
                    onChange={(e) => setDraft((d) => ({ ...d, candidateName: e.target.value }))}
                    placeholder="Full Name *"
                    className={inputCls + " w-full"}
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="email"
                      value={draft.contact.email}
                      onChange={(e) => patchContact("email", e.target.value)}
                      placeholder="Email"
                      className={inputCls}
                    />
                    <input
                      type="text"
                      value={draft.contact.phone}
                      onChange={(e) => patchContact("phone", e.target.value)}
                      placeholder="Phone"
                      className={inputCls}
                    />
                    <input
                      type="text"
                      value={draft.contact.linkedin}
                      onChange={(e) => patchContact("linkedin", e.target.value)}
                      placeholder="LinkedIn URL"
                      className={inputCls}
                    />
                    <input
                      type="text"
                      value={draft.contact.location}
                      onChange={(e) => patchContact("location", e.target.value)}
                      placeholder="Location"
                      className={inputCls}
                    />
                  </div>
                  <input
                    type="text"
                    value={draft.contact.website}
                    onChange={(e) => patchContact("website", e.target.value)}
                    placeholder="Website / GitHub"
                    className={inputCls + " w-full"}
                  />
                </div>
              </div>

              {/* Education */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-medium text-slate-400 uppercase tracking-wide">
                    Education
                  </label>
                  <button onClick={addEdu} className="text-xs text-indigo-400 hover:text-indigo-300">
                    + Add Entry
                  </button>
                </div>
                {draft.educationEntries.length === 0 && (
                  <p className="text-xs text-slate-500 italic">No entries yet.</p>
                )}
                <div className="space-y-2">
                  {draft.educationEntries.map((entry) => (
                    <div key={entry.id} className="flex items-center gap-2">
                      <div className="flex-1 grid grid-cols-3 gap-2">
                        <input
                          type="text"
                          value={entry.degree}
                          onChange={(e) => patchEdu(entry.id, "degree", e.target.value)}
                          placeholder="Degree"
                          className={inputSmCls}
                        />
                        <input
                          type="text"
                          value={entry.school}
                          onChange={(e) => patchEdu(entry.id, "school", e.target.value)}
                          placeholder="School"
                          className={inputSmCls}
                        />
                        <input
                          type="text"
                          value={entry.year}
                          onChange={(e) => patchEdu(entry.id, "year", e.target.value)}
                          placeholder="Year"
                          className={inputSmCls}
                        />
                      </div>
                      <button
                        onClick={() => removeEdu(entry.id)}
                        className="text-red-500 hover:text-red-300 text-xs shrink-0"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Work Experience */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-medium text-slate-400 uppercase tracking-wide">
                    Work Experience *
                  </label>
                  <button onClick={addCompany} className="text-xs text-indigo-400 hover:text-indigo-300">
                    + Add Company
                  </button>
                </div>
                {draft.companies.length === 0 && (
                  <p className="text-xs text-slate-500 italic">No companies yet.</p>
                )}
                <div className="space-y-2">
                  {draft.companies.map((c) => (
                    <div
                      key={c.id}
                      className="p-3 bg-slate-800/60 rounded-lg border border-slate-700 space-y-2"
                    >
                      <div className="flex items-start gap-2">
                        <div className="flex-1 grid grid-cols-2 gap-2">
                          <input
                            type="text"
                            value={c.name}
                            onChange={(e) => patchCompany(c.id, "name", e.target.value)}
                            placeholder="Company name"
                            className={inputSmCls}
                          />
                          <input
                            type="text"
                            value={c.role}
                            onChange={(e) => patchCompany(c.id, "role", e.target.value)}
                            placeholder="Job title / Role"
                            className={inputSmCls}
                          />
                        </div>
                        <button
                          onClick={() => removeCompany(c.id)}
                          className="text-red-500 hover:text-red-300 text-xs shrink-0 mt-1"
                        >
                          ✕
                        </button>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          type="text"
                          value={c.startDate}
                          onChange={(e) => patchCompany(c.id, "startDate", e.target.value)}
                          placeholder="Start (e.g. Jan 2020)"
                          className={inputSmCls}
                        />
                        <input
                          type="text"
                          value={c.endDate}
                          onChange={(e) => patchCompany(c.id, "endDate", e.target.value)}
                          placeholder="End (e.g. Dec 2023)"
                          className={inputSmCls}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-800 flex justify-end gap-3">
          {view === "list" ? (
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-slate-400 hover:text-white transition-colors"
            >
              Done
            </button>
          ) : (
            <>
              <button
                onClick={() => setView("list")}
                className="px-4 py-2 text-sm text-slate-400 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={!canSave}
                className="px-5 py-2 rounded-lg text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Save & Use
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
