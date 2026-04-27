import { isValid, parse as parseDate, parseISO } from "date-fns";

export interface HistoricalImportRow {
  season: number;
  roundDate: Date;
  roundNumber: number | null;
  roundName: string | null;
  courseName: string;
  playerName: string;
  playerHandicap: number;
  stablefordPoints: number;
  ladderPoints: number;
  ntp: boolean;
  ld: boolean;
  t2: boolean;
  t3: boolean;
  sourceRowNumber: number;
}

export interface HistoricalImportRoundGroup {
  key: string;
  season: number;
  roundDate: Date;
  roundNumber: number | null;
  roundName: string | null;
  courseName: string;
  rows: HistoricalImportRow[];
}

export interface ParsedHistoricalImportFile {
  season: number;
  rows: HistoricalImportRow[];
  rounds: HistoricalImportRoundGroup[];
}

export const HISTORICAL_IMPORT_TEMPLATE_HEADERS = [
  "Season",
  "Round date",
  "Round number",
  "Round name",
  "Golf course name",
  "Player name",
  "Player handicap",
  "Stableford points",
  "Ladder points",
  "NTP",
  "LD",
  "T2",
  "T3",
] as const;

type ColumnKey =
  | "season"
  | "roundDate"
  | "roundNumber"
  | "roundName"
  | "courseName"
  | "playerName"
  | "playerHandicap"
  | "stablefordPoints"
  | "ladderPoints"
  | "ntp"
  | "ld"
  | "t2"
  | "t3";

const COLUMN_ALIASES: Record<ColumnKey, string[]> = {
  season: ["season"],
  roundDate: ["rounddate", "date"],
  roundNumber: ["roundnumber", "roundno", "round"],
  roundName: ["roundname", "roundtitle"],
  courseName: ["golfcoursename", "coursename", "course"],
  playerName: ["playername", "membername", "player"],
  playerHandicap: ["playerhandicap", "handicap", "hcp"],
  stablefordPoints: ["stablefordpoints", "stableford", "stbpoints", "stb"],
  ladderPoints: ["ladderpoints", "ladder", "seasonpoints", "pointsawarded"],
  ntp: ["ntp", "nearestthepin"],
  ld: ["ld", "longestdrive"],
  t2: ["t2"],
  t3: ["t3"],
};

export function parseHistoricalImportCsv(
  csvText: string
): ParsedHistoricalImportFile {
  const matrix = parseCsvMatrix(csvText);
  if (matrix.length < 2) {
    throw new Error("The file must include a header row and at least one data row.");
  }

  const header = matrix[0].map((cell) => cell.trim());
  const columnIndexes = resolveColumnIndexes(header);

  const rows: HistoricalImportRow[] = [];
  const roundPlayerKeys = new Set<string>();
  const seasons = new Set<number>();

  for (let rowIndex = 1; rowIndex < matrix.length; rowIndex += 1) {
    const rawRow = matrix[rowIndex];
    if (rawRow.every((cell) => cell.trim() === "")) continue;

    const sourceRowNumber = rowIndex + 1;
    const season = parseInteger(
      readRequiredCell(rawRow, columnIndexes.season, "Season", sourceRowNumber),
      "Season",
      sourceRowNumber
    );
    const roundDate = parseImportDate(
      readRequiredCell(
        rawRow,
        columnIndexes.roundDate,
        "Round date",
        sourceRowNumber
      ),
      sourceRowNumber
    );
    const courseName = readRequiredCell(
      rawRow,
      columnIndexes.courseName,
      "Golf course name",
      sourceRowNumber
    );
    const playerName = readRequiredCell(
      rawRow,
      columnIndexes.playerName,
      "Player name",
      sourceRowNumber
    );
    const playerHandicap = parseNumber(
      readRequiredCell(
        rawRow,
        columnIndexes.playerHandicap,
        "Player handicap",
        sourceRowNumber
      ),
      "Player handicap",
      sourceRowNumber
    );
    const stablefordPoints = parseNumber(
      readRequiredCell(
        rawRow,
        columnIndexes.stablefordPoints,
        "Stableford points",
        sourceRowNumber
      ),
      "Stableford points",
      sourceRowNumber
    );
    const ladderPoints = parseNumber(
      readRequiredCell(
        rawRow,
        columnIndexes.ladderPoints,
        "Ladder points",
        sourceRowNumber
      ),
      "Ladder points",
      sourceRowNumber
    );

    const roundNumberValue = readOptionalCell(rawRow, columnIndexes.roundNumber);
    const roundNameValue = readOptionalCell(rawRow, columnIndexes.roundName);
    const roundNumber =
      roundNumberValue == null || roundNumberValue === ""
        ? null
        : parseInteger(roundNumberValue, "Round number", sourceRowNumber);
    const roundName = roundNameValue?.trim() ? roundNameValue.trim() : null;

    if (roundNumber == null && !roundName) {
      throw new Error(
        `Row ${sourceRowNumber}: provide either Round number or Round name.`
      );
    }

    const row: HistoricalImportRow = {
      season,
      roundDate,
      roundNumber,
      roundName,
      courseName,
      playerName,
      playerHandicap,
      stablefordPoints,
      ladderPoints,
      ntp: parseBooleanCell(readOptionalCell(rawRow, columnIndexes.ntp)),
      ld: parseBooleanCell(readOptionalCell(rawRow, columnIndexes.ld)),
      t2: parseBooleanCell(readOptionalCell(rawRow, columnIndexes.t2)),
      t3: parseBooleanCell(readOptionalCell(rawRow, columnIndexes.t3)),
      sourceRowNumber,
    };

    const roundKey = buildRoundKey(row);
    const playerKey = `${roundKey}::${normaliseLooseKey(playerName)}`;
    if (roundPlayerKeys.has(playerKey)) {
      throw new Error(
        `Row ${sourceRowNumber}: duplicate player "${playerName}" found for the same round.`
      );
    }

    roundPlayerKeys.add(playerKey);
    seasons.add(season);
    rows.push(row);
  }

  if (rows.length === 0) {
    throw new Error("The file does not contain any importable rows.");
  }

  if (seasons.size !== 1) {
    throw new Error("Import one season per file. Mixed seasons were detected.");
  }

  const grouped = new Map<string, HistoricalImportRoundGroup>();
  rows.forEach((row) => {
    const key = buildRoundKey(row);
    const existing = grouped.get(key);
    if (existing) {
      existing.rows.push(row);
      return;
    }

    grouped.set(key, {
      key,
      season: row.season,
      roundDate: row.roundDate,
      roundNumber: row.roundNumber,
      roundName: row.roundName,
      courseName: row.courseName,
      rows: [row],
    });
  });

  const rounds = Array.from(grouped.values()).sort((a, b) => {
    const dateDiff = a.roundDate.getTime() - b.roundDate.getTime();
    if (dateDiff !== 0) return dateDiff;
    if (a.roundNumber != null && b.roundNumber != null) {
      return a.roundNumber - b.roundNumber;
    }
    if (a.roundNumber != null) return -1;
    if (b.roundNumber != null) return 1;
    return (a.roundName ?? "").localeCompare(b.roundName ?? "");
  });

  return {
    season: rows[0].season,
    rows,
    rounds,
  };
}

function resolveColumnIndexes(headerRow: string[]) {
  const indexes: Partial<Record<ColumnKey, number>> = {};

  headerRow.forEach((header, index) => {
    const normalised = normaliseHeader(header);
    (Object.keys(COLUMN_ALIASES) as ColumnKey[]).forEach((key) => {
      if (indexes[key] != null) return;
      if (COLUMN_ALIASES[key].includes(normalised)) {
        indexes[key] = index;
      }
    });
  });

  const missingRequired: string[] = [];
  if (indexes.season == null) missingRequired.push("Season");
  if (indexes.roundDate == null) missingRequired.push("Round date");
  if (indexes.courseName == null) missingRequired.push("Golf course name");
  if (indexes.playerName == null) missingRequired.push("Player name");
  if (indexes.playerHandicap == null) missingRequired.push("Player handicap");
  if (indexes.stablefordPoints == null) missingRequired.push("Stableford points");
  if (indexes.ladderPoints == null) missingRequired.push("Ladder points");
  if (indexes.roundNumber == null && indexes.roundName == null) {
    missingRequired.push("Round number or Round name");
  }

  if (missingRequired.length > 0) {
    throw new Error(
      `Missing required columns: ${missingRequired.join(", ")}.`
    );
  }

  return indexes as Record<ColumnKey, number | undefined>;
}

function readRequiredCell(
  row: string[],
  index: number | undefined,
  label: string,
  rowNumber: number
) {
  const value = readOptionalCell(row, index)?.trim() ?? "";
  if (!value) {
    throw new Error(`Row ${rowNumber}: ${label} is required.`);
  }
  return value;
}

function readOptionalCell(row: string[], index: number | undefined) {
  if (index == null) return null;
  return row[index] ?? null;
}

function parseInteger(value: string, label: string, rowNumber: number) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) {
    throw new Error(`Row ${rowNumber}: ${label} must be a whole number.`);
  }
  return parsed;
}

function parseNumber(value: string, label: string, rowNumber: number) {
  const normalised = value.replace(/,/g, "");
  const parsed = Number(normalised);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Row ${rowNumber}: ${label} must be numeric.`);
  }
  return parsed;
}

function parseBooleanCell(value: string | null) {
  if (!value) return false;
  const normalised = value.trim().toLowerCase();
  return [
    "1",
    "y",
    "yes",
    "true",
    "won",
    "winner",
    "x",
  ].includes(normalised);
}

function parseImportDate(value: string, rowNumber: number) {
  const trimmed = value.trim();
  const excelSerial = Number(trimmed);

  if (Number.isFinite(excelSerial) && /^\d+(\.\d+)?$/.test(trimmed)) {
    const excelEpoch = new Date(Date.UTC(1899, 11, 30));
    const date = new Date(excelEpoch.getTime() + excelSerial * 86400000);
    if (isValid(date)) return date;
  }

  const iso = parseISO(trimmed);
  if (isValid(iso)) return iso;

  const formats = [
    "d/M/yyyy",
    "dd/MM/yyyy",
    "d-M-yyyy",
    "dd-MM-yyyy",
    "d MMM yyyy",
    "dd MMM yyyy",
    "d MMMM yyyy",
    "dd MMMM yyyy",
    "M/d/yyyy",
    "MM/dd/yyyy",
  ];

  for (const formatString of formats) {
    const parsed = parseDate(trimmed, formatString, new Date());
    if (isValid(parsed)) return parsed;
  }

  throw new Error(
    `Row ${rowNumber}: Round date "${value}" is not a supported date. Use YYYY-MM-DD where possible.`
  );
}

function buildRoundKey(row: Pick<
  HistoricalImportRow,
  "season" | "roundDate" | "roundNumber" | "roundName" | "courseName"
>) {
  const identifier =
    row.roundNumber != null
      ? `number:${row.roundNumber}`
      : `name:${normaliseLooseKey(row.roundName ?? "")}`;
  return [
    row.season,
    row.roundDate.toISOString().slice(0, 10),
    normaliseLooseKey(row.courseName),
    identifier,
  ].join("::");
}

function normaliseHeader(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function normaliseLooseKey(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function parseCsvMatrix(input: string) {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = "";
  let inQuotes = false;

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    const next = input[index + 1];

    if (char === "\"") {
      if (inQuotes && next === "\"") {
        currentCell += "\"";
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      currentRow.push(currentCell);
      currentCell = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") {
        index += 1;
      }
      currentRow.push(currentCell);
      rows.push(currentRow);
      currentRow = [];
      currentCell = "";
      continue;
    }

    currentCell += char;
  }

  currentRow.push(currentCell);
  rows.push(currentRow);
  return rows;
}
