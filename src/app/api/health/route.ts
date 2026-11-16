import { NextResponse } from "next/server";

import { getDbPool } from "@/lib/db";
import { getEnv } from "@/lib/env";

export async function GET() {
  try {
    getEnv();
    await getDbPool().query("select 1");

    return NextResponse.json({
      status: "ok",
      service: "zangyar",
      database: "ok",
    });
  } catch (error) {
    console.error("Health check failed", error);

    return NextResponse.json(
      {
        status: "error",
        service: "zangyar",
        database: "unavailable",
      },
      { status: 503 },
    );
  }
}
