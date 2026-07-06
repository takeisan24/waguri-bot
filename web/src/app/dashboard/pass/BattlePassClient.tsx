// web/src/app/dashboard/pass/BattlePassClient.tsx
"use client";

import React, { useState, useTransition } from "react";
import Link from "next/link";
import { buyPremiumPassAction, claimPassRewardsAction } from "./actions";
import * as rewardsConfig from "../../../data/battlepass_rewards";

type BattlePassClientProps = {
  userId: string;
  username: string;
  wallet: number;
  bp: {
    xp: number;
    is_premium: boolean;
    claimed_free: number[];
    claimed_premium: number[];
  } | null;
  itemMap: { [id: string]: { name: string; emoji?: string } };
  seasonLabel: string;
};

export default function BattlePassClient({
  userId,
  username,
  wallet,
  bp,
  itemMap,
  seasonLabel,
}: BattlePassClientProps) {
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const bpXp = bp?.xp ?? 0;
  const currentLvl = Math.floor(bpXp / rewardsConfig.XP_PER_LEVEL);
  const xpIntoLevel = bpXp % rewardsConfig.XP_PER_LEVEL;
  const xpPct = Math.min(Math.floor((xpIntoLevel / rewardsConfig.XP_PER_LEVEL) * 100), 100);
  const isPremium = bp?.is_premium ?? false;
  const freeClaimed = new Set(bp?.claimed_free || []);
  const premiumClaimed = new Set(bp?.claimed_premium || []);

  // Đếm quà chưa nhận
  let claimableCount = 0;
  for (let l = 1; l <= currentLvl; l++) {
    const r = rewardsConfig.REWARDS[l];
    if (r.free && !freeClaimed.has(l)) claimableCount++;
    if (isPremium && r.premium && !premiumClaimed.has(l)) claimableCount++;
  }

  const handleBuyPremium = () => {
    if (wallet < rewardsConfig.PREMIUM_COST) {
      setMessage({ type: "error", text: `Ví của cậu không đủ ${rewardsConfig.PREMIUM_COST.toLocaleString("vi-VN")} xu ảo để mở khóa Premium!` });
      return;
    }

    if (confirm(`Cậu có đồng ý dùng ${rewardsConfig.PREMIUM_COST.toLocaleString("vi-VN")} xu ảo để mở khóa Sổ Sứ Mệnh Premium không?`)) {
      startTransition(async () => {
        const res = await buyPremiumPassAction();
        if (res.success) {
          setMessage({ type: "success", text: "👑 Chúc mừng cậu đã mở khóa Sổ Sứ Mệnh Premium thành công! Hãy cày cuốc nhận quà nhé~" });
        } else {
          setMessage({ type: "error", text: res.error || "Có lỗi xảy ra!" });
        }
      });
    }
  };

  const handleClaimAll = () => {
    startTransition(async () => {
      const res = await claimPassRewardsAction();
      if (res.success) {
        let giftMsg = "Cậu đã nhận thành công các mốc quà:";
        if (res.coins && res.coins > 0) giftMsg += `\n🪙 +${res.coins.toLocaleString("vi-VN")} xu`;
        if (res.title) giftMsg += `\n🎖️ Danh hiệu độc quyền: "${res.title}"`;
        if (res.items && Object.keys(res.items).length > 0) {
          giftMsg += "\n🎒 Vật phẩm: ";
          for (const [id, qty] of Object.entries(res.items)) {
            const name = itemMap[id]?.name || id;
            const emoji = itemMap[id]?.emoji || "📦";
            giftMsg += `[${emoji} ${name} x${qty}] `;
          }
        }
        setMessage({ type: "success", text: giftMsg });
      } else {
        setMessage({ type: "error", text: res.error || "Có lỗi xảy ra!" });
      }
    });
  };

  const formatReward = (reward: any) => {
    if (!reward) return null;
    const parts = [];
    if (reward.coins) parts.push(`🪙 +${reward.coins.toLocaleString("vi-VN")}`);
    if (reward.items) {
      for (const [id, qty] of Object.entries(reward.items)) {
        const name = itemMap[id]?.name || id;
        const emoji = itemMap[id]?.emoji || "📦";
        parts.push(`${emoji} ${name} x${qty}`);
      }
    }
    if (reward.title) parts.push(`🎖️ "${reward.title}"`);
    return parts.join(" & ");
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header & Quay lại */}
      <div className="flex items-center justify-between">
        <Link
          href="/dashboard"
          className="text-xs text-pink-300 font-bold hover:text-pink-200 flex items-center gap-1 transition-all"
        >
          ← Quay lại Bảng điều khiển
        </Link>
        <span className="text-xs text-slate-400">
          Chế độ xem: <strong className="text-white">{username}</strong>
        </span>
      </div>

      {/* Banner Sổ Sứ Mệnh */}
      <div className="glass-panel rounded-3xl p-8 border border-pink-300/10 bg-gradient-to-br from-pink-500/5 via-transparent to-purple-500/5 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 bg-pink-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-32 h-32 bg-purple-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
          <div className="space-y-3 flex-1">
            <span className="text-[10px] uppercase tracking-wider font-extrabold text-pink-400 bg-pink-500/10 px-3 py-1 rounded-full border border-pink-500/20">
              MÙA GIẢI HIỆN TẠI
            </span>
            <h1 className="text-2xl md:text-3xl font-black text-white">{seasonLabel}</h1>
            <p className="text-sm text-slate-300">
              Hãy điểm danh hằng ngày và chăm chỉ cày cuốc để thu thập XP lên cấp Sổ Sứ Mệnh. Rất nhiều quà tặng độc quyền đang chờ đón cậu!
            </p>
          </div>

          <div className="flex flex-col gap-2 flex-shrink-0 min-w-[200px] text-center md:text-right">
            <div className="text-xs text-slate-400">Cấp độ hiện tại</div>
            <div className="text-5xl font-black text-transparent bg-clip-text bg-gradient-to-r from-pink-400 to-purple-400">
              LV.{currentLvl}
            </div>
            <div className="text-[10px] text-slate-400">
              {xpIntoLevel.toLocaleString("vi-VN")} / 1,000 XP ({xpPct}%)
            </div>
          </div>
        </div>

        {/* Thanh tiến trình lớn */}
        <div className="mt-8 space-y-2">
          <div className="h-3 rounded-full bg-[#1c1424] overflow-hidden border border-pink-300/5">
            <div
              className="h-full rounded-full bg-gradient-to-r from-pink-500 via-purple-500 to-indigo-500"
              style={{ width: `${(currentLvl / rewardsConfig.MAX_LEVEL) * 100}%` }}
            />
          </div>
          <div className="flex justify-between text-[11px] text-slate-400">
            <span>Cấp 0</span>
            <span>Cấp 10</span>
            <span>Cấp 20 (Cực đại)</span>
          </div>
        </div>

        {/* Nút hành động */}
        <div className="mt-8 pt-6 border-t border-slate-800/60 flex flex-wrap gap-4 items-center justify-between">
          <div className="flex items-center gap-3">
            <span className={`text-xs px-3 py-1 rounded-full font-bold ${isPremium ? "bg-amber-400/20 text-amber-300 border border-amber-400/30" : "bg-slate-400/10 text-slate-400 border border-slate-800"}`}>
              {isPremium ? "👑 Sổ Cao Cấp (Premium)" : "🔓 Sổ Thường (Free)"}
            </span>
            <span className="text-xs text-slate-400">
              Tiền trong ví: <strong className="text-pink-300">{wallet.toLocaleString("vi-VN")} xu</strong>
            </span>
          </div>

          <div className="flex gap-3">
            {!isPremium && (
              <button
                disabled={isPending}
                onClick={handleBuyPremium}
                className="px-5 py-2.5 rounded-2xl bg-gradient-to-r from-amber-400 to-yellow-500 hover:from-amber-300 hover:to-yellow-400 text-slate-950 text-xs font-black shadow-lg shadow-amber-500/10 hover:shadow-amber-500/20 active:scale-95 transition-all disabled:opacity-50"
              >
                👑 Mở Premium ({rewardsConfig.PREMIUM_COST.toLocaleString("vi-VN")} xu)
              </button>
            )}

            <button
              disabled={isPending || claimableCount === 0}
              onClick={handleClaimAll}
              className={`px-5 py-2.5 rounded-2xl text-xs font-extrabold shadow-lg active:scale-95 transition-all disabled:opacity-50 ${claimableCount > 0 ? "bg-pink-500 hover:bg-pink-400 text-white shadow-pink-500/10" : "bg-slate-800 text-slate-500 border border-slate-700/50 shadow-none pointer-events-none"}`}
            >
              🔄 Nhận quà chưa nhận ({claimableCount})
            </button>
          </div>
        </div>
      </div>

      {/* Thông báo kết quả */}
      {message && (
        <div className={`p-5 rounded-2xl border text-sm flex flex-col gap-1.5 ${message.type === "success" ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-300" : "bg-rose-500/10 border-rose-500/20 text-rose-300"}`}>
          <div className="flex justify-between items-center font-bold">
            <span>{message.type === "success" ? "🎉 Thành công!" : "⚠️ Lỗi"}</span>
            <button onClick={() => setMessage(null)} className="text-xs hover:text-white">✕ Đóng</button>
          </div>
          <p className="whitespace-pre-line text-xs">{message.text}</p>
        </div>
      )}

      {/* Danh sách 20 Mốc quà (Timeline) */}
      <div className="space-y-4">
        <h2 className="text-lg font-black text-white">🎁 Hành Trình &amp; Phần Thưởng 20 Cấp Độ</h2>

        <div className="space-y-3 relative before:absolute before:top-4 before:bottom-4 before:left-[19px] before:w-[2px] before:bg-slate-800/80">
          {Array.from({ length: rewardsConfig.MAX_LEVEL }, (_, i) => i + 1).map((lvl) => {
            const r = rewardsConfig.REWARDS[lvl];
            const isLvlReached = currentLvl >= lvl;
            const isFreeClaimed = freeClaimed.has(lvl);
            const isPremiumClaimed = premiumClaimed.has(lvl);

            return (
              <div key={lvl} className={`flex items-start gap-4 relative z-10 transition-all ${isLvlReached ? "opacity-100" : "opacity-60"}`}>
                {/* Vòng tròn số Cấp */}
                <div className={`w-10 h-10 rounded-full flex-shrink-0 flex items-center justify-center font-black text-sm border-2 ${isLvlReached ? "bg-pink-500 border-pink-400 text-white shadow-lg shadow-pink-500/20 animate-pulse" : "bg-slate-900 border-slate-800 text-slate-500"}`}>
                  {lvl}
                </div>

                {/* Nội dung Mốc quà */}
                <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-3">
                  {/* Nhánh Free */}
                  <div className={`glass-panel rounded-2xl p-4 border flex justify-between items-center gap-3 ${isFreeClaimed ? "border-emerald-500/10 bg-emerald-500/[0.02]" : "border-slate-800/60"}`}>
                    <div className="space-y-1">
                      <div className="text-[10px] text-slate-400 uppercase tracking-wider font-extrabold flex items-center gap-1">
                        🔓 Nhánh Free
                        {isFreeClaimed && <span className="text-emerald-400">✓ Đã nhận</span>}
                        {isLvlReached && !isFreeClaimed && <span className="text-pink-400">🎁 Có thể nhận</span>}
                      </div>
                      <div className="text-xs font-bold text-white whitespace-pre-wrap">
                        {formatReward(r.free)}
                      </div>
                    </div>
                  </div>

                  {/* Nhánh Premium */}
                  {r.premium && (
                    <div className={`glass-panel rounded-2xl p-4 border flex justify-between items-center gap-3 ${isPremiumClaimed ? "border-emerald-500/10 bg-emerald-500/[0.02]" : (isPremium && isLvlReached && !isPremiumClaimed ? "border-amber-400/20 bg-amber-400/[0.02]" : "border-slate-800/60")}`}>
                      <div className="space-y-1">
                        <div className="text-[10px] text-amber-300 uppercase tracking-wider font-extrabold flex items-center gap-1">
                          👑 Nhánh Premium
                          {isPremiumClaimed && <span className="text-emerald-400">✓ Đã nhận</span>}
                          {!isPremium && <span className="text-slate-500">🔒 Khóa (Chưa mua Premium)</span>}
                          {isPremium && isLvlReached && !isPremiumClaimed && <span className="text-amber-400">🎁 Có thể nhận</span>}
                          {isPremium && !isLvlReached && <span className="text-slate-500">🔒 Chưa đạt cấp</span>}
                        </div>
                        <div className="text-xs font-bold text-white whitespace-pre-wrap">
                          {formatReward(r.premium)}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
