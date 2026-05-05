import type { Group, Round } from "@/types";

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-gray-500">{label}</span>
      <span className="font-medium text-gray-800">{value}</span>
    </div>
  );
}

type Props = {
  round: Round;
  group: Group | null;
};

export default function RoundInfoSection({ round, group }: Props) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 space-y-2">
      <h2 className="font-semibold text-gray-800 mb-2">Round Info</h2>
      <InfoRow
        label="Format"
        value={round.format === "stableford" ? "Stableford" : "Stroke Play"}
      />
      <InfoRow label="Tee set" value={round.teeSetName || "Custom"} />
      <InfoRow
        label="Course par"
        value={round.coursePar?.toString() || "Not set"}
      />
      <InfoRow
        label="Course rating"
        value={round.courseRating?.toString() || "Not set"}
      />
      <InfoRow
        label="Slope rating"
        value={round.slopeRating?.toString() || "Not set"}
      />
      <InfoRow
        label="Handicap mode"
        value={
          group?.settings?.handicapMode === "slope_adjusted"
            ? "Slope adjusted"
            : "Local"
        }
      />
      <InfoRow
        label="NTP holes"
        value={round.specialHoles.ntp.join(", ") || "None set"}
      />
      <InfoRow
        label="LD hole"
        value={round.specialHoles.ld?.toString() || "None set"}
      />
      <InfoRow
        label="T2 hole"
        value={round.specialHoles.t2?.toString() || "None set"}
      />
      <InfoRow
        label="T3 hole"
        value={round.specialHoles.t3?.toString() || "None set"}
      />
    </div>
  );
}
