import { NextResponse } from "next/server";
import {
  isGolfCourseApiConfigured,
  searchGolfCourseApiCourses,
} from "@/lib/golfCourseApi";
import {
  describeFailure,
  toGolfCourseApiFailure,
} from "@/lib/golfCourseApiError";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q")?.trim() ?? "";

  if (query.length < 3) {
    return NextResponse.json({
      configured: isGolfCourseApiConfigured(),
      courses: [],
    });
  }

  if (!isGolfCourseApiConfigured()) {
    return NextResponse.json({
      configured: false,
      courses: [],
      reason: "not_configured",
      error: "GolfCourseAPI key is not configured.",
    });
  }

  try {
    const courses = await searchGolfCourseApiCourses(query);
    return NextResponse.json({ configured: true, courses });
  } catch (error) {
    const failure = toGolfCourseApiFailure(error);
    const { status, message } = describeFailure(failure, "Golf course search");

    // The provider's own explanation only ever lands here, so log it in full —
    // a rejected key and a provider outage look identical from the browser.
    console.error(`GolfCourseAPI search failed (${failure})`, error);

    return NextResponse.json(
      {
        configured: true,
        courses: [],
        reason: failure,
        error: message,
      },
      { status }
    );
  }
}
