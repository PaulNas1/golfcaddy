import { NextResponse } from "next/server";
import {
  isGolfCourseApiConfigured,
  searchGolfCourseApiCourses,
} from "@/lib/golfCourseApi";

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
      error: "GolfCourseAPI key is not configured.",
    });
  }

  try {
    const courses = await searchGolfCourseApiCourses(query);
    return NextResponse.json({ configured: true, courses });
  } catch (error) {
    console.error("GolfCourseAPI search failed", error);
    return NextResponse.json(
      {
        configured: true,
        courses: [],
        error: "Golf course search is unavailable right now.",
      },
      { status: 502 }
    );
  }
}
