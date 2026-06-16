const { createClient } = require('@supabase/supabase-js');

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

module.exports = {
    supabase,
    getUser,
    addMoney,
    transferMoney,
    updateExp,
    checkCooldown,
    claimCooldown,
    setCooldown,
};
