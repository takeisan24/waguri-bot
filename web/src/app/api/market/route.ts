import { NextResponse } from "next/server";
import { getLiveMarketPrices, getNextShiftCountdown } from "../../../lib/market";

export const revalidate = 60; // Cache 60s

export async function GET() {
  try {
    const prices = await getLiveMarketPrices();
    const countdown = getNextShiftCountdown();
    return NextResponse.json({
      success: true,
      countdown,
      prices,
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json({ success: false, error: "FAILED_TO_LOAD_MARKET" }, { status: 500 });
  }
}
