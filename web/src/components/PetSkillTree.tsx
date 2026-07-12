"use client";

import React, { useState, useTransition } from "react";
import Link from "next/link";
import { upgradePetSkill } from "../app/dashboard/actions";

type PetData = {
  name: string;
  species: string;
  exp: number;
  skills: Record<string, number> | null;
  skill_points: number;
};

type SpeciesInfo = {
  name: string;
  emoji: string;
};

type SkillDetails = {
  id: string;
  nameVi: string;
  nameEn: string;
  descVi: string;
  descEn: string;
  effectsVi: string;
  effectsEn: string;
  maxLvl: number;
  emoji: string;
  cx: number;
  cy: number;
};

const SKILL_LIST: SkillDetails[] = [
  {
    id: "fishing_luck",
    nameVi: "May Mắn Câu Cá",
    nameEn: "Fishing Luck",
    descVi: "Tăng tỉ lệ rơi các loài cá huyền thoại (Cá Rồng Vàng, Cá Koi Nhật).",
    descEn: "Increases the chance of catching rare, legendary fish.",
    effectsVi: "+20% / +40% / +65% Tỉ lệ cá hiếm",
    effectsEn: "+20% / +40% / +65% Rare fish rate",
    maxLvl: 3,
    emoji: "🎣",
    cx: 120,
    cy: 120
  },
  {
    id: "double_gem",
    nameVi: "Nhân Đôi Đá Quý",
    nameEn: "Double Ores",
    descVi: "Tăng cơ hội x2 sản lượng quặng và nâng tỉ lệ đào được Vàng Đông Triều, Kỳ Nam.",
    descEn: "Chance to double ore yields and increases rate of rare minerals.",
    effectsVi: "+15% / +35% Cơ hội x2 & quặng hiếm",
    effectsEn: "+15% / +35% Double & rare rate",
    maxLvl: 2,
    emoji: "💎",
    cx: 250,
    cy: 80
  },
  {
    id: "bakery_efficiency",
    nameVi: "Thợ Nướng Bánh",
    nameEn: "Bakery Efficiency",
    descVi: "Đẩy nhanh hiệu suất nướng và rút ngắn thời gian chuẩn bị bánh ở tiệm Gekka.",
    descEn: "Boosts baking speed and overall production in Gekka Bakery.",
    effectsVi: "+10% / +25% / +45% Tốc độ nướng bánh",
    effectsEn: "+10% / +25% / +45% Baking speed",
    maxLvl: 3,
    emoji: "🍰",
    cx: 380,
    cy: 120
  }
];

export default function PetSkillTree({
  pet,
  species,
  isEn
}: {
  pet: PetData;
  species: SpeciesInfo | null;
  isEn: boolean;
}) {
  const [selectedSkill, setSelectedSkill] = useState<SkillDetails | null>(SKILL_LIST[0]);
  const [isPending, startTransition] = useTransition();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const skills = pet.skills || {};
  const skillPoints = pet.skill_points || 0;

  const handleUpgrade = (skillId: string) => {
    setErrorMsg(null);
    startTransition(async () => {
      const res = await upgradePetSkill(skillId);
      if (!res.success) {
        setErrorMsg(res.error || "Failed to upgrade skill.");
      }
    });
  };

  const centerNode = { cx: 250, cy: 260 };

  return (
    <div className="space-y-6">
      {/* Top Title Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 glass-panel rounded-3xl p-6 border border-pink-300/10">
        <div className="flex items-center gap-3">
          <span className="text-4xl">{species?.emoji || "🐾"}</span>
          <div>
            <h1 className="text-xl font-extrabold text-white">
              {pet.name || species?.name}
            </h1>
            <p className="text-xs text-pink-300">
              {isEn ? `Available Skill Points: ` : `Điểm kỹ năng khả dụng: `}
              <span className="text-sm font-bold text-white bg-pink-500/25 px-2.5 py-0.5 rounded-full ml-1 animate-pulse">
                {skillPoints}
              </span>
            </p>
          </div>
        </div>
        <Link
          href="/dashboard"
          className="px-4 py-2 rounded-full text-xs font-bold border border-slate-700 text-slate-300 hover:bg-slate-800 transition-all"
        >
          {isEn ? "← Back to Dashboard" : "← Quay lại Dashboard"}
        </Link>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Interactive SVG Tree Area */}
        <div className="md:col-span-2 glass-panel rounded-3xl p-4 border border-pink-300/15 flex flex-col items-center justify-center min-h-[350px] relative overflow-hidden bg-[#0a050e]">
          {/* Subtle Cyber Grid Background */}
          <div className="absolute inset-0 opacity-10 bg-[linear-gradient(to_right,#3b0764_1px,transparent_1px),linear-gradient(to_bottom,#3b0764_1px,transparent_1px)] bg-[size:24px_24px]" />
          
          <svg viewBox="0 0 500 360" className="w-full max-w-[480px] relative z-10 select-none">
            {/* SVG Glowing Filter */}
            <defs>
              <filter id="neon-glow" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="6" result="blur" />
                <feComposite in="SourceGraphic" in2="blur" operator="over" />
              </filter>
            </defs>

            {/* Connecting Lines */}
            {SKILL_LIST.map((sk) => {
              const curLvl = skills[sk.id] || 0;
              const isUnlocked = curLvl > 0;
              return (
                <g key={`line-${sk.id}`}>
                  {/* Glowing line background */}
                  {isUnlocked && (
                    <line
                      x1={centerNode.cx}
                      y1={centerNode.cy}
                      x2={sk.cx}
                      y2={sk.cy}
                      stroke="#ec4899"
                      strokeWidth="6"
                      strokeOpacity="0.4"
                      filter="url(#neon-glow)"
                    />
                  )}
                  {/* Primary Connection Line */}
                  <line
                    x1={centerNode.cx}
                    y1={centerNode.cy}
                    x2={sk.cx}
                    y2={sk.cy}
                    stroke={isUnlocked ? "#ec4899" : "#374151"}
                    strokeWidth={isUnlocked ? "3" : "2"}
                    strokeDasharray={isUnlocked ? "0" : "5 5"}
                    className={isUnlocked ? "" : "animate-[dash_4s_linear_infinite]"}
                  />
                </g>
              );
            })}

            {/* Center Node (Pet) */}
            <g transform={`translate(${centerNode.cx}, ${centerNode.cy})`} className="cursor-default">
              <circle
                r="42"
                fill="#180e29"
                stroke="#ec4899"
                strokeWidth="3"
                className="filter drop-shadow-[0_0_12px_rgba(236,72,153,0.3)]"
              />
              <text y="8" textAnchor="middle" className="text-3xl font-emoji">
                {species?.emoji || "🐾"}
              </text>
            </g>

            {/* Skill Nodes */}
            {SKILL_LIST.map((sk) => {
              const curLvl = skills[sk.id] || 0;
              const isMax = curLvl >= sk.maxLvl;
              const isSelected = selectedSkill?.id === sk.id;

              return (
                <g
                  key={sk.id}
                  transform={`translate(${sk.cx}, ${sk.cy})`}
                  onClick={() => setSelectedSkill(sk)}
                  className="cursor-pointer group"
                >
                  {/* Outer Pulsing Glow on Selection / Hover */}
                  <circle
                    r="28"
                    fill="transparent"
                    stroke={isSelected ? "#ec4899" : "#f472b6"}
                    strokeWidth={isSelected ? "3" : "1"}
                    strokeOpacity={isSelected ? "1" : "0"}
                    className={`transition-all duration-300 group-hover:stroke-opacity-70 group-hover:scale-110 origin-center ${
                      isSelected ? "scale-105 filter drop-shadow-[0_0_8px_rgba(236,72,153,0.8)]" : ""
                    }`}
                  />

                  {/* Node Circle */}
                  <circle
                    r="24"
                    fill={curLvl > 0 ? "#2d163d" : "#111827"}
                    stroke={curLvl > 0 ? "#db2777" : "#4b5563"}
                    strokeWidth="2.5"
                    className="transition-all duration-300 group-hover:stroke-pink-400"
                  />

                  {/* Skill Emoji */}
                  <text y="6" textAnchor="middle" className="text-xl font-emoji select-none">
                    {sk.emoji}
                  </text>

                  {/* Level Counter Bubble */}
                  <g transform="translate(18, -18)">
                    <circle r="9" fill={isMax ? "#10b981" : curLvl > 0 ? "#db2777" : "#374151"} />
                    <text y="3" textAnchor="middle" fill="#fff" className="text-[9px] font-black font-sans">
                      {curLvl}
                    </text>
                  </g>
                </g>
              );
            })}
          </svg>
        </div>

        {/* Selected Skill Information Panel */}
        <div className="glass-panel rounded-3xl p-6 border border-pink-300/15 flex flex-col justify-between gap-6 min-h-[350px]">
          {selectedSkill ? (
            <>
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <span className="text-3xl bg-pink-500/10 w-12 h-12 flex items-center justify-center rounded-2xl border border-pink-300/20">
                    {selectedSkill.emoji}
                  </span>
                  <div>
                    <h2 className="text-md font-bold text-white">
                      {isEn ? selectedSkill.nameEn : selectedSkill.nameVi}
                    </h2>
                    <p className="text-[11px] text-pink-300/80 font-bold uppercase tracking-wider">
                      {isEn ? `Level ` : `Cấp độ `}
                      {skills[selectedSkill.id] || 0} / {selectedSkill.maxLvl}
                    </p>
                  </div>
                </div>

                <p className="text-xs text-slate-300 leading-relaxed bg-[#140e1d] p-3.5 rounded-2xl border border-pink-300/5">
                  {isEn ? selectedSkill.descEn : selectedSkill.descVi}
                </p>

                <div className="space-y-1">
                  <span className="text-[10px] text-slate-500 uppercase tracking-widest block">
                    {isEn ? "Skill Stats" : "Chỉ số bổ trợ"}
                  </span>
                  <p className="text-xs text-emerald-400 font-bold">
                    {isEn ? selectedSkill.effectsEn : selectedSkill.effectsVi}
                  </p>
                </div>

                {errorMsg && (
                  <p className="text-xs text-red-400 bg-red-950/20 border border-red-500/20 p-2.5 rounded-xl text-center">
                    ❌ {errorMsg}
                  </p>
                )}
              </div>

              <div>
                {(skills[selectedSkill.id] || 0) >= selectedSkill.maxLvl ? (
                  <button
                    disabled
                    className="w-full py-3 rounded-full text-xs font-black uppercase bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed text-center"
                  >
                    ✨ {isEn ? "Max Level Reached" : "Đạt Cấp Tối Đa"}
                  </button>
                ) : (
                  <button
                    onClick={() => handleUpgrade(selectedSkill.id)}
                    disabled={isPending || skillPoints <= 0}
                    className={`w-full py-3 rounded-full text-xs font-black uppercase tracking-wider transition-all text-center ${
                      skillPoints > 0 && !isPending
                        ? "bg-pink-300 text-[#0d0812] hover:bg-pink-400 shadow-lg shadow-pink-300/20 cursor-pointer"
                        : "bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed"
                    }`}
                  >
                    {isPending
                      ? (isEn ? "Upgrading..." : "Đang nâng cấp...")
                      : skillPoints <= 0
                      ? (isEn ? "Requires 1 Skill Point" : "Cần 1 Điểm kỹ năng")
                      : (isEn ? `Upgrade Skill ⚡` : `Nâng cấp kỹ năng ⚡`)}
                  </button>
                )}
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-slate-500 text-xs">
              {isEn ? "Select a skill node to view details" : "Chọn một nút kỹ năng để xem chi tiết"}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
