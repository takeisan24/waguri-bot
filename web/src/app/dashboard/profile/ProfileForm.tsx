"use client";

import { useState, useTransition } from "react";
import { updateProfile } from "./action";
import { useLanguage } from "../../../components/LanguageProvider";

interface ProfileFormProps {
    initialBio: string;
}

export default function ProfileForm({ initialBio }: ProfileFormProps) {
    const { t } = useLanguage();
    const [bio, setBio] = useState(initialBio);
    const [message, setMessage] = useState<{
        type: "success" | "error";
        text: string
    } | null>(null);
    const [isPending, startTransition] = useTransition();

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setMessage(null);

        startTransition(async () => {
            const res = await updateProfile({ bio, showcaseBadges: [] });

            if (res.success) {
                setMessage({
                    type: "success",
                    text: res.message ? t(res.message) : t("profile_edit.success")
                });
            } else {
                setMessage({
                    type: "error",
                    text: res.error ? t(res.error) : t("profile_edit.error_generic")
                });
            }
        });
    };

    return (
        <form
            onSubmit={handleSubmit}
            className="space-y-6 max-w-xl bg-slate-900/60 p-6 rounded-2xl border border-pink-500/20 shadow-xl backdrop-blur-md">
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

            <div className="space-y-2">
                <div className="flex justify-between items-center">
                    <label className="text-sm font-semibold text-pink-200">
                        {t("profile_edit.bio_label")}
                    </label>
                    <span className={`text-xs ${bio.length > 150 ? "text-red-400 font-bold" : "text-slate-400"}`}>
                        {bio.length}/150
                    </span>
                </div>
                <textarea
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    placeholder={t("profile_edit.bio_placeholder")}
                    rows={4}
                    className="w-full bg-slate-950/80 border border-pink-500/20 rounded-xl p-3 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-pink-500/60 focus:ring-1 focus:ring-pink-500/60 transition-all text-sm resize-none"
                />
            </div>
            <button
                type="submit"
                disabled={isPending || bio.length > 150}
                className="w-full py-3 px-4 bg-linear-to-r from-pink-500 to-rose-500 hover:from-pink-600 hover:to-rose-600 font-medium text-white rounded-xl shadow-lg shadow-pink-500/25 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-sm"
            >
                {isPending ? (
                    <>
                        <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        <span>{t("profile_edit.saving")}</span>
                    </>
                ) : (
                    t("profile_edit.save_btn")
                )}
            </button>
        </form>
    );
}
