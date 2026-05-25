"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import { getMembersForGroup } from "@/lib/firestore";
import {
  parseHistoricalImportCsv,
  normaliseLooseKey,
  HISTORICAL_IMPORT_TEMPLATE_HEADERS,
} from "@/lib/historicalImport";
import { importHistoricalRoundsToFirestore } from "@/lib/historicalImportFirestore";
import type { Member } from "@/types";
import type {
  ParsedHistoricalImportFile,
  HistoricalImportRoundGroup,
} from "@/lib/historicalImport";
import type { MemberMapping } from "@/lib/historicalImportFirestore";
import { format } from "date-fns";

type Step = "upload" | "review" | "importing" | "done";

export default function ImportHistoricalRoundsPage() {
  const { appUser } = useAuth();
  const [step, setStep] = useState<Step>("upload");
  const [members, setMembers] = useState<Member[]>([]);
  const [parseError, setParseError] = useState("");
  const [parsed, setParsed] = useState<ParsedHistoricalImportFile | null>(null);
  const [nameMap, setNameMap] = useState<Record<string, string>>({}); // normName → memberId
  const [importError, setImportError] = useState("");
  const [importedCount, setImportedCount] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!appUser?.groupId) return;
    getMembersForGroup(appUser.groupId)
      .then(setMembers)
      .catch(() => {});
  }, [appUser?.groupId]);

  const memberById = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);
  const memberByNorm = useMemo(
    () => new Map(members.map((m) => [normaliseLooseKey(m.displayName), m])),
    [members]
  );

  const handleFile = useCallback(
    async (file: File) => {
      setParseError("");
      setParsed(null);
      try {
        let csvText: string;
        if (file.name.endsWith(".xlsx") || file.name.endsWith(".xls")) {
          const XLSX = await import("xlsx");
          const buffer = await file.arrayBuffer();
          const wb = XLSX.read(buffer, { type: "array", cellDates: false });
          const sheet = wb.Sheets[wb.SheetNames[0]];
          csvText = XLSX.utils.sheet_to_csv(sheet, { blankrows: false });
        } else {
          csvText = await file.text();
        }
        const result = parseHistoricalImportCsv(csvText);
        setParsed(result);

        // Auto-resolve names
        const initial: Record<string, string> = {};
        const uniqueNames = new Set(result.rows.map((r) => r.playerName));
        uniqueNames.forEach((name) => {
          const norm = normaliseLooseKey(name);
          const match = memberByNorm.get(norm);
          if (match) initial[norm] = match.id;
        });
        setNameMap(initial);

        setStep("review");
      } catch (err) {
        setParseError(err instanceof Error ? err.message : "Failed to parse file.");
      }
    },
    [memberByNorm]
  );

  const uniqueImportNames = parsed
    ? Array.from(new Set(parsed.rows.map((r) => r.playerName)))
    : [];

  const allNamesMapped = uniqueImportNames.every(
    (name) => !!nameMap[normaliseLooseKey(name)]
  );

  const buildMemberMapping = (): MemberMapping => {
    const map: MemberMapping = new Map();
    for (const [norm, id] of Object.entries(nameMap)) {
      const member = memberById.get(id);
      if (member) map.set(norm, member);
    }
    return map;
  };

  const handleImport = async () => {
    if (!appUser || !parsed) return;
    setStep("importing");
    setImportError("");
    try {
      const memberMapping = buildMemberMapping();
      const result = await importHistoricalRoundsToFirestore({
        groupId: appUser.groupId,
        parsed,
        memberMapping,
        adminUser: appUser,
      });
      setImportedCount(result.imported);
      setStep("done");
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "Import failed.");
      setStep("review");
    }
  };

  const templateCsv = [
    HISTORICAL_IMPORT_TEMPLATE_HEADERS.join(","),
    "2025,2025-03-15,1,,Royal Melbourne,113,71.5,72,John Smith,18,34,10,Yes,,,",
    "2025,2025-03-15,1,,Royal Melbourne,113,71.5,72,Jane Doe,15,31,8,,Yes,,",
  ].join("\n");

  const downloadTemplate = () => {
    const blob = new Blob([templateCsv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "historical_import_template.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center gap-3">
        <Link
          href="/admin/rounds"
          className="text-ink-muted hover:text-ink-body transition-colors text-sm"
        >
          ← Rounds
        </Link>
      </div>

      <div>
        <h1 className="text-2xl font-bold text-ink-title">Import historical rounds</h1>
        <p className="text-sm text-ink-muted mt-1">
          Upload a CSV or XLSX file to seed the season with past round data.
        </p>
      </div>

      {step === "upload" && (
        <UploadStep
          fileRef={fileRef}
          parseError={parseError}
          onFile={handleFile}
          onDownloadTemplate={downloadTemplate}
        />
      )}

      {step === "review" && parsed && (
        <ReviewStep
          parsed={parsed}
          members={members}
          nameMap={nameMap}
          onNameMap={(norm, memberId) =>
            setNameMap((prev) => ({ ...prev, [norm]: memberId }))
          }
          uniqueImportNames={uniqueImportNames}
          allNamesMapped={allNamesMapped}
          importError={importError}
          onBack={() => {
            setStep("upload");
            setParsed(null);
            if (fileRef.current) fileRef.current.value = "";
          }}
          onImport={handleImport}
        />
      )}

      {step === "importing" && (
        <div className="bg-surface-card border border-surface-overlay rounded-2xl p-8 text-center">
          <div className="animate-pulse text-4xl mb-3">⏳</div>
          <p className="text-ink-body font-medium">Importing rounds…</p>
          <p className="text-ink-muted text-sm mt-1">This may take a moment.</p>
        </div>
      )}

      {step === "done" && (
        <div className="bg-surface-card border border-surface-overlay rounded-2xl p-8 text-center space-y-4">
          <div className="text-4xl">✅</div>
          <p className="text-ink-title font-semibold text-lg">
            {importedCount} round{importedCount !== 1 ? "s" : ""} imported
          </p>
          <p className="text-ink-muted text-sm">
            Season standings and member stats have been updated.
          </p>
          <Link
            href="/admin/rounds"
            className="inline-block bg-brand-600 text-white text-sm font-semibold px-5 py-2.5 rounded-xl"
          >
            Back to rounds
          </Link>
        </div>
      )}
    </div>
  );
}

function UploadStep({
  fileRef,
  parseError,
  onFile,
  onDownloadTemplate,
}: {
  fileRef: React.RefObject<HTMLInputElement>;
  parseError: string;
  onFile: (file: File) => void;
  onDownloadTemplate: () => void;
}) {
  const [dragging, setDragging] = useState(false);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) onFile(file);
  };

  return (
    <div className="space-y-4">
      <div
        className={`border-2 border-dashed rounded-2xl p-10 text-center transition-colors ${
          dragging
            ? "border-brand-500 bg-brand-50"
            : "border-surface-overlay bg-surface-card"
        }`}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
      >
        <div className="text-3xl mb-3">📂</div>
        <p className="text-ink-body font-medium mb-1">Drop your file here</p>
        <p className="text-ink-muted text-sm mb-4">CSV or XLSX — one season per file</p>
        <label className="cursor-pointer inline-block bg-brand-600 text-white text-sm font-semibold px-5 py-2.5 rounded-xl hover:bg-brand-700 transition-colors">
          Choose file
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.xlsx,.xls"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onFile(file);
            }}
          />
        </label>
      </div>

      {parseError && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">
          {parseError}
        </div>
      )}

      <div className="bg-surface-muted rounded-2xl p-4 space-y-2 text-sm text-ink-muted">
        <p className="font-medium text-ink-body">Required columns</p>
        <p>Season · Round date · Round number or Round name · Golf course name · Player name · Player handicap · Stableford points · Ladder points</p>
        <p className="font-medium text-ink-body mt-2">Optional columns</p>
        <p>Slope · Course rating · Par · NTP · LD · T2 · T3</p>
        <button
          onClick={onDownloadTemplate}
          className="text-brand-600 font-medium hover:underline mt-2 block"
        >
          Download template CSV
        </button>
      </div>
    </div>
  );
}

function ReviewStep({
  parsed,
  members,
  nameMap,
  onNameMap,
  uniqueImportNames,
  allNamesMapped,
  importError,
  onBack,
  onImport,
}: {
  parsed: ParsedHistoricalImportFile;
  members: Member[];
  nameMap: Record<string, string>;
  onNameMap: (norm: string, memberId: string) => void;
  uniqueImportNames: string[];
  allNamesMapped: boolean;
  importError: string;
  onBack: () => void;
  onImport: () => void;
}) {
  return (
    <div className="space-y-6">
      <div className="bg-surface-card border border-surface-overlay rounded-2xl p-4">
        <p className="text-sm font-medium text-ink-body mb-1">Ready to import</p>
        <p className="text-ink-muted text-sm">
          {parsed.rounds.length} round{parsed.rounds.length !== 1 ? "s" : ""} ·{" "}
          {parsed.rows.length} player entries · Season {parsed.season}
        </p>
      </div>

      <div>
        <h2 className="text-base font-semibold text-ink-title mb-3">Member mapping</h2>
        <div className="space-y-2">
          {uniqueImportNames.map((name) => {
            const norm = normaliseLooseKey(name);
            const selectedId = nameMap[norm] ?? "";
            const isMatched = !!selectedId;
            return (
              <div
                key={name}
                className="flex items-center gap-3 bg-surface-card border border-surface-overlay rounded-xl px-4 py-3"
              >
                <span
                  className={`w-2 h-2 rounded-full flex-shrink-0 ${
                    isMatched ? "bg-green-500" : "bg-amber-400"
                  }`}
                />
                <span className="text-sm text-ink-body flex-1">{name}</span>
                <select
                  value={selectedId}
                  onChange={(e) => onNameMap(norm, e.target.value)}
                  className="text-sm rounded-lg border border-surface-overlay bg-surface-card px-2 py-1.5 text-ink-body focus:outline-none focus:ring-2 focus:ring-brand-500"
                >
                  <option value="">— select member —</option>
                  {members
                    .slice()
                    .sort((a, b) => a.displayName.localeCompare(b.displayName))
                    .map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.displayName}
                      </option>
                    ))}
                </select>
              </div>
            );
          })}
        </div>
        {!allNamesMapped && (
          <p className="text-amber-600 text-xs mt-2">
            Map all names before importing.
          </p>
        )}
      </div>

      <div>
        <h2 className="text-base font-semibold text-ink-title mb-3">Rounds preview</h2>
        <div className="space-y-3">
          {parsed.rounds.map((group) => (
            <RoundPreviewCard key={group.key} group={group} />
          ))}
        </div>
      </div>

      {importError && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">
          {importError}
        </div>
      )}

      <div className="flex gap-3">
        <button
          onClick={onBack}
          className="flex-1 border border-surface-overlay text-ink-body text-sm font-semibold py-2.5 rounded-xl hover:bg-surface-muted transition-colors"
        >
          Back
        </button>
        <button
          onClick={onImport}
          disabled={!allNamesMapped}
          className="flex-1 bg-brand-600 text-white text-sm font-semibold py-2.5 rounded-xl hover:bg-brand-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Import {parsed.rounds.length} round{parsed.rounds.length !== 1 ? "s" : ""}
        </button>
      </div>
    </div>
  );
}

function RoundPreviewCard({ group }: { group: HistoricalImportRoundGroup }) {
  const sortedRows = [...group.rows].sort(
    (a, b) => b.stablefordPoints - a.stablefordPoints
  );

  const roundLabel = group.roundNumber != null
    ? `Round ${group.roundNumber}`
    : (group.roundName ?? "");

  return (
    <div className="bg-surface-card border border-surface-overlay rounded-2xl p-4 space-y-3">
      <div className="flex items-start justify-between">
        <div>
          <p className="font-semibold text-ink-title text-sm">{group.courseName}</p>
          <p className="text-ink-muted text-xs">
            {format(group.roundDate, "EEE d MMM yyyy")}
            {roundLabel ? ` · ${roundLabel}` : ""}
          </p>
        </div>
        {(group.slope != null || group.cr != null || group.par != null) && (
          <div className="text-xs text-ink-hint text-right">
            {group.slope != null && <span className="mr-1">Slope {group.slope}</span>}
            {group.cr != null && <span className="mr-1">CR {group.cr}</span>}
            {group.par != null && <span>Par {group.par}</span>}
          </div>
        )}
      </div>
      <table className="w-full text-xs text-ink-muted">
        <thead>
          <tr className="text-left border-b border-surface-overlay">
            <th className="pb-1 font-medium">Player</th>
            <th className="pb-1 font-medium text-right">HCP</th>
            <th className="pb-1 font-medium text-right">Stableford</th>
            <th className="pb-1 font-medium text-right">Ladder pts</th>
          </tr>
        </thead>
        <tbody>
          {sortedRows.map((row) => (
            <tr key={row.playerName} className="border-b border-surface-overlay last:border-0">
              <td className="py-1 text-ink-body">{row.playerName}</td>
              <td className="py-1 text-right">{row.playerHandicap}</td>
              <td className="py-1 text-right font-medium text-ink-body">{row.stablefordPoints}</td>
              <td className="py-1 text-right">{row.ladderPoints}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
