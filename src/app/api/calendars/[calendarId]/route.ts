import { NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";

import { api } from "@/../convex/_generated/api";
import type { Id } from "@/../convex/_generated/dataModel";

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;

export async function GET(
  _request: Request,
  context: { params: { calendarId: string } }
) {
  if (!convexUrl) {
    return NextResponse.json(
      { error: "Convex のエンドポイントが設定されていません。" },
      { status: 500 }
    );
  }

  const { calendarId } = context.params;
  if (!calendarId || typeof calendarId !== "string") {
    return NextResponse.json(
      { error: "カレンダー ID が正しく指定されていません。" },
      { status: 400 }
    );
  }

  const client = new ConvexHttpClient(convexUrl);

  try {
    const calendarDetails = await client.query(api.calendars.getCalendar, {
      calendarId: calendarId as Id<"calendars">,
    });

    if (!calendarDetails) {
      return NextResponse.json(
        { error: "指定されたカレンダーが見つかりませんでした。" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      calendar: calendarDetails.calendar,
      terms: calendarDetails.terms,
      days: calendarDetails.days,
    });
  } catch (error) {
    console.error("Failed to fetch calendar details", error);
    return NextResponse.json(
      { error: "カレンダー情報の取得に失敗しました。" },
      { status: 500 }
    );
  }
}
