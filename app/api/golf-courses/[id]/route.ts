import { NextResponse } from "next/server";
import {
  getGolfCourseApiCourse,
  isGolfCourseApiConfigured,
} from "@/lib/golfCourseApi";

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
      error: "GolfCourseAPI key is not configured.",
    });
  }

  try {
    const course = await getGolfCourseApiCourse(id);
    return NextResponse.json({ configured: true, course });
  } catch (error) {
    console.error("GolfCourseAPI course lookup failed", error);
    return NextResponse.json(
      {
        configured: true,
        course: null,
        error: "Golf course details are unavailable right now.",
      },
      { status: 502 }
    );
  }
}
