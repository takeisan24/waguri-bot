const { createClient } = require('@supabase/supabase-js');
const config = require('./config');

// 1. Tải các biến môi trường cấu hình Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('[ERROR] Thiếu cấu hình SUPABASE_URL hoặc SUPABASE_SERVICE_KEY trong file .env');
    process.exit(1);
}

// 2. Khởi tạo kết nối Supabase
const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * Lấy thông tin user (nếu chưa có thì tự động tạo mới với 0đ).
 * @param {string} userId - Discord ID của người dùng
 * @returns {object|null} - Thông tin người dùng
 */
async function getUser(userId) {
    try {
        const { data, error } = await supabase
            .from('users')
            .select('*')
            .eq('user_id', userId)
            .single();

        if (error && error.code === 'PGRST116') {
            // Lỗi PGRST116: Không tìm thấy dòng nào -> User mới, tự tạo.
            const { data: newUser, error: insertError } = await supabase
                .from('users')
                .insert([{ user_id: userId }])
                .select()
                .single();

            if (insertError) throw insertError;
            return newUser;
        }

        if (error) throw error;
        return data;

    } catch (error) {
        console.error(`[DATABASE ERROR] Lỗi getUser(${userId}):`, error);
        return null;
    }
}

/**
 * Cộng / trừ tiền NGUYÊN TỬ qua RPC increment_balance.
 * Phép cộng xảy ra trong DB nên KHÔNG bị race condition (dupe tiền),
 * và chặn số dư âm ngay trong câu UPDATE.
 * @param {string} userId - Discord ID
 * @param {number} amount - Số tiền (âm để trừ)
 * @param {string} type - 'wallet' hoặc 'bank'
 * @returns {boolean} - true nếu thành công, false nếu không đủ tiền/lỗi
 */
async function addMoney(userId, amount, type = 'wallet') {
    try {
        const { data, error } = await supabase.rpc('increment_balance', {
            p_user_id: userId,
            p_field: type,
            p_amount: amount,
        });

        if (error) throw error;
        // RPC trả NULL khi guard chặn (số dư không đủ) -> thất bại
        return data !== null;

    } catch (error) {
        console.error(`[DATABASE ERROR] Lỗi addMoney(${userId}):`, error);
        return false;
    }
}

/**
 * Chuyển tiền giữa 2 user trong 1 transaction (atomic).
 * @returns {boolean} - true nếu thành công, false nếu thiếu tiền / input sai.
 */
async function transferMoney(fromUserId, toUserId, amount) {
    try {
        const { data, error } = await supabase.rpc('transfer_money', {
            p_from: fromUserId,
            p_to: toUserId,
            p_amount: amount,
        });

        if (error) throw error;
        return data === true;

    } catch (error) {
        console.error(`[DATABASE ERROR] Lỗi transferMoney(${fromUserId} -> ${toUserId}):`, error);
        return false;
    }
}

/**
 * Chuyển tiền nguyên tử kèm thuế.
 */
async function transferMoneyWithTax(fromUserId, toUserId, amount, taxPct) {
    try {
        const { data, error } = await supabase.rpc('transfer_money_with_tax', {
            p_from: fromUserId,
            p_to: toUserId,
            p_amount: amount,
            p_tax_pct: taxPct,
        });

        if (error) throw error;
        return data === true;

    } catch (error) {
        console.error(`[DATABASE ERROR] Lỗi transferMoneyWithTax(${fromUserId} -> ${toUserId}):`, error);
        return false;
    }
}

/**
 * Cộng EXP nguyên tử qua RPC add_exp.
 * @returns {number|null} - Tổng EXP MỚI (để tính level), hoặc null nếu lỗi.
 */
async function updateExp(userId, expAmount) {
    try {
        const { data, error } = await supabase.rpc('add_exp', {
            p_user_id: userId,
            p_amount: expAmount,
        });

        if (error) throw error;
        return data === null ? null : Number(data);

    } catch (error) {
        console.error(`[DATABASE ERROR] Lỗi updateExp():`, error);
        return null;
    }
}

/**
 * CHỈ ĐỌC: kiểm tra cooldown mà KHÔNG đặt (dùng để hiển thị thời gian chờ).
 * @returns {boolean|number} - false nếu không bị cooldown, timestamp(ms) nếu đang bị.
 */
async function checkCooldown(userId, command) {
    try {
        const { data, error } = await supabase
            .from('cooldowns')
            .select('*')
            .eq('user_id', userId)
            .eq('command', command)
            .single();

        if (error && error.code !== 'PGRST116') throw error; // Bỏ qua lỗi ko tìm thấy dòng

        if (data) {
            const now = new Date();
            const expiresAt = new Date(data.expires_at);
            if (now < expiresAt) {
                return expiresAt.getTime();
            }
        }

        return false;

    } catch (error) {
        console.error(`[DATABASE ERROR] Lỗi checkCooldown():`, error);
        return false;
    }
}

/**
 * NGUYÊN TỬ: kiểm tra + đặt cooldown trong 1 lần gọi (chống claim đúp khi spam).
 * Nên dùng hàm NÀY trong command thay cho checkCooldown + setCooldown.
 * @param {string} userId
 * @param {string} command
 * @param {number} durationSeconds - thời gian chờ (giây)
 * @returns {boolean|number} - false nếu CLAIM ĐƯỢC (cho phép chạy lệnh),
 *                             timestamp(ms) nếu ĐANG bị cooldown.
 */
async function claimCooldown(userId, command, durationSeconds) {
    try {
        const { data, error } = await supabase.rpc('claim_cooldown', {
            p_user_id: userId,
            p_command: command,
            p_duration_seconds: durationSeconds,
        });

        if (error) throw error;
        // RPC trả NULL => claim thành công (được phép chạy)
        if (!data) return false;
        return new Date(data).getTime();

    } catch (error) {
        console.error(`[DATABASE ERROR] Lỗi claimCooldown():`, error);
        // Fail-open: nếu DB lỗi, không chặn user (tránh khóa cứng do sự cố hạ tầng)
        return false;
    }
}

/**
 * @deprecated Không nguyên tử. Dùng claimCooldown() để tránh race condition.
 * Giữ lại để tương thích ngược.
 */
async function setCooldown(userId, command, durationMinutes) {
    try {
        const now = new Date();
        const expiresAt = new Date(now.getTime() + durationMinutes * 60000);

        const { error } = await supabase
            .from('cooldowns')
            .upsert({
                user_id: userId,
                command: command,
                expires_at: expiresAt.toISOString(),
            }, { onConflict: 'user_id,command' });

        if (error) throw error;
        return true;

    } catch (error) {
        console.error(`[DATABASE ERROR] Lỗi setCooldown():`, error);
        return false;
    }
}

// ============================================================
//  JOBS — nghề nghiệp
// ============================================================
async function getJobs() {
    try {
        const { data, error } = await supabase.from('jobs').select('*').order('required_level');
        if (error) throw error;
        return data || [];
    } catch (error) {
        console.error('[DATABASE ERROR] getJobs():', error);
        return [];
    }
}

async function getJob(jobId) {
    try {
        const { data, error } = await supabase.from('jobs').select('*').eq('id', jobId).single();
        if (error && error.code !== 'PGRST116') throw error;
        return data || null;
    } catch (error) {
        console.error('[DATABASE ERROR] getJob():', error);
        return null;
    }
}

async function setUserJob(userId, jobId) {
    try {
        await getUser(userId); // đảm bảo user tồn tại
        const { error } = await supabase.from('users').update({ job_id: jobId }).eq('user_id', userId);
        if (error) throw error;
        return true;
    } catch (error) {
        console.error('[DATABASE ERROR] setUserJob():', error);
        return false;
    }
}

// ============================================================
//  ITEMS / SHOP — vật phẩm
// ============================================================
async function getItems() {
    try {
        const { data, error } = await supabase.from('items').select('*').order('price');
        if (error) throw error;
        return data || [];
    } catch (error) {
        console.error('[DATABASE ERROR] getItems():', error);
        return [];
    }
}

async function getItem(itemId) {
    try {
        const { data, error } = await supabase.from('items').select('*').eq('id', itemId).single();
        if (error && error.code !== 'PGRST116') throw error;
        return data || null;
    } catch (error) {
        console.error('[DATABASE ERROR] getItem():', error);
        return null;
    }
}

/**
 * Mua vật phẩm NGUYÊN TỬ qua RPC buy_item.
 * @returns {string} 'ok' | 'no_item' | 'insufficient_funds' | 'bad_quantity' | 'error'
 */
async function buyItem(userId, itemId, quantity = 1) {
    try {
        const { data, error } = await supabase.rpc('buy_item', {
            p_user_id: userId,
            p_item_id: itemId,
            p_quantity: quantity,
        });
        if (error) throw error;
        return data;
    } catch (error) {
        console.error('[DATABASE ERROR] buyItem():', error);
        return 'error';
    }
}

// ============================================================
//  INVENTORY — kho đồ
// ============================================================
async function getInventory(userId) {
    try {
        const { data, error } = await supabase
            .from('inventory')
            .select('quantity, item_id, items(name, type, price)')
            .eq('user_id', userId)
            .gt('quantity', 0);
        if (error) throw error;
        return data || [];
    } catch (error) {
        console.error('[DATABASE ERROR] getInventory():', error);
        return [];
    }
}

async function hasItem(userId, itemId) {
    try {
        const { data, error } = await supabase
            .from('inventory').select('quantity')
            .eq('user_id', userId).eq('item_id', itemId).single();
        if (error && error.code !== 'PGRST116') throw error;
        return !!(data && data.quantity > 0);
    } catch (error) {
        console.error('[DATABASE ERROR] hasItem():', error);
        return false;
    }
}

/**
 * Sử dụng bảo hiểm: Trừ 1 số lượng bảo hiểm nếu có.
 */
async function useInsurance(userId, itemId) {
    try {
        const { data, error } = await supabase.rpc('use_insurance', {
            p_user_id: userId,
            p_item_id: itemId,
        });
        if (error) throw error;
        return data === true;
    } catch (error) {
        console.error(`[DATABASE ERROR] Lỗi useInsurance(${userId}, ${itemId}):`, error);
        return false;
    }
}

/**
 * Sử dụng công cụ (Giảm độ bền đi 2). Trả { status, durability, broken } hoặc null.
 */
async function useTool(userId, itemId) {
    try {
        const { data, error } = await supabase.rpc('use_tool', {
            p_user_id: userId,
            p_item_id: itemId,
        });
        if (error) throw error;
        return data;
    } catch (error) {
        console.error(`[DATABASE ERROR] Lỗi useTool(${userId}, ${itemId}):`, error);
        return null;
    }
}

/**
 * Sửa công cụ (Đặt độ bền về 100 và trừ tiền). Trả 'ok' | 'no_tool' | 'already_repaired' | 'insufficient_funds' | 'error'.
 */
async function repairTool(userId, itemId, cost) {
    try {
        const { data, error } = await supabase.rpc('repair_tool', {
            p_user_id: userId,
            p_item_id: itemId,
            p_cost: cost,
        });
        if (error) throw error;
        return data;
    } catch (error) {
        console.error(`[DATABASE ERROR] Lỗi repairTool(${userId}, ${itemId}):`, error);
        return 'error';
    }
}

/**
 * Nhập viện hồi máu (Trừ viện phí và đặt health = 100).
 * Trả { status, fee } hoặc null nếu lỗi.
 */
async function hospitalHeal(userId) {
    try {
        const { data, error } = await supabase.rpc('hospital_heal', {
            p_user_id: userId,
        });
        if (error) throw error;
        return data;
    } catch (error) {
        console.error(`[DATABASE ERROR] Lỗi hospitalHeal(${userId}):`, error);
        return null;
    }
}

/**
 * Sử dụng xe cộ tốt nhất có sẵn trong kho đồ.
 * Trả { status, vehicle_id, durability, broken } hoặc null.
 */
async function useVehicle(userId) {
    try {
        const { data, error } = await supabase.rpc('use_vehicle', {
            p_user_id: userId,
        });
        if (error) throw error;
        return data;
    } catch (error) {
        console.error(`[DATABASE ERROR] Lỗi useVehicle(${userId}):`, error);
        return null;
    }
}

/**
 * Cộng / trừ sức khỏe của người dùng (giới hạn 0 - 100).
 * @param {string} userId
 * @param {number} amount
 * @returns {object|null}
 */
async function addHealth(userId, amount) {
    try {
        const user = await getUser(userId);
        if (!user) return null;
        const newHealth = Math.max(0, Math.min(100, (user.health || 100) + amount));
        const { data, error } = await supabase
            .from('users')
            .update({ health: newHealth })
            .eq('user_id', userId)
            .select()
            .single();
        if (error) throw error;
        return data;
    } catch (error) {
        console.error(`[DATABASE ERROR] Lỗi addHealth(${userId}):`, error);
        return null;
    }
}

// ============================================================
//  ENERGY / BUFF — năng lượng & hiệu ứng
// ============================================================
/**
 * Tiêu năng lượng nguyên tử (kèm hồi lazy). cost<=0 chỉ để "peek".
 * @returns {number} năng lượng còn lại (>=0), hoặc -1 nếu không đủ.
 */
async function spendEnergy(userId, cost) {
    try {
        const { data, error } = await supabase.rpc('spend_energy', { p_user_id: userId, p_cost: cost });
        if (error) throw error;
        return Number(data);
    } catch (error) {
        console.error('[DATABASE ERROR] spendEnergy():', error);
        return -1;
    }
}

/** Lấy năng lượng hiện tại (đã hồi). */
async function getEnergy(userId) {
    const e = await spendEnergy(userId, 0);
    return e < 0 ? 0 : e;
}

/**
 * Dùng vật phẩm tiêu hao (ăn/uống) qua RPC consume_item.
 * @returns {string} 'ok' | 'no_item' | 'not_consumable' | 'no_have' | 'error'
 */
async function consumeItem(userId, itemId) {
    try {
        const { data, error } = await supabase.rpc('consume_item', { p_user_id: userId, p_item_id: itemId });
        if (error) throw error;
        return data;
    } catch (error) {
        console.error('[DATABASE ERROR] consumeItem():', error);
        return 'error';
    }
}

// ============================================================
//  DAILY / BANK / LEADERBOARD (Sprint 2)
// ============================================================
/** Điểm danh hằng ngày. Trả object {status:'ok',reward,streak} | {status:'claimed',next} | null. */
async function claimDaily(userId) {
    try {
        const { data, error } = await supabase.rpc('claim_daily', { p_user_id: userId });
        if (error) throw error;
        return data;
    } catch (error) {
        console.error('[DATABASE ERROR] claimDaily():', error);
        return null;
    }
}

/** Chuyển ví <-> ngân hàng nguyên tử. toBank=true: gửi vào bank. */
async function transferBank(userId, amount, toBank) {
    try {
        const { data, error } = await supabase.rpc('transfer_bank', {
            p_user_id: userId, p_amount: amount, p_to_bank: toBank,
        });
        if (error) throw error;
        return data === true;
    } catch (error) {
        console.error('[DATABASE ERROR] transferBank():', error);
        return false;
    }
}

/** Lấy bảng xếp hạng. sort='level' theo cấp, ngược lại theo tài sản. */
async function getLeaderboard(sort, limit = 10) {
    try {
        const { data, error } = await supabase.rpc('leaderboard_rows', { p_sort: sort, p_limit: limit });
        if (error) throw error;
        return data || [];
    } catch (error) {
        console.error('[DATABASE ERROR] getLeaderboard():', error);
        return [];
    }
}

/** Bán vật phẩm (atomic, 50% giá). Trả {status:'ok',gain} | {status:'no_have'|...} | null. */
async function sellItem(userId, itemId, quantity = 1) {
    try {
        const { data, error } = await supabase.rpc('sell_item', {
            p_user_id: userId, p_item_id: itemId, p_quantity: quantity,
        });
        if (error) throw error;
        return data;
    } catch (error) {
        console.error('[DATABASE ERROR] sellItem():', error);
        return null;
    }
}

// ============================================================
//  QUESTS — nhiệm vụ hằng ngày
// ============================================================
/** Cộng tiến độ nhiệm vụ (fire-and-forget, tự nuốt lỗi). */
async function questIncr(userId, key, amount) {
    try {
        const { error } = await supabase.rpc('quest_incr', { p_user_id: userId, p_key: key, p_amount: amount });
        if (error) throw error;
        return true;
    } catch (error) {
        console.error('[DATABASE ERROR] questIncr():', error);
        return false;
    }
}

/** Lấy tiến độ + đã-nhận của HÔM NAY. */
async function getQuestRow(userId) {
    try {
        const today = new Date().toISOString().slice(0, 10);
        const { data, error } = await supabase
            .from('quest_progress').select('counters, claimed')
            .eq('user_id', userId).eq('quest_date', today).single();
        if (error && error.code !== 'PGRST116') throw error;
        return { counters: data?.counters || {}, claimed: data?.claimed || {} };
    } catch (error) {
        console.error('[DATABASE ERROR] getQuestRow():', error);
        return { counters: {}, claimed: {} };
    }
}

/** Nhận thưởng 1 nhiệm vụ. Trả 'ok' | 'claimed' | 'not_done' | 'error'. */
async function questClaim(userId, quest) {
    try {
        const { data, error } = await supabase.rpc('quest_claim', {
            p_user_id: userId, p_quest_id: quest.id, p_key: quest.key,
            p_required: quest.required, p_reward: quest.reward,
        });
        if (error) throw error;
        return data;
    } catch (error) {
        console.error('[DATABASE ERROR] questClaim():', error);
        return 'error';
    }
}

// ============================================================
//  ACHIEVEMENTS — thành tựu
// ============================================================
/** Trả về Set các achievement_id user đã mở khóa. */
async function getAchievements(userId) {
    try {
        const { data, error } = await supabase.from('achievements').select('achievement_id').eq('user_id', userId);
        if (error) throw error;
        return new Set((data || []).map(r => r.achievement_id));
    } catch (error) {
        console.error('[DATABASE ERROR] getAchievements():', error);
        return new Set();
    }
}

/** Mở khóa nhiều thành tựu (bỏ qua trùng). */
async function unlockAchievements(userId, ids) {
    try {
        if (!ids || !ids.length) return true;
        const rows = ids.map(id => ({ user_id: userId, achievement_id: id }));
        const { error } = await supabase.from('achievements').upsert(rows, { onConflict: 'user_id,achievement_id', ignoreDuplicates: true });
        if (error) throw error;
        return true;
    } catch (error) {
        console.error('[DATABASE ERROR] unlockAchievements():', error);
        return false;
    }
}

// ============================================================
//  MARRIAGE — kết đôi
// ============================================================
/** Kết hôn 2 người (atomic). Trả 'ok' | 'already' | 'self' | 'error'. */
async function marryUsers(a, b) {
    try {
        const { data, error } = await supabase.rpc('marry_users', { p_a: a, p_b: b });
        if (error) throw error;
        return data;
    } catch (error) {
        console.error('[DATABASE ERROR] marryUsers():', error);
        return 'error';
    }
}

/** Tăng điểm thiện cảm với Waguri, trả điểm mới (hoặc null). */
async function incrAffection(userId, amount) {
    try {
        const { data, error } = await supabase.rpc('add_affection', { p_user_id: userId, p_amount: amount });
        if (error) throw error;
        return Number(data);
    } catch (error) {
        console.error('[DATABASE ERROR] incrAffection():', error);
        return null;
    }
}

/** Ly hôn. Trả 'ok' | 'single' | 'error'. */
async function divorceUser(userId) {
    try {
        const { data, error } = await supabase.rpc('divorce_user', { p_user: userId });
        if (error) throw error;
        return data;
    } catch (error) {
        console.error('[DATABASE ERROR] divorceUser():', error);
        return 'error';
    }
}

// ============================================================
//  PETS — thú cưng
// ============================================================
async function getPet(userId) {
    try {
        const { data, error } = await supabase.from('user_pets').select('*').eq('user_id', userId).single();
        if (error && error.code !== 'PGRST116') throw error;
        return data || null;
    } catch (error) {
        console.error('[DATABASE ERROR] getPet():', error);
        return null;
    }
}

/** Nhận nuôi. Trả 'ok' | 'already' | 'error'. */
async function adoptPet(userId, species, name) {
    try {
        if (await getPet(userId)) return 'already';
        const { error } = await supabase.from('user_pets').insert([{ user_id: userId, species, name }]);
        if (error) throw error;
        return 'ok';
    } catch (error) {
        console.error('[DATABASE ERROR] adoptPet():', error);
        return 'error';
    }
}

async function renamePet(userId, name) {
    try {
        const { error } = await supabase.from('user_pets').update({ name }).eq('user_id', userId);
        if (error) throw error;
        return true;
    } catch (error) {
        console.error('[DATABASE ERROR] renamePet():', error);
        return false;
    }
}

/** Cho ăn (cộng exp). Trả exp mới, hoặc null nếu chưa có pet. */
async function feedPet(userId, exp) {
    try {
        const { data, error } = await supabase.rpc('feed_pet', { p_user: userId, p_exp: exp });
        if (error) throw error;
        return data === null ? null : Number(data);
    } catch (error) {
        console.error('[DATABASE ERROR] feedPet():', error);
        return null;
    }
}

// ============================================================
//  GUILD SETTINGS — cấu hình theo server
// ============================================================
/** Lấy object settings của một guild ({} nếu chưa có). */
async function getGuildSettings(guildId) {
    try {
        const { data, error } = await supabase.from('guild_settings').select('settings').eq('guild_id', guildId).single();
        if (error && error.code !== 'PGRST116') throw error;
        return data?.settings || {};
    } catch (error) {
        console.error('[DATABASE ERROR] getGuildSettings():', error);
        return {};
    }
}

/** Đặt 1 khóa cấu hình cho guild. */
async function setGuildSetting(guildId, key, value) {
    try {
        const { error } = await supabase.rpc('set_guild_setting', { p_guild: guildId, p_key: key, p_value: String(value) });
        if (error) throw error;
        return true;
    } catch (error) {
        console.error('[DATABASE ERROR] setGuildSetting():', error);
        return false;
    }
}

/** Tăng & trả số thứ tự confession kế tiếp của guild. */
async function nextConfessionNumber(guildId) {
    const s = await getGuildSettings(guildId);
    const n = Number(s.confession_count || 0) + 1;
    await setGuildSetting(guildId, 'confession_count', n);
    return n;
}

// ============================================================
//  AI QUOTA & PREMIUM
// ============================================================
/** Tiêu 1 lượt quota AI. Trả {allowed, used, cap, premium} hoặc null nếu lỗi. */
async function consumeAiQuota(userId, freeCap, premiumCap) {
    try {
        const { data, error } = await supabase.rpc('consume_ai_quota', {
            p_user_id: userId, p_free: freeCap, p_premium: premiumCap,
        });
        if (error) throw error;
        return data;
    } catch (error) {
        console.error('[DATABASE ERROR] consumeAiQuota():', error);
        return null;
    }
}

/** Cấp/gia hạn Premium thêm số ngày. Trả mốc hết hạn mới (ISO) hoặc null. */
async function grantPremium(userId, days) {
    try {
        const { data, error } = await supabase.rpc('grant_premium', { p_user_id: userId, p_days: days });
        if (error) throw error;
        return data;
    } catch (error) {
        console.error('[DATABASE ERROR] grantPremium():', error);
        return null;
    }
}

// ============================================================
//  XỔ SỐ (lottery)
// ============================================================
const { LOTTERY } = config;
const lotterySecs = () => LOTTERY.ROUND_HOURS * 3600;

/** Mua vé xổ số. Trả {status,'my_tickets',pool,round,draw,...} hoặc null. */
async function lotteryBuy(userId, count) {
    try {
        const { data, error } = await supabase.rpc('lottery_buy', {
            p_user_id: userId, p_count: count, p_price: LOTTERY.TICKET_PRICE, p_cut: LOTTERY.HOUSE_CUT, p_secs: lotterySecs(),
        });
        if (error) throw error;
        return data;
    } catch (error) {
        console.error('[DATABASE ERROR] lotteryBuy():', error);
        return null;
    }
}

/** Xem trạng thái xổ số (tự quay nếu hết hạn). Trả jsonb hoặc null. */
async function lotteryView(userId) {
    try {
        const { data, error } = await supabase.rpc('lottery_view', {
            p_user_id: userId, p_cut: LOTTERY.HOUSE_CUT, p_secs: lotterySecs(),
        });
        if (error) throw error;
        return data;
    } catch (error) {
        console.error('[DATABASE ERROR] lotteryView():', error);
        return null;
    }
}

// ============================================================
//  COSMETIC (danh hiệu / màu hồ sơ)
// ============================================================
/** Đặt cosmetic (field: 'title' | 'profile_color'). Trả true/false. */
async function setCosmetic(userId, field, value) {
    if (!['title', 'profile_color'].includes(field)) return false;
    try {
        const { error } = await supabase.from('users').update({ [field]: value }).eq('user_id', userId);
        if (error) throw error;
        return true;
    } catch (error) {
        console.error('[DATABASE ERROR] setCosmetic():', error);
        return false;
    }
}

// ============================================================
//  ADMIN — chỉ owner dùng (qua /eco-admin)
// ============================================================
/** Đặt cứng số dư ví/bank. */
async function setBalance(userId, field, amount) {
    try {
        if (field !== 'wallet' && field !== 'bank') return false;
        await getUser(userId);
        const { error } = await supabase.from('users').update({ [field]: amount }).eq('user_id', userId);
        if (error) throw error;
        return true;
    } catch (error) {
        console.error('[DATABASE ERROR] setBalance():', error);
        return false;
    }
}

/** Đặt cứng EXP. */
async function setExp(userId, value) {
    try {
        await getUser(userId);
        const { error } = await supabase.from('users').update({ exp: value }).eq('user_id', userId);
        if (error) throw error;
        return true;
    } catch (error) {
        console.error('[DATABASE ERROR] setExp():', error);
        return false;
    }
}

/** Đặt cứng năng lượng (reset mốc hồi về now). */
async function setEnergy(userId, value) {
    try {
        await getUser(userId);
        const { error } = await supabase.from('users')
            .update({ energy: value, energy_updated_at: new Date().toISOString() })
            .eq('user_id', userId);
        if (error) throw error;
        return true;
    } catch (error) {
        console.error('[DATABASE ERROR] setEnergy():', error);
        return false;
    }
}

/** Admin cấp vật phẩm miễn phí (atomic). */
async function giveItemAdmin(userId, itemId, qty = 1) {
    try {
        const { data, error } = await supabase.rpc('give_item', { p_user_id: userId, p_item_id: itemId, p_qty: qty });
        if (error) throw error;
        return data === true;
    } catch (error) {
        console.error('[DATABASE ERROR] giveItemAdmin():', error);
        return false;
    }
}

/** Xóa sạch dữ liệu một user (reset). */
async function resetUser(userId) {
    try {
        await supabase.from('inventory').delete().eq('user_id', userId);
        await supabase.from('cooldowns').delete().eq('user_id', userId);
        const { error } = await supabase.from('users').delete().eq('user_id', userId);
        if (error) throw error;
        return true;
    } catch (error) {
        console.error('[DATABASE ERROR] resetUser():', error);
        return false;
    }
}

module.exports = {
    supabase,
    getUser,
    addMoney,
    transferMoney,
    transferMoneyWithTax,
    updateExp,
    checkCooldown,
    claimCooldown,
    setCooldown,
    // jobs
    getJobs,
    getJob,
    setUserJob,
    // items / shop
    getItems,
    getItem,
    buyItem,
    // inventory
    getInventory,
    hasItem,
    useInsurance,
    useTool,
    repairTool,
    hospitalHeal,
    useVehicle,
    addHealth,
    // energy / buff
    spendEnergy,
    getEnergy,
    consumeItem,
    // sprint 2
    claimDaily,
    transferBank,
    getLeaderboard,
    sellItem,
    // quests
    questIncr,
    getQuestRow,
    questClaim,
    // achievements
    getAchievements,
    unlockAchievements,
    // marriage
    marryUsers,
    divorceUser,
    // affection
    incrAffection,
    // pets
    getPet,
    adoptPet,
    renamePet,
    feedPet,
    // guild settings
    getGuildSettings,
    setGuildSetting,
    nextConfessionNumber,
    // ai quota & premium
    consumeAiQuota,
    grantPremium,
    // lottery
    lotteryBuy,
    lotteryView,
    // cosmetic
    setCosmetic,
    // admin
    setBalance,
    setExp,
    setEnergy,
    giveItemAdmin,
    resetUser,
};
