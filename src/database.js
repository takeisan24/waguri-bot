const { createClient } = require('@supabase/supabase-js');
const config = require('./config');

// 1. Tải các biến môi trường cấu hình Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
const rawClient = (supabaseUrl && supabaseKey) ? createClient(supabaseUrl, supabaseKey) : null;

if (!rawClient) {
    console.warn('[WARNING] Thiếu cấu hình SUPABASE_URL hoặc SUPABASE_SERVICE_KEY trong file .env. Truy cập DB sẽ bị lỗi.');
}

// 2. Khởi tạo kết nối Supabase bằng Proxy
const supabase = new Proxy({}, {
    get(target, prop) {
        if (!rawClient) {
            throw new Error('[DATABASE ERROR] Thiếu cấu hình SUPABASE_URL hoặc SUPABASE_SERVICE_KEY trong file .env');
        }
        return rawClient[prop];
    }
});

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
 * Trừ tiền phạt theo TỔNG TÀI SẢN: ví trước, thiếu thì trừ tiếp ngân hàng (atomic).
 * Dùng cho phạt /rob & công an cờ bạc -> không né được bằng cách gửi tiền vào bank.
 * @returns {number} số tiền thực sự bị trừ (>= 0).
 */
async function chargeAssets(userId, amount) {
    try {
        const { data, error } = await supabase.rpc('charge_assets', { p_user: userId, p_amount: amount });
        if (error) throw error;
        return Number(data) || 0;
    } catch (error) {
        console.error('[DATABASE ERROR] chargeAssets():', error);
        return 0;
    }
}

// ============================================================
//  GAME STAKES — cược game đa người (ghi DB để hoàn khi bot restart)
// ============================================================
/** Thu cược nguyên tử (trừ ví + ghi dòng cược). Trả true nếu đủ tiền. */
async function stakeCollect(sessionId, game, channelId, userId, amount) {
    try {
        const { data, error } = await supabase.rpc('stake_collect', { p_session: sessionId, p_game: game, p_channel: channelId, p_user: userId, p_amount: amount });
        if (error) throw error;
        return data === true;
    } catch (error) { console.error('[DATABASE ERROR] stakeCollect():', error); return false; }
}
/** Ván xong bình thường: xoá dòng cược (cược đã thành pot & trả thưởng). */
async function stakeSettle(sessionId) {
    try { const { error } = await supabase.rpc('stake_settle', { p_session: sessionId }); if (error) throw error; return true; }
    catch (error) { console.error('[DATABASE ERROR] stakeSettle():', error); return false; }
}
/** Huỷ ván: hoàn cược cho mọi người chơi rồi xoá. Trả tổng đã hoàn. */
async function stakeRefundSession(sessionId) {
    try { const { data, error } = await supabase.rpc('stake_refund_session', { p_session: sessionId }); if (error) throw error; return Number(data) || 0; }
    catch (error) { console.error('[DATABASE ERROR] stakeRefundSession():', error); return 0; }
}
/** Khởi động bot: hoàn mọi cược còn sót (ván chết do restart). Trả { count, total }. */
async function stakeRefundOrphans() {
    try { const { data, error } = await supabase.rpc('stake_refund_orphans'); if (error) throw error; return data || { count: 0, total: 0 }; }
    catch (error) { console.error('[DATABASE ERROR] stakeRefundOrphans():', error); return { count: 0, total: 0 }; }
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
        // Atomic qua RPC add_health (kẹp 0..100) -> tránh lost-update khi nhiều thay đổi đua nhau.
        const { data, error } = await supabase.rpc('add_health', { p_user_id: userId, p_delta: amount });
        if (error) throw error;
        return data; // sức khỏe mới (int)
    } catch (error) {
        console.error(`[DATABASE ERROR] Lỗi addHealth(${userId}):`, error);
        return null;
    }
}

/** Đánh dấu / bỏ trạng thái bệnh (atomic qua RPC set_sick). */
async function setSick(userId, value) {
    try {
        const { data, error } = await supabase.rpc('set_sick', { p_user_id: userId, p_sick: !!value });
        if (error) throw error;
        return data;
    } catch (error) {
        console.error(`[DATABASE ERROR] Lỗi setSick(${userId}):`, error);
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

/** Lấy bớt vật phẩm khỏi kho (atomic). Trả true nếu đủ. */
async function takeItem(userId, itemId, qty = 1) {
    try {
        const { data, error } = await supabase.rpc('take_item', { p_user_id: userId, p_item_id: itemId, p_qty: qty });
        if (error) throw error;
        return data === true;
    } catch (error) {
        console.error('[DATABASE ERROR] takeItem():', error);
        return false;
    }
}

/** Chuyển vật phẩm giữa 2 người (atomic). Trả true nếu đủ. */
async function transferItem(fromId, toId, itemId, qty = 1) {
    try {
        const { data, error } = await supabase.rpc('transfer_item', { p_from: fromId, p_to: toId, p_item_id: itemId, p_qty: qty });
        if (error) throw error;
        return data === true;
    } catch (error) {
        console.error('[DATABASE ERROR] transferItem():', error);
        return false;
    }
}

/** Tăng đếm lượt/ngày theo key. Trả số đã dùng (>=1) hoặc -1 nếu vượt cap. */
async function claimDailyCounter(userId, key, max) {
    try {
        const { data, error } = await supabase.rpc('claim_daily_counter', { p_user_id: userId, p_key: key, p_max: max });
        if (error) throw error;
        return data;
    } catch (error) {
        console.error('[DATABASE ERROR] claimDailyCounter():', error);
        return -1;
    }
}

/** Tăng mức độ cờ bạc (police_heat) và trả về count mới. */
async function bumpPoliceHeat(userId, decayMs) {
    try {
        const { data, error } = await supabase.rpc('bump_police_heat', { p_user_id: userId, p_decay_ms: decayMs });
        if (error) throw error;
        return Number(data) || 0;
    } catch (error) {
        console.error('[DATABASE ERROR] bumpPoliceHeat():', error);
        return 0;
    }
}

/** Reset mức độ cờ bạc về 0 (khi bị bắt). */
async function resetPoliceHeat(userId) {
    try {
        const { error } = await supabase
            .from('police_heat')
            .upsert({ user_id: userId, count: 0, last_action_at: Date.now() });
        if (error) throw error;
        return true;
    } catch (error) {
        console.error('[DATABASE ERROR] resetPoliceHeat():', error);
        return false;
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
        
        if (data && data.status === 'ok') {
            const pet = await getPet(userId);
            if (pet && pet.species === 'gau') {
                const { petLevel } = require('./data/pets');
                const lvl = petLevel(pet.exp);
                if (lvl >= 5) {
                    const bonus = Math.round(Number(data.gain) * 0.1);
                    if (bonus > 0) {
                        await addMoney(userId, bonus, 'wallet');
                        data.gain = Number(data.gain) + bonus;
                    }
                }
            }
        }
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

/** Cộng tiến độ nhiệm vụ tân thủ. */
async function newbieQuestIncr(userId, key, amount) {
    try {
        const { data, error } = await supabase.rpc('newbie_quest_incr', { p_user_id: userId, p_key: key, p_amount: amount });
        if (error) throw error;
        return data;
    } catch (error) {
        console.error('[DATABASE ERROR] newbieQuestIncr():', error);
        return null;
    }
}

/** Nhận trợ cấp phá sản. Trả 'ok'|'not_bankrupt'|'cooldown'|'error'. */
async function claimBankruptcyRelief(userId, amount) {
    try {
        const { data, error } = await supabase.rpc('claim_bankruptcy_relief', { p_user_id: userId, p_amount: amount });
        if (error) throw error;
        return data;
    } catch (error) {
        console.error('[DATABASE ERROR] claimBankruptcyRelief():', error);
        return 'error';
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

/** Mở khóa nhiều thành tựu (bỏ qua trùng). Trả MẢNG id THỰC SỰ vừa chèn
 *  (ON CONFLICT DO NOTHING -> select chỉ trả dòng mới) để caller trao thưởng ĐÚNG 1 lần,
 *  chống trả thưởng trùng khi 2 lần gọi /achievements đua nhau. [] nếu không có gì mới / lỗi. */
async function unlockAchievements(userId, ids) {
    try {
        if (!ids || !ids.length) return [];
        const rows = ids.map(id => ({ user_id: userId, achievement_id: id }));
        const { data, error } = await supabase.from('achievements')
            .upsert(rows, { onConflict: 'user_id,achievement_id', ignoreDuplicates: true })
            .select('achievement_id');
        if (error) throw error;
        return (data || []).map(r => r.achievement_id);
    } catch (error) {
        console.error('[DATABASE ERROR] unlockAchievements():', error);
        return [];
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

/** Tăng điểm thiện cảm với Waguri, trả { affection, added, capped } (hoặc null). */
async function incrAffection(userId, amount) {
    try {
        const { data, error } = await supabase.rpc('add_affection_v2', { 
            p_user_id: userId, 
            p_amount: amount,
            p_daily_cap: 100
        });
        if (error) throw error;
        return {
            affection: Number(data.affection),
            added: Number(data.added),
            capped: Boolean(data.capped)
        };
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

/** Lưu vết confession ẩn danh cho admin kiểm tra. */
async function logConfession(guildId, userId, confessionNum, content) {
    try {
        const { error } = await supabase
            .from('confession_logs')
            .insert([{
                guild_id: guildId,
                user_id: userId,
                confession_num: confessionNum,
                content: content
            }]);
        if (error) throw error;
        return true;
    } catch (error) {
        console.error('[DATABASE ERROR] logConfession():', error);
        return false;
    }
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
//  GIAM GIỮ (jail) — chặn kiếm tiền/cờ bạc/trộm khi phạm pháp thất bại
// ============================================================
/** Lấy thông tin giam (nhẹ). Trả { jailed_until, jail_reason } hoặc null. */
async function getJail(userId) {
    try {
        const { data, error } = await supabase.from('users')
            .select('jailed_until, jail_reason').eq('user_id', userId).maybeSingle();
        if (error) throw error;
        return data;
    } catch (error) {
        console.error('[DATABASE ERROR] getJail():', error);
        return null;
    }
}

/** Atomic: thử nộp phạt, không đủ tiền thì giam. Trả {result:'fined'|'jailed'|'error', ...}. */
async function jailOrFine(userId, fine, jailHours, reason) {
    try {
        const { data, error } = await supabase.rpc('jail_or_fine', {
            p_user_id: userId, p_fine: fine, p_jail_hours: jailHours, p_reason: reason,
        });
        if (error) throw error;
        return data;
    } catch (error) {
        console.error('[DATABASE ERROR] jailOrFine():', error);
        return { result: 'error' };
    }
}

/** Giảm nửa thời gian giam còn lại (dùng khi có bảo hiểm). */
async function halveJail(userId) {
    try {
        const { error } = await supabase.rpc('halve_jail', { p_user_id: userId });
        if (error) throw error;
        return true;
    } catch (error) {
        console.error('[DATABASE ERROR] halveJail():', error);
        return false;
    }
}

// ============================================================
//  NUÔI HEO (pigs)
// ============================================================
async function getPig(userId) {
    try { const { data, error } = await supabase.from('pigs').select('*').eq('user_id', userId).maybeSingle(); if (error) throw error; return data; }
    catch (e) { console.error('[DATABASE ERROR] getPig():', e); return null; }
}
async function pigBuy(userId, cost) {
    try { const { data, error } = await supabase.rpc('pig_buy', { p_user_id: userId, p_cost: cost }); if (error) throw error; return data; }
    catch (e) { console.error('[DATABASE ERROR] pigBuy():', e); return 'error'; }
}
async function pigMature(userId, cost) {
    try { const { data, error } = await supabase.rpc('pig_mature', { p_user_id: userId, p_cost: cost }); if (error) throw error; return data; }
    catch (e) { console.error('[DATABASE ERROR] pigMature():', e); return { result: 'error' }; }
}
async function pigHeal(userId, cost) {
    try { const { data, error } = await supabase.rpc('pig_heal', { p_user_id: userId, p_cost: cost }); if (error) throw error; return data; }
    catch (e) { console.error('[DATABASE ERROR] pigHeal():', e); return 'error'; }
}
async function pigClaimSale(userId, minAgeSecs) {
    try { const { data, error } = await supabase.rpc('pig_claim_sale', { p_user_id: userId, p_min_age_secs: minAgeSecs }); if (error) throw error; return data; }
    catch (e) { console.error('[DATABASE ERROR] pigClaimSale():', e); return { result: 'error' }; }
}
async function pigStealFail(userId) {
    try { const { data, error } = await supabase.rpc('pig_steal_fail', { p_user_id: userId }); if (error) throw error; return data; }
    catch (e) { console.error('[DATABASE ERROR] pigStealFail():', e); return 0; }
}
/** Cho ăn lần 1: dùng cám tặng (baby + cam>0 -> fed). Trả true nếu thành công. */
async function pigFeed1(userId) {
    try {
        const { data, error } = await supabase.from('pigs')
            .update({ stage: 'fed', cam: 0, last_action_at: new Date().toISOString() })
            .eq('user_id', userId).eq('stage', 'baby').eq('sick', false).gt('cam', 0).select('user_id');
        if (error) throw error; return !!(data && data.length);
    } catch (e) { console.error('[DATABASE ERROR] pigFeed1():', e); return false; }
}
/** Chuyển stage có điều kiện (chống race + chặn khi bệnh). Trả true nếu đổi được. */
async function pigSetStage(userId, fromStage, toStage) {
    try {
        const { data, error } = await supabase.from('pigs')
            .update({ stage: toStage, last_action_at: new Date().toISOString() })
            .eq('user_id', userId).eq('stage', fromStage).eq('sick', false).select('user_id');
        if (error) throw error; return !!(data && data.length);
    } catch (e) { console.error('[DATABASE ERROR] pigSetStage():', e); return false; }
}
async function pigSetType(userId, type) {
    try { await supabase.from('pigs').update({ type }).eq('user_id', userId); } catch (e) { console.error('[DATABASE ERROR] pigSetType():', e); }
}
async function pigSetSick(userId) {
    try { await supabase.from('pigs').update({ sick: true }).eq('user_id', userId); } catch (e) { console.error('[DATABASE ERROR] pigSetSick():', e); }
}

// ============================================================
//  TRỒNG CÂY (plants)
// ============================================================
async function getPlant(userId) {
    try { const { data, error } = await supabase.from('plants').select('*').eq('user_id', userId).maybeSingle(); if (error) throw error; return data; }
    catch (e) { console.error('[DATABASE ERROR] getPlant():', e); return null; }
}
async function plantBuy(userId, cost, type, tier, flower) {
    try { const { data, error } = await supabase.rpc('plant_buy', { p_user_id: userId, p_cost: cost, p_type: type, p_tier: tier, p_flower: flower }); if (error) throw error; return data; }
    catch (e) { console.error('[DATABASE ERROR] plantBuy():', e); return 'error'; }
}
async function plantWater(userId, intervalSecs) {
    try { const { data, error } = await supabase.rpc('plant_water', { p_user_id: userId, p_interval_secs: intervalSecs }); if (error) throw error; return data; }
    catch (e) { console.error('[DATABASE ERROR] plantWater():', e); return { result: 'error' }; }
}
async function plantFertilize(userId, cost) {
    try { const { data, error } = await supabase.rpc('plant_fertilize', { p_user_id: userId, p_cost: cost }); if (error) throw error; return data; }
    catch (e) { console.error('[DATABASE ERROR] plantFertilize():', e); return { result: 'error' }; }
}
async function plantWaterHelp(helperId, ownerId) {
    try { const { data, error } = await supabase.rpc('plant_water_help', { p_helper: helperId, p_owner: ownerId }); if (error) throw error; return data; }
    catch (e) { console.error('[DATABASE ERROR] plantWaterHelp():', e); return { result: 'error' }; }
}
async function plantClaim(userId, minAge, maxAge) {
    try { const { data, error } = await supabase.rpc('plant_claim', { p_user_id: userId, p_min_age: minAge, p_max_age: maxAge }); if (error) throw error; return data; }
    catch (e) { console.error('[DATABASE ERROR] plantClaim():', e); return { result: 'error' }; }
}
async function plantRevive(userId, cost) {
    try { const { data, error } = await supabase.rpc('plant_revive', { p_user_id: userId, p_cost: cost }); if (error) throw error; return data; }
    catch (e) { console.error('[DATABASE ERROR] plantRevive():', e); return 'error'; }
}
async function plantStealFail(userId) {
    try { const { data, error } = await supabase.rpc('plant_steal_fail', { p_user_id: userId }); if (error) throw error; return data; }
    catch (e) { console.error('[DATABASE ERROR] plantStealFail():', e); return 0; }
}
async function plantSetDead(userId) {
    try { await supabase.from('plants').update({ stage: 'dead' }).eq('user_id', userId).eq('stage', 'growing'); } catch (e) { console.error('[DATABASE ERROR] plantSetDead():', e); }
}
async function deletePlant(userId) {
    try { await supabase.from('plants').delete().eq('user_id', userId); } catch (e) { console.error('[DATABASE ERROR] deletePlant():', e); }
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
//  VAY / ĐÒI NỢ (P2P loans)
// ============================================================
const { LOAN } = config;

/** Tạo khoản vay (lender cho borrower vay). Trả {status,...} hoặc null. */
async function loanCreate(lenderId, borrowerId, principal) {
    try {
        const { data, error } = await supabase.rpc('loan_create', {
            p_lender: lenderId, p_borrower: borrowerId, p_principal: principal,
            p_interest: LOAN.INTEREST_PCT, p_days: LOAN.DUE_DAYS,
        });
        if (error) throw error;
        return data;
    } catch (error) { console.error('[DATABASE ERROR] loanCreate():', error); return null; }
}

/** Borrower trả nợ cho lender (tối đa amount). Trả {status,...} hoặc null. */
async function loanRepay(borrowerId, lenderId, amount) {
    try {
        const { data, error } = await supabase.rpc('loan_repay', { p_borrower: borrowerId, p_lender: lenderId, p_amount: amount });
        if (error) throw error;
        return data;
    } catch (error) { console.error('[DATABASE ERROR] loanRepay():', error); return null; }
}

/** Lender đòi nợ borrower (chỉ khoản quá hạn -> cưỡng chế thu). Trả {status,...} hoặc null. */
async function loanCollect(lenderId, borrowerId) {
    try {
        const { data, error } = await supabase.rpc('loan_collect', { p_lender: lenderId, p_borrower: borrowerId });
        if (error) throw error;
        return data;
    } catch (error) { console.error('[DATABASE ERROR] loanCollect():', error); return null; }
}

// ============================================================
//  BANG HỘI (clan)
// ============================================================
const { CLAN } = config;
const clanRpc = async (fn, args) => {
    try { const { data, error } = await supabase.rpc(fn, args); if (error) throw error; return data; }
    catch (error) { console.error(`[DATABASE ERROR] ${fn}():`, error); return null; }
};
const clanCreate = (userId, name) => clanRpc('clan_create', { p_user: userId, p_name: name, p_cost: CLAN.CREATE_COST });
const clanJoin = (userId, name) => clanRpc('clan_join', { p_user: userId, p_name: name });
const clanLeave = (userId) => clanRpc('clan_leave', { p_user: userId });
const clanDeposit = (userId, amount) => clanRpc('clan_deposit', { p_user: userId, p_amount: amount });
const clanWithdraw = (userId, amount) => clanRpc('clan_withdraw', { p_user: userId, p_amount: amount });
const clanKick = (leaderId, targetId) => clanRpc('clan_kick', { p_leader: leaderId, p_target: targetId });
const clanDisband = (userId) => clanRpc('clan_disband', { p_user: userId });
async function clanById(id) {
    try { const { data } = await supabase.from('clans').select('*').eq('id', id).single(); return data; }
    catch { return null; }
}
async function clanByName(name) {
    try { const { data } = await supabase.from('clans').select('*').ilike('name', name).limit(1); return data?.[0] || null; }
    catch { return null; }
}
async function clanMembers(clanId) {
    try { const { data } = await supabase.from('users').select('user_id').eq('clan_id', clanId); return (data || []).map(r => r.user_id); }
    catch { return []; }
}
async function clanList(limit = 20) {
    try { const { data } = await supabase.from('clans').select('*').order('bank', { ascending: false }).limit(limit); return data || []; }
    catch { return []; }
}


/** Top cặp đôi theo điểm tình cảm. */
async function getTopLove(limit = 20) {
    try { const { data } = await supabase.from('users').select('user_id, love, partner_id').gt('love', 0).not('partner_id', 'is', null).order('love', { ascending: false }).limit(limit); return data || []; }
    catch (error) { console.error('[DATABASE ERROR] getTopLove():', error); return []; }
}

/** EXP của các thành viên 1 bang (để tính sức mạnh chiến tranh). */
async function clanMembersExp(clanId) {
    try { const { data } = await supabase.from('users').select('exp').eq('clan_id', clanId); return (data || []).map(r => Number(r.exp || 0)); }
    catch { return []; }
}
/** Chuyển cược chiến tranh bang thua -> thắng. Trả {status, taken}. */
const clanWar = (winnerId, loserId, stake) => clanRpc('clan_war', { p_winner: winnerId, p_loser: loserId, p_stake: stake });

// ============================================================
//  CHỢ (market — P2P trading)
// ============================================================
const { MARKET } = config;

async function marketList(sellerId, itemId, qty, price) {
    try {
        const { data, error } = await supabase.rpc('market_list', { p_seller: sellerId, p_item: itemId, p_qty: qty, p_price: price });
        if (error) throw error;
        return data;
    } catch (error) { console.error('[DATABASE ERROR] marketList():', error); return null; }
}
async function marketBuy(buyerId, listingId) {
    try {
        const { data, error } = await supabase.rpc('market_buy', { p_buyer: buyerId, p_listing: listingId, p_fee: MARKET.FEE_PCT });
        if (error) throw error;
        return data;
    } catch (error) { console.error('[DATABASE ERROR] marketBuy():', error); return null; }
}
async function marketCancel(sellerId, listingId) {
    try {
        const { data, error } = await supabase.rpc('market_cancel', { p_seller: sellerId, p_listing: listingId });
        if (error) throw error;
        return data;
    } catch (error) { console.error('[DATABASE ERROR] marketCancel():', error); return null; }
}
async function marketActive(limit = 25) {
    try {
        const { data } = await supabase.from('market_listings').select('*').eq('status', 'active').order('created_at', { ascending: false }).limit(limit);
        return data || [];
    } catch (error) { console.error('[DATABASE ERROR] marketActive():', error); return []; }
}
async function marketMine(sellerId) {
    try {
        const { data } = await supabase.from('market_listings').select('*').eq('seller_id', sellerId).eq('status', 'active').order('created_at');
        return data || [];
    } catch (error) { console.error('[DATABASE ERROR] marketMine():', error); return []; }
}

/** Tăng điểm tình cảm cặp đôi (cả hai vợ chồng). Trả {status, love, partner} hoặc null. */
async function coupleLove(userId, amount) {
    try {
        const { data, error } = await supabase.rpc('couple_love', { p_user: userId, p_amount: amount });
        if (error) throw error;
        return data;
    } catch (error) { console.error('[DATABASE ERROR] coupleLove():', error); return null; }
}

/** Lấy cấu hình sự kiện hiện tại (1 dòng). */
async function getGameEvent() {
    try { const { data } = await supabase.from('game_event').select('*').eq('id', 1).single(); return data; }
    catch (error) { console.error('[DATABASE ERROR] getGameEvent():', error); return null; }
}
/** Đặt sự kiện (multiplier, ends_at ISO|null, name). */
async function setGameEvent(multiplier, endsAt, name) {
    try { const { error } = await supabase.from('game_event').update({ multiplier, ends_at: endsAt, name }).eq('id', 1); if (error) throw error; return true; }
    catch (error) { console.error('[DATABASE ERROR] setGameEvent():', error); return false; }
}

/** Chặn/bỏ chặn user. */
async function setBanned(userId, val) {
    try {
        const { error } = await supabase.from('users').upsert({ user_id: userId, banned: val });
        if (error) throw error;
        return true;
    } catch (error) { console.error('[DATABASE ERROR] setBanned():', error); return false; }
}

/** Danh sách user_id đang bị ban (nạp vào RAM lúc khởi động). */
async function getBannedIds() {
    try {
        const { data } = await supabase.from('users').select('user_id').eq('banned', true);
        return (data || []).map(r => r.user_id);
    } catch (error) { console.error('[DATABASE ERROR] getBannedIds():', error); return []; }
}

/** Chế tạo: tiêu nguyên liệu + tiền -> tạo thành phẩm. Trả {status} hoặc null. */
async function craftItem(userId, recipe) {
    try {
        const { data, error } = await supabase.rpc('craft_item', {
            p_user: userId, p_mats: recipe.mats, p_result: recipe.result, p_qty: recipe.qty, p_cost: recipe.cost,
        });
        if (error) throw error;
        return data;
    } catch (error) { console.error('[DATABASE ERROR] craftItem():', error); return null; }
}

/** Danh sách nợ của user: {owing:[...], owed:[...]} (khoản đang active). */
async function loansOf(userId) {
    try {
        const [owing, owed] = await Promise.all([
            supabase.from('loans').select('*').eq('borrower_id', userId).eq('status', 'active').order('created_at'),
            supabase.from('loans').select('*').eq('lender_id', userId).eq('status', 'active').order('created_at'),
        ]);
        return { owing: owing.data || [], owed: owed.data || [] };
    } catch (error) { console.error('[DATABASE ERROR] loansOf():', error); return { owing: [], owed: [] }; }
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

// ============================================================
//  GUILD MEMBERS — ghi nhận user hoạt động ở guild nào (cho BXH theo server)
// ============================================================
/** Ghi nhận user thuộc guild (idempotent). Gọi fire-and-forget từ event. */
async function recordGuildMember(guildId, userId) {
    try {
        const { error } = await supabase.from('guild_members')
            .upsert({ guild_id: guildId, user_id: userId }, { onConflict: 'guild_id,user_id', ignoreDuplicates: true });
        if (error) throw error;
        return true;
    } catch (error) { console.error('[DATABASE ERROR] recordGuildMember():', error); return false; }
}

/** BXH giới hạn trong 1 guild (sort='level'|'networth'). */
async function getLeaderboardGuild(sort, limit, guildId) {
    try {
        const { data, error } = await supabase.rpc('leaderboard_rows_guild', { p_sort: sort, p_limit: limit, p_guild: guildId });
        if (error) throw error;
        return data || [];
    } catch (error) { console.error('[DATABASE ERROR] getLeaderboardGuild():', error); return []; }
}

/**
 * Tăng chuỗi vote (streak) nguyên tử qua RPC. Tự tạo user nếu chưa có.
 * @returns {number} streak mới (>=1). Fail-safe trả 1 nếu DB lỗi.
 */
async function bumpVoteStreak(userId, graceSeconds) {
    try {
        const { data, error } = await supabase.rpc('bump_vote_streak', {
            p_user_id: userId,
            p_grace_seconds: graceSeconds,
        });
        if (error) throw error;
        return Number(data) || 1;
    } catch (error) {
        console.error('[DATABASE ERROR] bumpVoteStreak:', error);
        return 1;
    }
}

/** Lấy danh sách user cần nhắc vote (đã vote, đủ 12h, chưa nhắc, còn bật nhắc). */
async function getVoteReminderCandidates(limit = 40) {
    try {
        const cutoff = new Date(Date.now() - config.VOTE.COOLDOWN_HOURS * 3600 * 1000).toISOString();
        const { data, error } = await supabase
            .from('users')
            .select('user_id')
            .eq('vote_reminder', true)
            .eq('vote_reminded', false)
            .not('last_vote_at', 'is', null)
            .lt('last_vote_at', cutoff)
            .limit(limit);
        if (error) throw error;
        return (data || []).map(r => r.user_id);
    } catch (error) {
        console.error('[DATABASE ERROR] getVoteReminderCandidates:', error);
        return [];
    }
}

/** Đánh dấu đã nhắc (tránh nhắc lại tới khi user vote lần nữa). */
async function markVoteReminded(userIds) {
    if (!userIds || !userIds.length) return;
    try {
        const { error } = await supabase.from('users').update({ vote_reminded: true }).in('user_id', userIds);
        if (error) throw error;
    } catch (error) {
        console.error('[DATABASE ERROR] markVoteReminded:', error);
    }
}

/** Bật/tắt nhận nhắc vote (nút "Tắt nhắc" trong DM). */
async function setVoteReminder(userId, on) {
    try {
        const { error } = await supabase.from('users').update({ vote_reminder: !!on }).eq('user_id', userId);
        if (error) throw error;
    } catch (error) {
        console.error('[DATABASE ERROR] setVoteReminder:', error);
    }
}

/** Nhận quà chào mừng 1 lần (nguyên tử). Trả số tiền (>0) nếu nhận được, 0 nếu đã nhận. */
async function claimWelcomeBonus(userId, amount) {
    try {
        const { data, error } = await supabase.rpc('claim_welcome_bonus', { p_user_id: userId, p_amount: amount });
        if (error) throw error;
        return Number(data) || 0;
    } catch (error) {
        console.error('[DATABASE ERROR] claimWelcomeBonus:', error);
        return 0;
    }
}

/** Cập nhật last_seen=now(), trả về mốc CŨ (ms) hoặc null. Dùng để chào người vắng lâu. */
async function touchLastSeen(userId) {
    try {
        const { data, error } = await supabase.rpc('touch_last_seen', { p_user_id: userId });
        if (error) throw error;
        return data ? new Date(data).getTime() : null;
    } catch (error) {
        console.error('[DATABASE ERROR] touchLastSeen:', error);
        return null;
    }
}

/** Hồ sơ công khai (gộp 1 query) cho web /u/[id] + API. Trả object jsonb hoặc null. */
async function getPublicProfile(userId) {
    try {
        const { data, error } = await supabase.rpc('get_public_profile', { p_user_id: userId });
        if (error) throw error;
        return data || null;
    } catch (error) {
        console.error('[DATABASE ERROR] getPublicProfile:', error);
        return null;
    }
}

/** Bật/tắt hiển thị hồ sơ web (/profile toggle). */
async function setProfilePublic(userId, isPublic) {
    try {
        const { error } = await supabase.from('users').update({ profile_public: !!isPublic }).eq('user_id', userId);
        if (error) throw error;
        return true;
    } catch (error) {
        console.error('[DATABASE ERROR] setProfilePublic:', error);
        return false;
    }
}

/** Danh sách đơn Premium đang chờ (pending) — đơn buyer đã bấm "đã CK" lên trước. */
async function getPendingPremiumOrders(limit = 15) {
    try {
        const { data, error } = await supabase
            .from('premium_orders')
            .select('code, user_id, plan, months, amount, claimed_at, created_at')
            .eq('status', 'pending')
            .order('claimed_at', { ascending: false, nullsFirst: false })
            .order('created_at', { ascending: false })
            .limit(limit);
        if (error) throw error;
        return data || [];
    } catch (error) {
        console.error('[DATABASE ERROR] getPendingPremiumOrders:', error);
        return [];
    }
}

/** Owner duyệt thủ công 1 đơn theo mã (không kiểm tra số tiền). Idempotent. */
async function approvePremiumOrder(code, ref = 'manual') {
    try {
        const { data, error } = await supabase.rpc('approve_premium_order', { p_code: code, p_ref: ref });
        if (error) throw error;
        return data;
    } catch (error) {
        console.error('[DATABASE ERROR] approvePremiumOrder:', error);
        return { ok: false, reason: 'db_error' };
    }
}

/** Ghi nhận thanh toán Premium theo MÃ trong nội dung CK (webhook Casso).
 *  Gia hạn premium_until, idempotent (webhook gọi lại không cộng dồn). */
async function redeemPremiumOrderByCode(code, amount, ref) {
    try {
        const { data, error } = await supabase.rpc('redeem_premium_order', {
            p_code: code, p_amount: amount, p_ref: ref || null,
        });
        if (error) throw error;
        return data;
    } catch (error) {
        console.error('[DATABASE ERROR] redeemPremiumOrderByCode:', error);
        return { ok: false, reason: 'db_error' };
    }
}

// ============================================================
//  TIỆM BÁNH GEKKA (bakery) — kinh doanh thụ động
// ============================================================
async function getBakery(userId) {
    try { const { data, error } = await supabase.from('bakeries').select('*').eq('user_id', userId).maybeSingle(); if (error) throw error; return data; }
    catch (e) { console.error('[DATABASE ERROR] getBakery():', e); return null; }
}
/** Mở tiệm. Trả 'ok'|'has'|'no_tool'|'poor'|'no_user'|'error'. */
async function bakeryOpen(userId, cost, tool) {
    try { const { data, error } = await supabase.rpc('bakery_open', { p_user_id: userId, p_cost: cost, p_tool: tool }); if (error) throw error; return data; }
    catch (e) { console.error('[DATABASE ERROR] bakeryOpen():', e); return 'error'; }
}
/** Nạp nguyên liệu (trừ item + cộng stock). Trả 'ok'|'no_item'|'no_bakery'|'bad_qty'|'error'. */
async function bakeryStock(userId, itemId, qty, gain) {
    try { const { data, error } = await supabase.rpc('bakery_stock', { p_user_id: userId, p_item_id: itemId, p_qty: qty, p_gain: gain }); if (error) throw error; return data; }
    catch (e) { console.error('[DATABASE ERROR] bakeryStock():', e); return 'error'; }
}
/** Thu doanh thu (lazy). Trả {result:'ok',revenue,cakes,stock_left,capped}|{result:'empty'|'no_bakery'|'error'}. */
async function bakeryCollect(userId, rate, cap, cakeEvery) {
    try { const { data, error } = await supabase.rpc('bakery_collect', { p_user_id: userId, p_rate: rate, p_cap: cap, p_cake_every: cakeEvery }); if (error) throw error; return data; }
    catch (e) { console.error('[DATABASE ERROR] bakeryCollect():', e); return { result: 'error' }; }
}
/** Nâng cấp tiệm. Trả 'ok'|'poor'|'no_mats'|'max'|'no_bakery'|'error'. */
async function bakeryUpgrade(userId, cost, mats, maxLevel) {
    try { const { data, error } = await supabase.rpc('bakery_upgrade', { p_user_id: userId, p_cost: cost, p_mats: mats, p_max_level: maxLevel }); if (error) throw error; return data; }
    catch (e) { console.error('[DATABASE ERROR] bakeryUpgrade():', e); return 'error'; }
}
/** Thu doanh thu v2 (trừ lương nhân viên). */
async function bakeryCollectV2(userId, rate, cap, cakeEvery, wagePct) {
    try { const { data, error } = await supabase.rpc('bakery_collect_v2', { p_user_id: userId, p_rate: rate, p_cap: cap, p_cake_every: cakeEvery, p_wage_pct: wagePct }); if (error) throw error; return data; }
    catch (e) { console.error('[DATABASE ERROR] bakeryCollectV2():', e); return { result: 'error' }; }
}
/** Thuê nhân viên. Trả 'ok'|'no_bakery'|'already_hired'|'limit_reached'|'poor'|'error'. */
async function bakeryHire(userId, staffId, cost, maxStaff) {
    try { const { data, error } = await supabase.rpc('bakery_hire', { p_user_id: userId, p_staff_id: staffId, p_cost: cost, p_max_staff: maxStaff }); if (error) throw error; return data; }
    catch (e) { console.error('[DATABASE ERROR] bakeryHire():', e); return 'error'; }
}
/** Sa thải nhân viên. Trả 'ok'|'no_bakery'|'not_hired'|'error'. */
async function bakeryFire(userId, staffId) {
    try { const { data, error } = await supabase.rpc('bakery_fire', { p_user_id: userId, p_staff_id: staffId }); if (error) throw error; return data; }
    catch (e) { console.error('[DATABASE ERROR] bakeryFire():', e); return 'error'; }
}
/** Trang trí tiệm bánh. Trả 'ok'|'no_bakery'|'no_item'|'error'. */
async function bakeryDecorate(userId, itemId) {
    try { const { data, error } = await supabase.rpc('bakery_decorate', { p_user_id: userId, p_item_id: itemId }); if (error) throw error; return data; }
    catch (e) { console.error('[DATABASE ERROR] bakeryDecorate():', e); return 'error'; }
}

module.exports = {
    supabase,
    getUser,
    redeemPremiumOrderByCode,
    getPendingPremiumOrders,
    approvePremiumOrder,
    claimWelcomeBonus,
    touchLastSeen,
    getPublicProfile,
    setProfilePublic,
    bumpVoteStreak,
    getVoteReminderCandidates,
    markVoteReminded,
    setVoteReminder,
    recordGuildMember,
    getLeaderboardGuild,
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
    setSick,
    chargeAssets,
    stakeCollect,
    stakeSettle,
    stakeRefundSession,
    stakeRefundOrphans,
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
    newbieQuestIncr,
    claimBankruptcyRelief,
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
    logConfession,
    // ai quota & premium
    consumeAiQuota,
    grantPremium,
    // jail
    getJail,
    jailOrFine,
    halveJail,
    // pigs
    getPig,
    pigBuy,
    pigMature,
    pigHeal,
    pigClaimSale,
    pigStealFail,
    pigFeed1,
    pigSetStage,
    pigSetType,
    pigSetSick,
    // plants
    getPlant,
    plantBuy,
    plantWater,
    plantFertilize,
    plantWaterHelp,
    plantClaim,
    plantRevive,
    plantStealFail,
    plantSetDead,
    deletePlant,
    // inventory helpers v2
    takeItem,
    transferItem,
    claimDailyCounter,
    bumpPoliceHeat,
    resetPoliceHeat,
    // cosmetic
    setCosmetic,
    // loans
    loanCreate,
    loanRepay,
    loanCollect,
    loansOf,
    // craft
    craftItem,
    // ban
    setBanned,
    getBannedIds,
    // event
    getGameEvent,
    setGameEvent,
    // couple
    coupleLove,
    // clan
    clanCreate,
    clanJoin,
    clanLeave,
    clanDeposit,
    clanWithdraw,
    clanKick,
    clanDisband,
    clanById,
    clanByName,
    clanMembers,
    clanList,
    clanMembersExp,
    clanWar,
    getTopLove,
    // market
    marketList,
    marketBuy,
    marketCancel,
    marketActive,
    marketMine,
    // admin
    setBalance,
    setExp,
    setEnergy,
    giveItemAdmin,
    resetUser,
    // tiệm bánh
    getBakery,
    bakeryOpen,
    bakeryStock,
    bakeryCollect,
    bakeryUpgrade,
    bakeryCollectV2,
    bakeryHire,
    bakeryFire,
    bakeryDecorate,
};
