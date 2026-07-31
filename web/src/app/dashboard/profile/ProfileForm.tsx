"use client";

import { useState, useTransition } from "react";
import { updateProfile } from "./action";


// Khởi tạo prop lưu trữ thông tin user
interface ProfileFormProps {
    initialBio: string;
}
//TODO: Add i18n into this page
export default function ProfileForm({ initialBio }: ProfileFormProps) {
    const [bio, setBio] = useState(initialBio); // trạng thái của bio
    const [message, setMessage] = useState<{
        type: "success" | "error";
        text: string
    } | null>(null); // Trạng thái của tin nhắn
    const [isPending, startTransition] = useTransition();

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setMessage(null);

        // Dùng startTransition để xử lý Server Action mà không làm đơ giao diện UI
        startTransition(async () => {
            const res = await updateProfile({ bio, showcaseBadges: [] });

            if (res.success) {
                setMessage({
                    type: "success",
                    text: res.message || "Yay! Chúc mừng bạn đã nói cho tớ biết về thông tin mới của bạn nhen >.<"
                });
            } else {
                setMessage({
                    type: "error",
                    text: res.error || "Hình như là mình bị ốm rồi, cần đi bệnh viện kiểm tra xem sao >.<!"
                });
            }
        });
    };

    return (
        <form
            onSubmit={handleSubmit}
            className="space-y-6 max-w-xl bg-slate-900/60 p-6 rounded-2xl border border-pink-500/20 shadow-xl backdrop-blur-md">
            {/* Thông báo lỗi hoặc thành công */}
            {message && (
                <div
                    className={`p-4 rounded-xl text-sm font-medium transition-all ${message.type === "success"
                        ? "bg-pink-500/10 border border-pink-500/30 text-pink-300"
                        : "bg-red-500/10 border border-red-500/30 text-red-300"
                        }`}
                >
                    {message.text}
                </div>
            )}

            {/* Ô nhập Bio */}
            <div className="space-y-2">
                <div className="flex justify-between items-center">
                    <label className="text-sm font-semibold text-pink-200">
                        🌸 Tiểu sử cá nhân bản thân bạn
                    </label>
                    <span className={`text-xs ${bio.length > 150 ? "text-red-400 font-bold" : "text-slate-400"}`}>
                        {bio.length}/150
                    </span>
                </div>
                <textarea
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    placeholder="Hãy viết vài dòng giới thiệu ngọt ngào về bản thân cậu nhé..."
                    rows={4}
                    className="w-full bg-slate-950/80 border border-pink-500/20 rounded-xl p-3 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-pink-500/60 focus:ring-1 focus:ring-pink-500/60 transition-all text-sm resize-none"
                />
            </div>
            {/* Nút submit */}
            <button
                type="submit"
                disabled={isPending || bio.length > 150}
                className="w-full py-3 px-4 bg-linear-to-r from-pink-500 to-rose-500 hover:from-pink-600 hover:to-rose-600 font-medium text-white rounded-xl shadow-lg shadow-pink-500/25 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-sm"
            >
                {isPending ? (
                    <>
                        <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        <span>Waguri đang ghi nhớ thông tin của bạn...</span>
                    </>
                ) : (
                    "✨ Lưu thay đổi"
                )}
            </button>
        </form>
    )
}