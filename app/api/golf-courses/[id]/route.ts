import { NextResponse } from "next/server";
import {
  getGolfCourseApiCourse,
  isGolfCourseApiConfigured,
} from "@/lib/golfCourseApi";
import {
  describeFailure,
  toGolfCourseApiFailure,
} from "@/lib/golfCourseApiError";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const id = Number(params.id);

  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json(
      { configured: isGolfCourseApiConfigured(), course: null },
      { status: 400 }
    );
  }

  if (!isGolfCourseApiConfigured()) {
    return NextResponse.json({
      configured: false,
      course: null,
      reason: "not_configured",
      error: "GolfCourseAPI key is not configured.",
    });
  }

  try {
    const course = await getGolfCourseApiCourse(id);

    if (!course) {
      const { status, message } = describeFailure(
        "not_found",
        "Golf course lookup"
      );

      return NextResponse.json(
        { configured: true, course: null, reason: "not_found", error: message },
        { status }
      );
    }

    return NextResponse.json({ configured: true, course });
  } catch (error) {
    const failure = toGolfCourseApiFailure(error);
    const { status, message } = describeFailure(failure, "Golf course lookup");

    console.error(`GolfCourseAPI course lookup failed (${failure})`, error);

    return NextResponse.json(
      {
        configured: true,
        course: null,
        reason: failure,
        error: message,
      },
      { status }
    );
  }
}
