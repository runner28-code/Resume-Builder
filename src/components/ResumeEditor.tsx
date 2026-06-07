"use client";

import { useEffect, useRef, useState } from "react";
import React from "react";
import { stripMd, isDivider } from "@/lib/resume-format";
import { parseWorkExperience } from "@/lib/work-experience-parser";

export interface ResumeEditorProps {
  candidateName: string;
  contactInfo: string;
  summary: string;
  workExperience: string;
  skills: string;
  education: string;
  onChange: (field: "summary" | "workExperience" | "skills" | "education", value: string) => void;
}

// ── Preview renderers ─────────────────────────────────────────────────────

function RenderSummary({ text }: { text: string }) {
  const clean = text.replace(/---+/g, "").replace(/\*\*/g, "").trim();
  if (!clean) return <span style={{ color: "#9ca3af", fontStyle: "italic" }}>Click to edit summary…</span>;
  return <p style={{ fontSize: "9.5pt", lineHeight: 1.6, color: "#111827" }}>{clean}</p>;
}

function RenderWorkExperience({ text }: { text: string }) {
  if (!text.trim()) return <span style={{ color: "#9ca3af", fontStyle: "italic" }}>Click to edit work experience…</span>;
  const roles = parseWorkExperience(text);
  return (
    <>
      {roles.map((role, ri) => (
        <div key={ri} style={{ marginBottom: "9px" }}>
          <div style={{ fontSize: "10.5pt", fontWeight: "bold", color: "#111827", marginBottom: "2px" }}>{role.title}</div>
          {role.companyName && role.dates ? (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "3px" }}>
              <span style={{ fontSize: "10pt", fontWeight: "bold", color: "#2563eb" }}>{role.companyName}</span>
              <span style={{ fontSize: "9pt", color: "#6b7280", fontStyle: "italic" }}>{role.dates}</span>
            </div>
          ) : role.companyName ? (
            <div style={{ fontSize: "10pt", fontWeight: "bold", color: "#2563eb" }}>{role.companyName}</div>
          ) : role.dates ? (
            <div style={{ fontSize: "9pt", color: "#6b7280", fontStyle: "italic", marginBottom: "3px" }}>{role.dates}</div>
          ) : null}
          {role.intro && (
            <p style={{ fontSize: "9.5pt", fontStyle: "italic", color: "#374151", marginBottom: "4px", lineHeight: 1.5 }}>{role.intro}</p>
          )}
          {role.bullets.map((bullet, bi) => (
            <div key={bi} style={{ display: "flex", gap: "6px", marginBottom: "2.5px", paddingLeft: "4px" }}>
              <span style={{ color: "#111827", flexShrink: 0, marginTop: "1px" }}>•</span>
              <span style={{ fontSize: "9.5pt", color: "#111827", lineHeight: 1.5 }}>{bullet}</span>
            </div>
          ))}
        </div>
      ))}
    </>
  );
}

function RenderSkills({ text }: { text: string }) {
  if (!text.trim()) return <span style={{ color: "#9ca3af", fontStyle: "italic" }}>Click to edit skills…</span>;
  const lines = text.split("\n").map(l => l.trim()).filter(l => l && !isDivider(l));
  return (
    <>
      {lines.map((line, i) => {
        const m = line.match(/^\*\*([^*]+?):\*?\*\s*(.*)/);
        if (m) return (
          <div key={i} style={{ fontSize: "9.5pt", lineHeight: 1.55, marginBottom: "3px" }}>
            <span style={{ fontWeight: "bold", color: "#111827" }}>{m[1]}: </span>
            <span style={{ color: "#111827" }}>{m[2]}</span>
          </div>
        );
        return <div key={i} style={{ fontSize: "9.5pt", color: "#111827", lineHeight: 1.55, marginBottom: "3px" }}>{stripMd(line)}</div>;
      })}
    </>
  );
}

function RenderEducation({ text }: { text: string }) {
  if (!text.trim()) return <span style={{ color: "#9ca3af", fontStyle: "italic" }}>Click to edit education…</span>;
  const lines = text.split("\n").map(l => l.trim()).filter(l => l && !isDivider(l));
  return (
    <>
      {lines.map((line, i) => {
        const bold = /^\*\*[^*]+\*\*$/.test(line);
        return (
          <div key={i} style={{ fontSize: "9.5pt", lineHeight: 1.6, fontWeight: bold ? "bold" : "normal", color: "#111827", marginBottom: "1px" }}>
            {stripMd(line)}
          </div>
        );
      })}
    </>
  );
}

// ── Editable section ──────────────────────────────────────────────────────

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: "10.5pt", fontWeight: "bold", color: "#1e3a5f",
      borderBottom: "1px solid #1e3a5f", paddingBottom: "2px",
      marginTop: "12px", marginBottom: "6px", letterSpacing: "0.02em",
    }}>
      {children}
    </div>
  );
}

function EditableSection({
  title,
  value,
  onChange,
  renderPreview,
}: {
  title: string;
  value: string;
  onChange: (v: string) => void;
  renderPreview: () => React.ReactNode;
}) {
  const [editing, setEditing] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (editing && ref.current) {
      ref.current.style.height = "auto";
      ref.current.style.height = ref.current.scrollHeight + "px";
      ref.current.focus();
    }
  }, [editing]);

  useEffect(() => {
    if (editing && ref.current) {
      ref.current.style.height = "auto";
      ref.current.style.height = ref.current.scrollHeight + "px";
    }
  }, [value, editing]);

  return (
    <div>
      <SectionTitle>{title}</SectionTitle>
      {editing ? (
        <textarea
          ref={ref}
          value={value}
          onChange={e => onChange(e.target.value)}
          onBlur={() => setEditing(false)}
          rows={1}
          style={{
            width: "100%", background: "transparent", border: "none",
            outline: "1px dashed #c7d2fe", borderRadius: "2px",
            resize: "none", overflow: "hidden", padding: "4px",
            fontFamily: "Helvetica, Arial, sans-serif",
            fontSize: "9.5pt", color: "#111827", lineHeight: 1.5,
          }}
        />
      ) : (
        <div
          onClick={() => setEditing(true)}
          title="Click to edit"
          style={{ cursor: "text", borderRadius: "2px", padding: "2px" }}
          className="hover:ring-1 hover:ring-indigo-300 hover:ring-offset-0 transition-all"
        >
          {renderPreview()}
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────

export function ResumeEditor({ candidateName, contactInfo, summary, workExperience, skills, education, onChange }: ResumeEditorProps) {
  return (
    <div
      className="bg-white"
      style={{ fontFamily: "Helvetica, Arial, sans-serif", fontSize: "10pt", color: "#111827", padding: "40px 50px", minHeight: "11in", lineHeight: 1.5 }}
    >
      {/* Header — read-only */}
      <div style={{ textAlign: "center", marginBottom: "12px" }}>
        <div style={{ fontSize: "26pt", fontWeight: "bold", color: "#111827", letterSpacing: "0.5px", marginBottom: "4px" }}>
          {candidateName || "Your Name"}
        </div>
        {contactInfo && (
          <div style={{ fontSize: "9pt", color: "#6b7280", letterSpacing: "0.1px" }}>{contactInfo}</div>
        )}
      </div>

      <EditableSection title="Summary" value={summary} onChange={v => onChange("summary", v)}
        renderPreview={() => <RenderSummary text={summary} />} />

      <EditableSection title="Work Experience" value={workExperience} onChange={v => onChange("workExperience", v)}
        renderPreview={() => <RenderWorkExperience text={workExperience} />} />

      <EditableSection title="Skills" value={skills} onChange={v => onChange("skills", v)}
        renderPreview={() => <RenderSkills text={skills} />} />

      <EditableSection title="Education" value={education} onChange={v => onChange("education", v)}
        renderPreview={() => <RenderEducation text={education} />} />
    </div>
  );
}
