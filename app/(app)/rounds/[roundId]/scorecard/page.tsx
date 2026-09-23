"use client";

import { useParams } from "next/navigation";
import ScorecardScreen from "@/components/scorecard/ScorecardScreen";

export default function ScorecardPage() {
  const { roundId } = useParams<{ roundId: string }>();
  return <ScorecardScreen roundId={roundId} />;
}
