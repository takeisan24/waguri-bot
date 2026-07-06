// web/src/app/dashboard/pass/page.tsx
import React from "react";
import { redirect } from "next/navigation";
import { createClient } from "../../../lib/supabase/server";
import { createAdminClient } from "../../../lib/supabase/admin";
import { getDiscordIdentity } from "../../../lib/discord";
import { getCurrentSeasonId, getSeasonLabel } from "../../../lib/game";
import BattlePassClient from "./BattlePassClient";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Sổ Sứ Mệnh (Battle Pass) 📖 — Waguri",
  robots: { index: false },
};

export default async function BattlePassPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { id, username } = getDiscordIdentity(user);
  if (!id) redirect("/login");

  const admin = createAdminClient();
  const seasonId = getCurrentSeasonId();
  const seasonLabel = getSeasonLabel(seasonId);

  // Fetch song song: user info, battle pass info, and all items for name mappings
  const [userRes, bpRes, itemsRes] = await Promise.all([
    admin.from("users").select("wallet").eq("user_id", id).maybeSingle(),
    admin.from("battle_pass_users").select("*").eq("user_id", id).eq("season_id", seasonId).maybeSingle(),
    admin.from("items").select("id, name, emoji"),
  ]);

  const wallet = Number(userRes?.data?.wallet || 0);
  const bp = bpRes?.data ?? null;

  // Tạo map tra cứu vật phẩm để hiển thị tên đẹp và emoji
  const itemMap: { [id: string]: { name: string; emoji?: string } } = {};
  if (itemsRes?.data) {
    for (const item of itemsRes.data) {
      itemMap[item.id] = {
        name: item.name,
        emoji: item.emoji || undefined,
      };
    }
  }

  return (
    <div className="container py-8 px-4">
      <BattlePassClient
        userId={id}
        username={username}
        wallet={wallet}
        bp={bp}
        itemMap={itemMap}
        seasonLabel={seasonLabel}
      />
    </div>
  );
}
