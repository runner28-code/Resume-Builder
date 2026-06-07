"use client";

import React from "react";
import { stripMd, isRoleHeader, isMetaLine, isDivider, isBullet } from "@/lib/resume-format";

export interface ResumePreviewProps {
  candidateName: string;
  contactInfo: string;
  summary: string;
  workExperience: string;
  skills: string;
  education: string;
}

// ── Section renderers ─────────────────────────────────────────────────────

function PreviewSummary({ text }: { text: string }) {
  const clean = text.replace(/---+/g, "").replace(/\*\*/g, "").trim();
  if (!clean) return null;
  return <p className="text-[9.5pt] leading-relaxed text-[#111827]">{clean}</p>;
}

function PreviewWorkExperience({ text }: { text: string }) {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const blocks: React.ReactElement[] = [];
  let current: React.ReactElement[] = [];
  let introSeen = false;
  let pendingCompany: string | null = null;
  let bk = 0;

  function flush() {
    if (pendingCompany) {
      current.push(
        <div key={`cn_f${bk}`} className="text-[10pt] font-bold text-[#2563eb]">{pendingCompany}</div>
      );
      pendingCompany = null;
    }
    if (current.length) {
      blocks.push(<div key={bk++} className="mb-2.5">{current}</div>);
      current = [];
      introSeen = false;
    }
  }

  lines.forEach((line, i) => {
    if (isDivider(line)) { flush(); return; }

    if (isRoleHeader(line)) {
      flush();
      const clean = stripMd(line);
      const ci = clean.lastIndexOf(", ");
      if (ci > 0) {
        current.push(
          <div key={`rt${i}`} className="text-[10.5pt] font-bold text-[#111827] mb-0.5">
            {clean.slice(0, ci)}
          </div>
        );
        pendingCompany = clean.slice(ci + 2);
      } else {
        current.push(
          <div key={`rt${i}`} className="text-[10.5pt] font-bold text-[#111827] mb-0.5">{clean}</div>
        );
      }
      return;
    }

    if (isMetaLine(line)) {
      const dates = stripMd(line);
      if (pendingCompany) {
        current.push(
          <div key={`cr${i}`} className="flex justify-between items-baseline mb-1">
            <span className="text-[10pt] font-bold text-[#2563eb]">{pendingCompany}</span>
            <span className="text-[9pt] text-[#6b7280] italic">{dates}</span>
          </div>
        );
        pendingCompany = null;
      } else {
        current.push(
          <div key={`m${i}`} className="text-[9pt] text-[#6b7280] italic mb-1">{dates}</div>
        );
      }
      return;
    }

    if (pendingCompany) {
      current.push(
        <div key={`cn${i}`} className="text-[10pt] font-bold text-[#2563eb]">{pendingCompany}</div>
      );
      pendingCompany = null;
    }

    const content = stripMd(line);
    if (!content) return;

    if (!introSeen && !isBullet(line)) {
      introSeen = true;
      current.push(
        <p key={`intro${i}`} className="text-[9.5pt] italic text-[#374151] mb-1 leading-relaxed">
          {content}
        </p>
      );
      return;
    }

    current.push(
      <div key={`b${i}`} className="flex gap-1.5 mb-0.5 pl-1">
        <span className="text-[#111827] shrink-0 mt-px">•</span>
        <span className="text-[9.5pt] text-[#111827] leading-relaxed">{content}</span>
      </div>
    );
  });

  flush();
  return <>{blocks}</>;
}

function PreviewSkills({ text }: { text: string }) {
  const lines = text.split("\n").map((l) => l.trim()).filter((l) => l && !isDivider(l));
  return (
    <>
      {lines.map((line, i) => {
        const m = line.match(/^\*\*([^*]+?):\*?\*\s*(.*)/);
        if (m) {
          return (
            <div key={i} className="text-[9.5pt] leading-snug mb-0.5">
              <span className="font-bold text-[#111827]">{m[1]}: </span>
              <span className="text-[#111827]">{m[2]}</span>
            </div>
          );
        }
        return (
          <div key={i} className="text-[9.5pt] text-[#111827] leading-snug mb-0.5">
            {stripMd(line)}
          </div>
        );
      })}
    </>
  );
}

function PreviewEducation({ text }: { text: string }) {
  const lines = text.split("\n").map((l) => l.trim()).filter((l) => l && !isDivider(l));
  return (
    <>
      {lines.map((line, i) => {
        const bold = /^\*\*[^*]+\*\*$/.test(line);
        return (
          <div key={i} className={`text-[9.5pt] leading-relaxed ${bold ? "font-bold" : ""} text-[#111827]`}>
            {stripMd(line)}
          </div>
        );
      })}
    </>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="font-bold text-[#1e3a5f] border-b border-[#1e3a5f] pb-0.5 mt-3 mb-1.5"
      style={{ fontSize: "10.5pt", letterSpacing: "0.02em" }}
    >
      {children}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────

export function ResumePreview({ candidateName, contactInfo, summary, workExperience, skills, education }: ResumePreviewProps) {
  return (
    <div
      className="bg-white text-[#111827] shadow-md"
      style={{ fontFamily: "Helvetica, Arial, sans-serif", padding: "40px 50px", minHeight: "11in" }}
    >
      {/* Header */}
      <div className="text-center mb-3">
        <div className="font-bold text-[#111827]" style={{ fontSize: "24pt", letterSpacing: "0.03em", marginBottom: "4px" }}>
          {candidateName || "Your Name"}
        </div>
        {contactInfo && (
          <div className="text-[9pt] text-[#6b7280]" style={{ letterSpacing: "0.01em" }}>
            {contactInfo}
          </div>
        )}
      </div>

      <SectionTitle>Summary</SectionTitle>
      <PreviewSummary text={summary} />

      <SectionTitle>Work Experience</SectionTitle>
      <PreviewWorkExperience text={workExperience} />

      <SectionTitle>Skills</SectionTitle>
      <PreviewSkills text={skills} />

      <SectionTitle>Education</SectionTitle>
      <PreviewEducation text={education} />
    </div>
  );
}
