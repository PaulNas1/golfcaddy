import test from "node:test";
import assert from "node:assert/strict";
import {
  parseHistoricalImportCsv,
  normaliseLooseKey,
} from "../lib/historicalImport.ts";

test("parses a valid historical import file and groups rows into rounds", () => {
  const parsed = parseHistoricalImportCsv(`Season,Round date,Round number,Golf course name,Player name,Player handicap,Stableford points,Ladder points,NTP,LD,T2,T3
2025,2025-03-01,1,Royal Melbourne,Alex Green,12,36,10,Yes,,, 
2025,2025-03-01,1,Royal Melbourne,Blake Stone,18,33,8,,Yes,,
2025,2025-03-15,2,Royal Melbourne,Alex Green,11,34,9,,,Yes,
2025,2025-03-15,2,Royal Melbourne,Blake Stone,17,30,7,,,,Yes
`);

  assert.equal(parsed.season, 2025);
  assert.equal(parsed.rows.length, 4);
  assert.equal(parsed.rounds.length, 2);
  assert.equal(parsed.rounds[0].roundNumber, 1);
  assert.equal(parsed.rounds[0].rows.length, 2);
  assert.equal(parsed.rounds[0].rows[0].ntp, true);
  assert.equal(parsed.rounds[0].rows[1].ld, true);
  assert.equal(parsed.rounds[1].rows[0].t2, true);
  assert.equal(parsed.rounds[1].rows[1].t3, true);
});

test("accepts round-name imports when no round number is present", () => {
  const parsed = parseHistoricalImportCsv(`Season,Round date,Round name,Golf course name,Player name,Player handicap,Stableford points,Ladder points
2024,14/09/2024,Club Championship Final,Kingston Heath,Alex Green,10,37,12
2024,14/09/2024,Club Championship Final,Blake Stone,15,31,8
`);

  assert.equal(parsed.rounds.length, 1);
  assert.equal(parsed.rounds[0].roundNumber, null);
  assert.equal(parsed.rounds[0].roundName, "Club Championship Final");
});

test("rejects mixed seasons in a single file", () => {
  assert.throws(
    () =>
      parseHistoricalImportCsv(`Season,Round date,Round number,Golf course name,Player name,Player handicap,Stableford points,Ladder points
2024,2024-01-01,1,Royal Melbourne,Alex Green,12,36,10
2025,2025-01-08,1,Royal Melbourne,Alex Green,11,35,9
`),
    /Import one season per file/
  );
});

test("rejects duplicate player rows for the same round", () => {
  assert.throws(
    () =>
      parseHistoricalImportCsv(`Season,Round date,Round number,Golf course name,Player name,Player handicap,Stableford points,Ladder points
2025,2025-01-01,1,Royal Melbourne,Alex Green,12,36,10
2025,2025-01-01,1,Royal Melbourne,Alex Green,12,35,8
`),
    /duplicate player/i
  );
});

test("normalises loose keys for matching", () => {
  assert.equal(normaliseLooseKey("  Alex   Green "), "alex green");
});
