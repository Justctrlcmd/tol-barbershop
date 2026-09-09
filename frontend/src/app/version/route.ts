import { NextResponse } from "next/server";

import { CURRENT_BUILD_VERSION } from "@/lib/deployment-version";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export function GET() {
  return NextResponse.json(
    { version: CURRENT_BUILD_VERSION },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
        Expires: "0",
        Pragma: "no-cache",
      },
    },
  );
}
