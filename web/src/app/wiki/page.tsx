import React from "react";
import CherryBlossom from "../../components/CherryBlossom";
import SiteHeader from "../../components/SiteHeader";
import SiteFooter from "../../components/SiteFooter";
import WaguriFloat from "../../components/WaguriFloat";
import { getLocaleServer } from "../../lib/i18n";

export async function generateMetadata() {
  const locale = await getLocaleServer();
  return {
    title: locale === "en" ? "Wiki 🌸 - Waguri Bot Guide" : "Wiki 🌸 - Hướng dẫn chơi Waguri Bot",
    description: locale === "en"
      ? "Full gameplay guide for Waguri Bot: economy, energy & fatigue, food & buffs, trading, minigames, pig raising, plant farming, jail, and AI chats."
      : "Hướng dẫn đầy đủ cách chơi Waguri: kiếm tiền, năng lượng & mệt mỏi, đồ ăn & buff, mua bán, minigame, nuôi heo, trồng cây, hệ giam và trò chuyện AI.",
  };
}

type Cmd = { c: string; d: string };

function Card({ title, emoji, id, children }: { title: string; emoji: string; id?: string; children: React.ReactNode }) {
  return (
    <section id={id} className="glass-panel w-full p-6 md:p-8 rounded-2xl border border-pink-300/15 space-y-4 shadow-xl scroll-mt-24">
      <h2 className="text-xl font-black text-white flex items-center gap-2">
        <span>{emoji}</span> <span>{title}</span>
      </h2>
      <div className="space-y-3 text-sm md:text-[15px] leading-relaxed text-slate-300">{children}</div>
    </section>
  );
}

function CmdList({ items }: { items: Cmd[] }) {
  return (
    <ul className="space-y-2">
      {items.map((it) => (
        <li key={it.c} className="flex flex-col sm:flex-row sm:items-baseline gap-y-1 sm:gap-y-0 gap-x-3 py-1.5 border-b border-pink-300/5 last:border-0">
          <code className="text-pink-300 bg-pink-500/10 border border-pink-300/15 rounded px-2 py-0.5 text-[13px] font-mono whitespace-nowrap">
            {it.c}
          </code>
          <span className="text-slate-400">{it.d}</span>
        </li>
      ))}
    </ul>
  );
}

// Custom SVG Icons for Catalog Items
function ItemIcon({ type }: { type: string }) {
  const base = "w-6 h-6 text-pink-300 drop-shadow-[0_0_6px_rgba(244,63,94,0.4)]";
  
  if (type === "banh_mi") {
    return (
      <svg className={base} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M3 12c0-3.3 2.7-6 6-6h6c3.3 0 6 2.7 6 6s-2.7 6-6 6H9c-3.3 0-6-2.7-6-6z" />
        <path d="M8 8l2 8M14 8l2 8" />
      </svg>
    );
  }
  if (type === "xoi_xeo") {
    return (
      <svg className={base} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M12 2a10 10 0 0 1 10 10H2A10 10 0 0 1 12 2z" />
        <path d="M2 12c0 5.5 4.5 10 10 10s10-4.5 10-10" />
        <path d="M6 12v3M18 12v3" />
      </svg>
    );
  }
  if (type === "cafe") {
    return (
      <svg className={base} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M18 8h2a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2h-2M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z" />
        <path d="M6 2v2M10 2v2M14 2v2" />
      </svg>
    );
  }
  if (type === "soda") {
    return (
      <svg className={base} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M5 8h14l-2 13H7L5 8z" />
        <path d="M14 2L10 8" />
        <path d="M8 2h6" />
      </svg>
    );
  }
  if (type === "pill") {
    return (
      <svg className={base} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="2" y="9" width="20" height="6" rx="3" transform="rotate(45 12 12)" />
        <line x1="8.5" y1="8.5" x2="15.5" y2="15.5" />
      </svg>
    );
  }
  if (type === "medkit") {
    return (
      <svg className={base} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="6" width="18" height="14" rx="2" />
        <path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
        <path d="M12 10v6M9 13h6" />
      </svg>
    );
  }
  if (type === "rice") {
    return (
      <svg className={base} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
      </svg>
    );
  }
  if (type === "cake") {
    return (
      <svg className={base} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M12 2L2 9v11a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9L12 2z" />
        <path d="M2 9h20M2 15h20" />
      </svg>
    );
  }
  if (type === "fish") {
    return (
      <svg className={base} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M23 12c-2.2 1.8-5.3 2-8 1.5-1.5-.3-3-.3-4.5 0-2.7.5-5.8.3-8-1.5 2.2-1.8 5.3-2 8-1.5 1.5.3 3 .3 4.5 0 2.7-.5 5.8-.3 8 1.5z" />
        <path d="M3 12l-2 3V9l2 3zM18 10.5a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3z" />
      </svg>
    );
  }
  if (type === "gold") {
    return (
      <svg className={base} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M4 22h16l-2-6H6l-2 6zM2 9h20l-2-6H4l-2 6z" />
        <path d="M12 3v19M6 9h12" />
      </svg>
    );
  }
  if (type === "wood") {
    return (
      <svg className={base} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M12 22c5.5 0 10-4.5 10-10S17.5 2 12 2 2 6.5 2 12s4.5 10 10 10z" />
        <path d="M12 6a6 6 0 1 0 0 12 6 6 0 0 0 0-12z" />
        <path d="M12 10a2 2 0 1 0 0 4 2 2 0 0 0 0-4z" />
      </svg>
    );
  }
  if (type === "gift") {
    return (
      <svg className={base} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="8" width="18" height="13" rx="2" />
        <path d="M12 8V2M5 8c0-3 2-5 7-5s7 2 7 5" />
        <path d="M3 12h18" />
      </svg>
    );
  }
  
  return (
    <svg className={base} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10" />
    </svg>
  );
}

function ItemWidget({ type, name, effect, price }: { type: string; name: string; effect: string; price: string }) {
  return (
    <div className="flex items-center gap-3 p-3.5 rounded-xl bg-pink-500/5 border border-pink-300/10 hover:border-pink-300/30 hover:bg-pink-500/10 transition-all shadow-md">
      <div className="flex items-center justify-center p-2.5 rounded-lg bg-[#140c1a] border border-pink-300/10">
        <ItemIcon type={type} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-white truncate">{name}</p>
        <p className="text-xs text-pink-200/80 font-semibold">{effect}</p>
      </div>
      <div className="text-right flex-shrink-0">
        <span className="text-xs px-2 py-1 rounded bg-pink-500/10 text-pink-300 font-bold border border-pink-300/15">
          {price}
        </span>
      </div>
    </div>
  );
}

export default async function Wiki() {
  const locale = await getLocaleServer();

  return (
    <div className="relative min-h-screen flex flex-col justify-between overflow-x-hidden bg-[#0d0812] text-slate-200">
      <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[60%] rounded-full bg-pink-500/10 blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[60%] h-[70%] rounded-full bg-purple-600/10 blur-[130px]" />
      </div>

      <CherryBlossom />

      <SiteHeader />

      {locale === "en" ? (
        // English Wiki
        <main className="relative flex-1 flex flex-col items-center px-6 z-10 py-10 max-w-4xl mx-auto w-full space-y-6">
          <div className="text-center space-y-2">
            <h1 className="text-3xl md:text-4xl font-black text-white">📖 Wiki — Waguri Gameplay Guide</h1>
            <p className="text-slate-400 text-sm">
              All commands can be used with <code className="text-pink-300">/slash</code> or prefix{" "}
              <code className="text-pink-300">w!</code> (e.g. <code className="text-pink-300">w!work</code>). The currency is{" "}
              <strong>virtual VND</strong>.
            </p>
          </div>

          <nav className="glass-panel w-full p-5 rounded-2xl border border-pink-300/15">
            <p className="text-sm font-bold text-white mb-3">📑 Table of Contents</p>
            <div className="flex flex-wrap gap-2 text-[13px]">
              {[
                ["#bat-dau", "🌱 Start"],
                ["#kiem-tien", "💼 Earning & Energy"],
                ["#cua-hang", "🏪 Store & Buffs"],
                ["#minigame", "🎲 Minigames"],
                ["#nuoi-heo", "🐷 Pig Farming"],
                ["#trong-cay", "🌱 Plant Farming"],
                ["#che-tao", "🔨 Crafting"],
                ["#nong-trai", "🔁 Farm Loop"],
                ["#he-giam", "🚓 Jail System"],
                ["#ai-chat", "💬 AI Chat"],
              ].map(([href, label]) => (
                <a key={href} href={href} className="px-3 py-1.5 rounded-full bg-pink-500/10 border border-pink-300/15 text-pink-200 hover:border-pink-300/50 hover:text-white transition-colors">
                  {label}
                </a>
              ))}
            </div>
          </nav>

          <Card id="bat-dau" title="Getting Started" emoji="🌱">
            <p>A few quick commands to get you started:</p>
            <CmdList
              items={[
                { c: "/daily", d: "daily check-in rewards (with streak boost)" },
                { c: "/work", d: "go to work to earn coins — main source of income at the start" },
                { c: "/bank balance", d: "check your wallet, bank balance, level, and energy" },
                { c: "/status", d: "view energy, health, active buffs, Premium, and active events" },
                { c: "/help", d: "view all available commands" },
              ]}
            />
          </Card>

          <Card id="kiem-tien" title="Earn Money · Energy · Fatigue" emoji="💼">
            <p>
              Each work command consumes <strong>energy ⚡</strong> (max 100, automatically restores at +1/minute). When{" "}
              <strong>energy or health drops below 50%</strong>, your income begins to decrease (up to 50%) — so rest up
              before farming further.
            </p>
            <CmdList
              items={[
                { c: "/work /fish /mine /chop", d: "various ways to earn coins (consumes energy)" },
                { c: "/nghingoi", d: "sleep to restore full energy (cooldown applies)" },
                { c: "/eat <item>", d: "consume food to restore energy or get income buffs" },
                { c: "/hospital", d: "fully restore health (costs 10% of total wealth)" },
                { c: "/jobs", d: "change jobs for higher salary when leveling up" },
                { c: "/quest", d: "accept and complete daily quests for extra rewards" },
              ]}
            />
          </Card>

          <Card id="cua-hang" title="Store · Trading · Food & Buffs" emoji="🏪">
            <p>
              Use <code className="text-pink-300">/store list</code> to browse goods, <code className="text-pink-300">/store buy &lt;item&gt;</code> to buy, and{" "}
              <code className="text-pink-300">/store sell &lt;item&gt;</code> to sell items from your inventory (returns <strong>50% price</strong>). You can also run <code className="text-pink-300">/craft</code> to manufacture premium goods from wood/stone/ore.
            </p>
            
            <div className="space-y-4 pt-2">
              <div>
                <p className="font-bold text-white mb-2.5 text-sm flex items-center gap-1.5">
                  <span>🥤</span> Food for energy (⚡):
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <ItemWidget type="banh_mi" name="Vietnamese Banh Mi" effect="+25 ⚡" price="150c" />
                  <ItemWidget type="xoi_xeo" name="Hanoi Xoi Xeo" effect="+40 ⚡" price="250c" />
                  <ItemWidget type="cafe" name="Vietnamese Iced Coffee" effect="+60 ⚡" price="500c" />
                  <ItemWidget type="soda" name="Gekka Fruit Soda" effect="+100 ⚡ (Full Energy)" price="1,000c" />
                </div>
              </div>

              <div>
                <p className="font-bold text-white mb-2.5 text-sm flex items-center gap-1.5">
                  <span>💊</span> Health recovery (❤️) & Income Buffs (🍗):
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <ItemWidget type="pill" name="Cold Pill" effect="+20 ❤️" price="1,000c" />
                  <ItemWidget type="medkit" name="Kikyo First Aid Kit" effect="+50 ❤️" price="3,500c" />
                  <ItemWidget type="rice" name="Vietnamese Chicken Rice" effect="+20% income for 1 hour" price="2,000c" />
                  <ItemWidget type="cake" name="Gekka Strawberry Cake" effect="+50% income for 6 hours" price="20,000c" />
                  <ItemWidget type="cake" name="Gekka Cheesecake" effect="+100% income for 8 hours" price="35,000c" />
                </div>
              </div>

              <div>
                <p className="font-bold text-white mb-2.5 text-sm flex items-center gap-1.5">
                  <span>💎</span> Harvesting & Ultra Rare Collectibles:
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <ItemWidget type="fish" name="Golden Dragon Fish" effect="Epic • 0.4% chance when fishing / Crafting mat" price="20,000c" />
                  <ItemWidget type="fish" name="Imperial Koi Fish" effect="Legendary • 0.1% chance when fishing / Flex" price="80,000c" />
                  <ItemWidget type="gold" name="Dong Trieu Gold" effect="Rare • 1% chance when mining / Crafting mat" price="5,000c" />
                  <ItemWidget type="wood" name="Kynam Wood" effect="Epic • 0.5% chance when woodcutting / Crafting mat" price="15,000c" />
                </div>
              </div>
            </div>
          </Card>

          <Card id="minigame" title="Minigame & Luck" emoji="🎲">
            <CmdList
              items={[
                { c: "/taixiu /baucua /coinflip", d: "quick betting games using virtual coins" },
                { c: "/blackjack /bacay /xocdia", d: "card games & xoc dia" },
                { c: "/crate", d: "open mystery crates to receive items" },
                { c: "/duangua", d: "horse racing bets" },
                { c: "/loto /bingo", d: "multiplayer voice channel games, automated caller" },
                { c: "/masoi", d: "Werewolf 4–15 players, deduce and find Wolves (secret roles)" },
              ]}
            />
          </Card>

          <Card id="nuoi-heo" title="Pig Raising 🐷" emoji="🐷">
            <p>
              Cycle: <strong>buy &rarr; feed &rarr; wash &rarr; sleep &rarr; feed again (matures) &rarr; sell</strong>. Each action
              is spaced ~15 minutes apart; neglecting pigs for over 4 hours makes them sick. Selling pigs yields <strong>Pork</strong> (inventory item){" "}
              to <code>/eat</code> for energy or <code>/store sell</code> for money. Rarity increases sell value (2,000 to 50,000 for legendary Hologram Pig).
            </p>
            <CmdList
              items={[
                { c: "/heo mua · w!muaheo", d: "buy a piglet (1,000, yields 1 free feed)" },
                { c: "/heo an · w!heoan", d: "feed (1st free, 2nd costs 500 -> matures)" },
                { c: "/heo tam · w!tamheo [@user]", d: "wash pig (or help wash someone else's pig)" },
                { c: "/heo ngu · w!heongu", d: "put pig to sleep" },
                { c: "/heo ban · w!banheo", d: "process & sell mature pig" },
                { c: "/heo chuabenh · w!chuabenh", d: "cure sick pig (1,000)" },
                { c: "/heo trom · w!tromheo @user", d: "steal someone else's mature pig (risky!)" },
                { c: "/heo box · w!pigbox [@user]", d: "open/gift lucky Pigbox (2,400, max 10/day)" },
              ]}
            />
          </Card>

          <Card id="trong-cay" title="Plant Cultivation 🌱" emoji="🌱">
            <p>
              Cycle: <strong>buy seed &rarr; water 3 times (every 3 hours) &rarr; mature &rarr; harvest (within 1 hour)</strong>.
              Fertilize or ask others to water to speed up. Neglecting watering for over 5 hours kills the plant (requires revive). Harvesting yields{" "}
              <strong>fruits</strong> (<code>/eat</code> / <code>/store sell</code>) or <strong>flowers</strong> (<code>/store sell</code>).
              Leaving it mature for over 1.5h allows others to steal; over 4h bugs destroy the harvest.
            </p>
            <CmdList
              items={[
                { c: "/trongcay muagiong · w!muagiong", d: "buy seed & plant (500)" },
                { c: "/trongcay tuoi · w!tuoinuoc [@user]", d: "water plant (or help water others' plants)" },
                { c: "/trongcay bonphan · w!bonphan", d: "fertilize to add 1 water step instantly (200)" },
                { c: "/trongcay thuhoach · w!thuhoach", d: "harvest mature crop" },
                { c: "/trongcay hoisinh · w!hoisinh", d: "revive dead crop (1,000)" },
                { c: "/trongcay phacay · w!phacay", d: "destroy current plant to sow new seed" },
                { c: "/trongcay trom · w!trom @user", d: "steal someone else's mature crop (risky!)" },
                { c: "/trongcay box · w!plantbox [@user]", d: "open/gift lucky Plantbox (240, max 10/day)" },
              ]}
            />
          </Card>

          <Card id="che-tao" title="Crafting & Mining 🔨" emoji="🔨">
            <p>
              Harvest materials from nature by fishing, mining, and chopping wood. Then run{" "}
              <code>/craft make</code> to craft advanced goods to sell or use as Gekka Bakery upgrade materials!
            </p>
            
            <div className="space-y-4 pt-2">
              <div>
                <p className="font-bold text-white mb-2 text-sm flex items-center gap-1.5">
                  <span>⛏️</span> Gathering Activities:
                </p>
                <ul className="list-disc pl-5 space-y-1.5 text-slate-400 text-sm">
                  <li>
                    <strong>Mining</strong> <code>/mine</code> (requires Pickaxe) &rarr; earn coins, chance to gather <strong>Stone</strong>, <strong>Iron Ore</strong>, and ultra rare 🟡 <strong>Dong Trieu Gold</strong> (1%).
                  </li>
                  <li>
                    <strong>Woodcutting</strong> <code>/chop</code> (requires Axe) &rarr; earn coins, chance to gather <strong>Wood</strong> and ultra rare 🌲 <strong>Kynam Wood</strong> (0.5%).
                  </li>
                  <li>
                    <strong>Fishing</strong> <code>/fish</code> (requires Fishing Rod) &rarr; earn coins, chance to gather <strong>Fresh Fish</strong>, <strong>Tasty Fish</strong>, <strong>Rare Fish</strong>, ultra rare 🏮 <strong>Golden Dragon Fish</strong> (0.4%), and 👑 <strong>Imperial Koi Fish</strong> (0.1%).
                  </li>
                </ul>
              </div>

              <div>
                <p className="font-bold text-white mb-2 text-sm flex items-center gap-1.5">
                  <span>📜</span> Crafting Recipes (<code>/craft list</code>):
                </p>
                <div className="grid grid-cols-1 gap-3.5 text-sm">
                  {[
                    { name: "Wooden Plank", id: "tam_go", mats: "3× Raw Wood", fee: "Free", desc: "Material for crafting furniture." },
                    { name: "Iron Bar", id: "thoi_sat", mats: "3× Iron Ore", fee: "Free", desc: "Material for crafting furniture & jewelry." },
                    { name: "Thief Toolkit", id: "do_trom", mats: "2× Wood + 1× Iron Ore", fee: "Free", desc: "Used to steal pigs/plants without spending coins on tools." },
                    { name: "Agarwood Bracelet", id: "tram_huong_vong", mats: "1× Kynam Wood + 2× Iron Bar", fee: "Free", desc: "A great gift for Waguri to boost affection (+50 Love) or for flex." },
                    { name: "Wooden Furniture Set", id: "noi_that", mats: "4× Wooden Plank + 2× Iron Bar", fee: "1,300c", desc: "Used to upgrade Gekka Bakery or sell back for 2,500c." },
                    { name: "Gem Jewelry", id: "trang_suc", mats: "6× Stone + 2× Iron Bar", fee: "2,200c", desc: "Used to upgrade Gekka Bakery or sell back for 3,000c." },
                    { name: "Royal Gem Crown", id: "vuong_mieng_gold", mats: "1× Dong Trieu Gold + 2× Iron Bar + 6× Stone + 1× Gem Jewelry", fee: "Free", desc: "A luxurious crafting masterpiece representing royal status." },
                  ].map((recipe) => (
                    <div key={recipe.id} className="p-3.5 rounded-xl bg-pink-500/5 border border-pink-300/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:border-pink-300/30 hover:bg-pink-500/10 transition-all shadow-md">
                      <div>
                        <p className="font-bold text-white flex items-center gap-1.5">
                          <span>🔨</span> {recipe.name} 
                          <code className="text-xs bg-pink-500/10 text-pink-300 border border-pink-300/15 px-1.5 py-0.5 rounded font-mono">
                            {recipe.id}
                          </code>
                        </p>
                        <p className="text-xs text-slate-400 mt-1">{recipe.desc}</p>
                        <p className="text-xs text-pink-200/80 mt-1 font-semibold">Ingredients: {recipe.mats}</p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <span className="text-xs px-2.5 py-1 rounded bg-pink-500/10 text-pink-300 font-bold border border-pink-300/15 whitespace-nowrap">
                          Fee: {recipe.fee}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </Card>

          <Card id="nong-trai" title="Closed Farm Loop 🔁" emoji="🔁">
            <p>
              Pig farming and plant cultivation are closely linked to help you save money:
            </p>
            <ul className="list-disc pl-5 space-y-1.5 text-slate-400">
              <li>
                <strong>Harvesting crops</strong> &rarr; chance to receive <strong>Pig Feed</strong> 🌽 &rarr; feed pigs for{" "}
                <em>free</em> (saves 500c).
              </li>
              <li>
                <strong>Raising pigs</strong> (put to sleep) &rarr; chance to find <strong>Fertilizer</strong> 💩 &rarr; fertilize crops for{" "}
                <em>free</em> (saves 200c).
              </li>
              <li>
                <code>/chop</code> + <code>/mine</code> &rarr; <code>/craft</code> a <strong>Thief Toolkit</strong> 🧰 &rarr; steal pigs/crops{" "}
                <em>without buying tools</em>.
              </li>
              <li>
                The <strong>Farmer</strong> job unlocks at Lvl 5 in <code>/jobs</code> — decent salary, low risk.
              </li>
              <li>
                <code>/tangdo @user &lt;item&gt;</code> — gift items (flowers, pork, food...) to others.
              </li>
            </ul>
          </Card>

          <Card id="he-giam" title="Jail System 🚓" emoji="🚓">
            <p>
              &quot;Illegal&quot; actions — <code>/rob</code>, stealing pigs or crops — if failed <strong>3 times</strong> without enough coins to pay fines, will land you in <strong>Jail</strong>. While jailed, you cannot use work, gamble, or steal commands. Buy <strong>School Insurance</strong> in <code>/store list</code> to cut jail time in half. Check jail status in <code>/status</code>.
            </p>
          </Card>

          <Card id="ai-chat" title="Chatting with Waguri 💬" emoji="💬">
            <CmdList
              items={[
                { c: "/ask · @Waguri", d: "chat with Waguri Kaoruko (gentle AI)" },
                { c: "/couple status", d: "view affection with Waguri & relationship with spouse 💞" },
                { c: "/premium", d: "Premium package: extra AI chats + 10% income boost" },
              ]}
            />
          </Card>

          <section className="glass-panel w-full p-6 md:p-8 rounded-2xl border border-pink-300/20 flex flex-col sm:flex-row items-center justify-between gap-5">
            <p className="text-slate-300 text-sm text-center sm:text-left">
              Ready to get started? Invite Waguri to your server and build your wealth together! 🌸
            </p>
            <div className="flex gap-3 flex-shrink-0">
              <a
                href="https://discord.com/oauth2/authorize?client_id=1482620714690543738&permissions=1099512007760&integration_type=0&scope=bot+applications.commands"
                target="_blank"
                rel="noopener noreferrer"
                className="px-6 py-3 rounded-full font-bold bg-pink-300 text-[#0d0812] hover:bg-pink-400 transition-all whitespace-nowrap"
              >
                Invite Waguri 🌸
              </a>
              <a
                href="https://top.gg/bot/1482620714690543738/vote"
                target="_blank"
                rel="noopener noreferrer"
                className="px-6 py-3 rounded-full font-bold border border-pink-300/30 text-pink-200 hover:border-pink-300/60 transition-all whitespace-nowrap"
              >
                💝 Vote
              </a>
            </div>
          </section>
        </main>
      ) : (
        // Vietnamese Wiki (Original)
        <main className="relative flex-1 flex flex-col items-center px-6 z-10 py-10 max-w-4xl mx-auto w-full space-y-6">
          <div className="text-center space-y-2">
            <h1 className="text-3xl md:text-4xl font-black text-white">📖 Wiki — Hướng dẫn chơi Waguri</h1>
            <p className="text-slate-400 text-sm">
              Mọi lệnh dùng được bằng <code className="text-pink-300">/slash</code> hoặc prefix{" "}
              <code className="text-pink-300">w!</code> (ví dụ <code className="text-pink-300">w!work</code>). Tiền tệ là{" "}
              <strong>VNĐ ảo</strong>.
            </p>
          </div>

          <nav className="glass-panel w-full p-5 rounded-2xl border border-pink-300/15">
            <p className="text-sm font-bold text-white mb-3">📑 Mục lục</p>
            <div className="flex flex-wrap gap-2 text-[13px]">
              {[
                ["#bat-dau", "🌱 Bắt đầu"],
                ["#kiem-tien", "💼 Kiếm tiền"],
                ["#cua-hang", "🏪 Cửa hàng & Buff"],
                ["#minigame", "🎲 Minigame"],
                ["#nuoi-heo", "🐷 Nuôi heo"],
                ["#trong-cay", "🌱 Trồng cây"],
                ["#che-tao", "🔨 Chế tạo"],
                ["#nong-trai", "🔁 Nông trại"],
                ["#he-giam", "🚓 Hệ giam"],
                ["#ai-chat", "💬 Trò chuyện AI"],
              ].map(([href, label]) => (
                <a key={href} href={href} className="px-3 py-1.5 rounded-full bg-pink-500/10 border border-pink-300/15 text-pink-200 hover:border-pink-300/50 hover:text-white transition-colors">
                  {label}
                </a>
              ))}
            </div>
          </nav>

          <Card id="bat-dau" title="Bắt đầu" emoji="🌱">
            <p>Vài bước đầu để làm quen:</p>
            <CmdList
              items={[
                { c: "/daily", d: "điểm danh nhận thưởng mỗi ngày (có chuỗi streak)" },
                { c: "/work", d: "đi làm kiếm tiền — nguồn thu chính lúc đầu" },
                { c: "/bank balance", d: "xem ví / ngân hàng / cấp độ / năng lượng" },
                { c: "/status", d: "xem năng lượng, sức khỏe, buff, Premium, sự kiện" },
                { c: "/help", d: "xem toàn bộ lệnh" },
              ]}
            />
          </Card>

          <Card id="kiem-tien" title="Kiếm tiền · Năng lượng · Mệt mỏi" emoji="💼">
            <p>
              Mỗi lần làm việc tốn <strong>năng lượng ⚡</strong> (tối đa 100, tự hồi +1/phút). Khi{" "}
              <strong>năng lượng hoặc sức khỏe tụt dưới 50%</strong>, thu nhập bắt đầu giảm dần (tối đa còn 50%) — nên
              nghỉ ngơi hồi sức rồi hẵng cày tiếp.
            </p>
            <CmdList
              items={[
                { c: "/work /fish /mine /chop", d: "các cách kiếm tiền (tốn năng lượng)" },
                { c: "/nghingoi", d: "ngủ hồi đầy năng lượng (có thời gian chờ)" },
                { c: "/eat <món>", d: "ăn đồ để hồi năng lượng hoặc nhận buff" },
                { c: "/hospital", d: "hồi đầy sức khỏe (tốn 10% tài sản)" },
                { c: "/jobs", d: "đổi nghề để lương cao hơn khi lên cấp" },
                { c: "/quest", d: "nhận & hoàn thành nhiệm vụ lấy thưởng" },
              ]}
            />
          </Card>

          <Card id="cua-hang" title="Cửa hàng · Mua bán · Đồ ăn & Buff" emoji="🏪">
            <p>
              Dùng lệnh <code className="text-pink-300">/store list</code> xem hàng, <code className="text-pink-300">/store buy &lt;vật phẩm&gt;</code> mua, và{" "}
              <code className="text-pink-300">/store sell &lt;vật phẩm&gt;</code> bán lại vật phẩm trong kho đồ (thu về <strong>50% giá</strong>). Cậu cũng có thể chạy <code className="text-pink-300">/craft</code> để chế tạo đồ xịn từ gỗ/đá/quặng.
            </p>
            
            <div className="space-y-4 pt-2">
              <div>
                <p className="font-bold text-white mb-2.5 text-sm flex items-center gap-1.5">
                  <span>🥤</span> Đồ ăn hồi năng lượng (⚡):
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <ItemWidget type="banh_mi" name="Bánh Mì Việt Nam" effect="+25 ⚡" price="150đ" />
                  <ItemWidget type="xoi_xeo" name="Xôi Xéo Hà Nội" effect="+40 ⚡" price="250đ" />
                  <ItemWidget type="cafe" name="Cà Phê Sữa Đá" effect="+60 ⚡" price="500đ" />
                  <ItemWidget type="soda" name="Soda Trái Cây Gekka" effect="+100 ⚡ (Đầy năng lượng)" price="1.000đ" />
                </div>
              </div>

              <div>
                <p className="font-bold text-white mb-2.5 text-sm flex items-center gap-1.5">
                  <span>💊</span> Hồi sức khỏe (❤️) & Buff thu nhập (🍗):
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <ItemWidget type="pill" name="Thuốc cảm cúm" effect="+20 ❤️" price="1.000đ" />
                  <ItemWidget type="medkit" name="Hộp Y Tế Kikyo" effect="+50 ❤️" price="3.500đ" />
                  <ItemWidget type="rice" name="Cơm Gà Việt" effect="+20% thu nhập trong 1 giờ" price="2.000đ" />
                  <ItemWidget type="cake" name="Bánh Kem Dâu Gekka" effect="+50% thu nhập trong 6 giờ" price="20.000đ" />
                  <ItemWidget type="cake" name="Bánh Cheesecake Gekka" effect="+100% thu nhập trong 8 giờ" price="35.000đ" />
                </div>
              </div>

              <div>
                <p className="font-bold text-white mb-2.5 text-sm flex items-center gap-1.5">
                  <span>💎</span> Vật phẩm khai thác & Sưu tầm siêu hiếm:
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <ItemWidget type="fish" name="Cá Rồng Kim Long" effect="Sử Thi • Tỉ lệ 0.4% khi đi câu / Nguyên liệu" price="20.000đ" />
                  <ItemWidget type="fish" name="Cá Koi Hoàng Gia" effect="Huyền Thoại • Tỉ lệ 0.1% khi đi câu / Flex" price="80.000đ" />
                  <ItemWidget type="gold" name="Vàng Đông Triều" effect="Hiếm • Tỉ lệ 1% khi đào mỏ / Chế tác" price="5.000đ" />
                  <ItemWidget type="wood" name="Kỳ Nam" effect="Sử Thi • Tỉ lệ 0.5% khi chặt gỗ / Chế tác" price="15.000đ" />
                </div>
              </div>
            </div>
          </Card>

          <Card id="minigame" title="Minigame May Rủi" emoji="🎲">
            <CmdList
              items={[
                { c: "/taixiu /baucua /coinflip", d: "trò may rủi nhanh, đặt cửa thắng thua bằng tiền ảo" },
                { c: "/blackjack /bacay /xocdia", d: "bài & xóc đĩa" },
                { c: "/crate", d: "mở rương bí ẩn nhận vật phẩm" },
                { c: "/duangua", d: "đặt cửa đua ngựa" },
                { c: "/loto /bingo", d: "chơi nhiều người trong phòng voice, máy gọi số" },
                { c: "/masoi", d: "Ma Sói 4–15 người, suy luận tìm Sói (có vai bí mật)" },
              ]}
            />
          </Card>

          <Card id="nuoi-heo" title="Nuôi heo 🐷" emoji="🐷">
            <p>
              Chu trình: <strong>mua → cho ăn → tắm → cho ngủ → cho ăn lần 2 (trưởng thành) → bán</strong>. Mỗi bước chăm
              sóc cách nhau ~15 phút; bỏ bê quá 4 tiếng heo sẽ bệnh. Bán heo cho ra <strong>Thịt Heo</strong> (vào kho){" "}
              <code>/eat</code> hồi sức hoặc <code>/store sell</code> lấy tiền. Heo càng hiếm giá càng cao (2.000 → 50.000 với
              Heo Hologram huyền thoại).
            </p>
            <CmdList
              items={[
                { c: "/heo mua · w!muaheo", d: "mua heo con (1.000, tặng 1 cám)" },
                { c: "/heo an · w!heoan", d: "cho ăn (lần 1 free, lần 2 tốn 500 → trưởng thành)" },
                { c: "/heo tam · w!tamheo [@ai]", d: "tắm cho heo (hoặc tắm hộ người khác)" },
                { c: "/heo ngu · w!heongu", d: "cho heo ngủ" },
                { c: "/heo ban · w!banheo", d: "chế biến & bán heo trưởng thành" },
                { c: "/heo chuabenh · w!chuabenh", d: "chữa bệnh cho heo (1.000)" },
                { c: "/heo trom · w!tromheo @ai", d: "trộm heo trưởng thành của người khác (rủi ro!)" },
                { c: "/heo box · w!pigbox [@ai]", d: "mở/tặng hộp may mắn Pigbox (2.400, tối đa 10 lần/ngày)" },
              ]}
            />
          </Card>

          <Card id="trong-cay" title="Trồng cây 🌱" emoji="🌱">
            <p>
              Chu trình: <strong>mua giống → tưới 3 lần (mỗi lần cách 3 tiếng) → trưởng thành → thu hoạch (sau 1 giờ)</strong>.
              Bón phân hoặc nhờ người tưới hộ để nhanh hơn. Bón tưới quá 5 tiếng cây chết (cần hồi sinh). Thu hoạch ra{" "}
              <strong>trái cây</strong> (<code>/eat</code> hồi sức / <code>/store sell</code>) hoặc <strong>hoa</strong> (<code>/store sell</code>).
              Để mặc quá 1h30 người khác có thể trộm; quá 4 tiếng bị sâu bọ phá mất trắng.
            </p>
            <CmdList
              items={[
                { c: "/trongcay muagiong · w!muagiong", d: "mua giống & trồng (500)" },
                { c: "/trongcay tuoi · w!tuoinuoc [@ai]", d: "tưới nước (hoặc tưới hộ người khác)" },
                { c: "/trongcay bonphan · w!bonphan", d: "bón phân để cây thêm 1 nước ngay (200)" },
                { c: "/trongcay thuhoach · w!thuhoach", d: "thu hoạch cây trưởng thành" },
                { c: "/trongcay hoisinh · w!hoisinh", d: "hồi sinh cây đã chết (1.000)" },
                { c: "/trongcay phacay · w!phacay", d: "phá cây hiện tại để trồng cây mới" },
                { c: "/trongcay trom · w!trom @ai", d: "trộm cây trưởng thành của người khác (rủi ro!)" },
                { c: "/trongcay box · w!plantbox [@ai]", d: "mở/tặng hộp may mắn Plantbox (240, tối đa 10 lần/ngày)" },
              ]}
            />
          </Card>

          <Card id="che-tao" title="Chế tạo & Khai thác 🔨" emoji="🔨">
            <p>
              Khai thác nguyên liệu từ thiên nhiên bằng cách đi câu cá, đào mỏ, chặt gỗ. Sau đó dùng lệnh{" "}
              <code>/craft make</code> để chế tạo các thành phẩm cao cấp hơn để bán lấy VNĐ hoặc dùng làm nguyên liệu nâng cấp tiệm bánh!
            </p>
            
            <div className="space-y-4 pt-2">
              <div>
                <p className="font-bold text-white mb-2 text-sm flex items-center gap-1.5">
                  <span>⛏️</span> Hoạt động khai thác:
                </p>
                <ul className="list-disc pl-5 space-y-1.5 text-slate-400 text-sm">
                  <li>
                    <strong>Đào mỏ</strong> <code>/mine</code> (cần Cuốc Sắt) &rarr; nhận VNĐ, có cơ hội nhặt thêm <strong>Đá</strong>, <strong>Quặng Sắt</strong> và siêu hiếm 🟡 <strong>Vàng Đông Triều</strong> (1%).
                  </li>
                  <li>
                    <strong>Chặt gỗ</strong> <code>/chop</code> (cần Rìu Sắt) &rarr; nhận VNĐ, có cơ hội nhặt thêm <strong>Gỗ</strong> và siêu hiếm 🌲 <strong>Kỳ Nam</strong> (0.5%).
                  </li>
                  <li>
                    <strong>Câu cá</strong> <code>/fish</code> (cần Cần Câu Cá) &rarr; nhận VNĐ, có cơ hội nhặt thêm <strong>Cá Tươi</strong>, <strong>Cá Ngon</strong>, <strong>Cá Hiếm</strong>, siêu hiếm 🏮 <strong>Cá Rồng Kim Long</strong> (0.4%) và 👑 <strong>Cá Koi Hoàng Gia</strong> (0.1%).
                  </li>
                </ul>
              </div>

              <div>
                <p className="font-bold text-white mb-2 text-sm flex items-center gap-1.5">
                  <span>📜</span> Bảng công thức chế tạo (<code>/craft list</code>):
                </p>
                <div className="grid grid-cols-1 gap-3.5 text-sm">
                  {[
                    { name: "Tấm Gỗ", id: "tam_go", mats: "3× Gỗ Thô", fee: "Miễn phí", desc: "Nguyên liệu chế tạo nội thất." },
                    { name: "Thỏi Sắt", id: "thoi_sat", mats: "3× Quặng Sắt", fee: "Miễn phí", desc: "Nguyên liệu chế tạo nội thất & trang sức." },
                    { name: "Đồ Nghề Trộm", id: "do_trom", mats: "2× Gỗ + 1× Quặng Sắt", fee: "Miễn phí", desc: "Dùng để đi trộm heo/cây mà không tốn tiền mua đồ nghề." },
                    { name: "Vòng Tay Trầm Hương", id: "tram_huong_vong", mats: "1× Kỳ Nam + 2× Thỏi Sắt", fee: "Miễn phí", desc: "Quà tặng Waguri tăng cực lớn thiện cảm (+50 Love) hoặc flex." },
                    { name: "Bộ Nội Thất Gỗ", id: "noi_that", mats: "4× Tấm Gỗ + 2× Thỏi Sắt", fee: "1.300đ", desc: "Dùng nâng cấp Tiệm bánh Gekka hoặc bán lại 2.500đ." },
                    { name: "Trang Sức Đá Quý", id: "trang_suc", mats: "6× Đá + 2× Thỏi Sắt", fee: "2.200đ", desc: "Dùng nâng cấp Tiệm bánh Gekka hoặc bán lại 3.000đ." },
                    { name: "Vương Miện Đá Quý", id: "vuong_mieng_gold", mats: "1× Vàng Đông Triều + 2× Thỏi Sắt + 6× Đá + 1× Trang Sức Đá Quý", fee: "Miễn phí", desc: "Tuyệt phẩm chế tác xa xỉ thể hiện đẳng cấp hoàng gia." },
                  ].map((recipe) => (
                    <div key={recipe.id} className="p-3.5 rounded-xl bg-pink-500/5 border border-pink-300/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:border-pink-300/30 hover:bg-pink-500/10 transition-all shadow-md">
                      <div>
                        <p className="font-bold text-white flex items-center gap-1.5">
                          <span>🔨</span> {recipe.name} 
                          <code className="text-xs bg-pink-500/10 text-pink-300 border border-pink-300/15 px-1.5 py-0.5 rounded font-mono">
                            {recipe.id}
                          </code>
                        </p>
                        <p className="text-xs text-slate-400 mt-1">{recipe.desc}</p>
                        <p className="text-xs text-pink-200/80 mt-1 font-semibold">Công thức: {recipe.mats}</p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <span className="text-xs px-2.5 py-1 rounded bg-pink-500/10 text-pink-300 font-bold border border-pink-300/15 whitespace-nowrap">
                          Công: {recipe.fee}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </Card>

          <Card id="nong-trai" title="Vòng khép kín nông trại 🔁" emoji="🔁">
            <p>
              Nuôi heo và trồng cây liên kết với nhau và với việc kiếm nguyên liệu, giúp tiết kiệm tiền:
            </p>
            <ul className="list-disc pl-5 space-y-1.5 text-slate-400">
              <li>
                <strong>Thu hoạch cây</strong> &rarr; nhận thêm <strong>Cám Heo</strong> 🌽 &rarr; dùng cho heo ăn lần 2{" "}
                <em>miễn phí</em> (thay vì 500đ).
              </li>
              <li>
                <strong>Nuôi heo</strong> (cho ngủ) &rarr; nhặt được <strong>Phân Bón</strong> 💩 &rarr; bón cây <em>miễn phí</em>{" "}
                (thay vì 200đ).
              </li>
              <li>
                <code>/chop</code> + <code>/mine</code> &rarr; <code>/craft</code> ra <strong>Đồ Nghề Trộm</strong> 🧰 &rarr; đi trộm
                heo/cây <em>khỏi tốn tiền</em> mua đồ.
              </li>
              <li>
                Nghề <strong>Nông dân nông trại</strong> mở khoá ở Lv.5 trong <code>/jobs</code> — lương khá, rủi ro thấp.
              </li>
              <li>
                <code>/tangdo @ai &lt;vật phẩm&gt;</code> — tặng vật phẩm (hoa, thịt, đồ ăn...) cho người khác.
              </li>
            </ul>
          </Card>

          <Card id="he-giam" title="Hệ giam 🚓" emoji="🚓">
            <p>
              Các hành vi &quot;phạm pháp&quot; — <code>/rob</code> cướp tiền, trộm heo/cây — nếu <strong>thất bại 3 lần</strong> mà
              không đủ tiền nộp phạt, cậu sẽ bị <strong>giam giữ</strong>: tạm thời không dùng được các lệnh kiếm tiền, cờ
              bạc và đi trộm cho tới khi được thả. Mua <strong>Bảo Hiểm Học Đường</strong> ở <code>/store list</code> để giảm nửa
              thời gian bị giam. Xem trạng thái giam ở <code>/status</code>.
            </p>
          </Card>

          <Card id="ai-chat" title="Trò chuyện cùng Waguri 💬" emoji="💬">
            <CmdList
              items={[
                { c: "/ask · @Waguri", d: "trò chuyện với Waguri Kaoruko (AI dịu dàng)" },
                { c: "/couple status", d: "xem mức thân thiết với Waguri & tình cảm bạn đời 💞" },
                { c: "/premium", d: "gói Premium: thêm lượt chat AI + 10% thu nhập" },
              ]}
            />
          </Card>

          <section className="glass-panel w-full p-6 md:p-8 rounded-2xl border border-pink-300/20 flex flex-col sm:flex-row items-center justify-between gap-5">
            <p className="text-slate-300 text-sm text-center sm:text-left">
              Sẵn sàng bắt đầu chưa nào? Mời Waguri về server và cùng nhau làm giàu nhé! 🌸
            </p>
            <div className="flex gap-3 flex-shrink-0">
              <a
                href="https://discord.com/oauth2/authorize?client_id=1482620714690543738&permissions=1099512007760&integration_type=0&scope=bot+applications.commands"
                target="_blank"
                rel="noopener noreferrer"
                className="px-6 py-3 rounded-full font-bold bg-pink-300 text-[#0d0812] hover:bg-pink-400 transition-all whitespace-nowrap"
              >
                Mời Waguri 🌸
              </a>
              <a
                href="https://top.gg/bot/1482620714690543738/vote"
                target="_blank"
                rel="noopener noreferrer"
                className="px-6 py-3 rounded-full font-bold border border-pink-300/30 text-pink-200 hover:border-pink-300/60 transition-all whitespace-nowrap"
              >
                💝 Vote
              </a>
            </div>
          </section>
        </main>
      )}

      <SiteFooter />
      <WaguriFloat />
    </div>
  );
}
