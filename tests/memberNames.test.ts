import test from "node:test";
import assert from "node:assert/strict";
import {
  isPlaceholderPlayerName,
  placeholderPlayerName,
  resolveMemberSnapshotName,
  assertRankingsHaveRealNames,
} from "../lib/memberNames.ts";

const UID = "xGQb7wpPlMX88aIqZMQA6xYFRFy1";

test("recognises the generated placeholder name", () => {
  assert.equal(placeholderPlayerName(UID), "Player xGQb7w");
  assert.equal(isPlaceholderPlayerName("Player xGQb7w"), true);
  assert.equal(isPlaceholderPlayerName("Greg Faulkner"), false);
  // a real member who happens to be called Player should not trip it
  assert.equal(isPlaceholderPlayerName("Player One"), false);
  assert.equal(isPlaceholderPlayerName(null), false);
});

test("member snapshot name prefers the user record, then the member record", () => {
  assert.equal(
    resolveMemberSnapshotName({
      standingName: "Player xGQb7w",
      userName: "Greg Faulkner",
      memberName: "Greg F",
    }),
    "Greg Faulkner"
  );
  assert.equal(
    resolveMemberSnapshotName({
      standingName: "Player xGQb7w",
      userName: undefined,
      memberName: "Greg Faulkner",
    }),
    "Greg Faulkner"
  );
  assert.equal(
    resolveMemberSnapshotName({
      standingName: "Greg Faulkner",
      userName: undefined,
      memberName: undefined,
    }),
    "Greg Faulkner"
  );
});

test("never returns a placeholder — the caller must leave displayName alone", () => {
  // this is round 9: the ranking carried a placeholder and so did the member doc
  assert.equal(
    resolveMemberSnapshotName({
      standingName: "Player xGQb7w",
      userName: undefined,
      memberName: "Player xGQb7w",
    }),
    undefined
  );
});

test("publishing a round whose rankings lost their names is refused", () => {
  const bad = [
    { playerId: UID, playerName: "Player xGQb7w" },
    { playerId: "abc123def456", playerName: "Ash Grybas" },
  ];
  assert.throws(
    () => assertRankingsHaveRealNames(bad),
    /Player xGQb7w/,
    "expected publish to be blocked when a name could not be resolved"
  );
  assert.doesNotThrow(() =>
    assertRankingsHaveRealNames([
      { playerId: UID, playerName: "Greg Faulkner" },
      { playerId: "abc123def456", playerName: "Ash Grybas" },
    ])
  );
});

test("an empty member list cannot silently publish placeholder names", () => {
  const rankings = ["a1b2c3d4e5f6", "f6e5d4c3b2a1"].map((id) => ({
    playerId: id,
    playerName: placeholderPlayerName(id),
  }));
  assert.throws(() => assertRankingsHaveRealNames(rankings), /2 player/);
});
