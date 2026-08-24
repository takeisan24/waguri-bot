"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { useLanguage } from "../../components/LanguageProvider";

const LOFI_STREAMS = [
  {
    id: "kikyo",
    name: "🌸 Kikyo Lofi Chill",
    url: "https://cdn.pixabay.com/download/audio/2022/05/27/audio_1808fbf07a.mp3",
    fallbackUrl: "https://kuvlkaxregnanhzgqrbp.supabase.co/storage/v1/object/public/hvl_audio/01.mp3"
  },
  {
    id: "rainy",
    name: "🍵 Rainy Gekka Tea Shop",
    url: "https://cdn.pixabay.com/download/audio/2022/01/18/audio_d0a13f69d2.mp3",
    fallbackUrl: "https://kuvlkaxregnanhzgqrbp.supabase.co/storage/v1/object/public/hvl_audio/05.mp3"
  },
  {
    id: "midnight",
    // URL pixabay của kênh này đã chết (403 AccessDenied) -> luôn rơi xuống fallbackUrl.
    url: "https://cdn.pixabay.com/download/audio/2022/03/15/audio_c8c8a73467.mp3",
    name: "🌙 Midnight Academy",
    fallbackUrl: "https://kuvlkaxregnanhzgqrbp.supabase.co/storage/v1/object/public/hvl_audio/10.mp3"
  },
];

const BREAK_MINUTES = 5;
const CUSTOM_MIN = 15;
const CUSTOM_MAX = 120;

type Phase = "focus" | "break";
type TabKey = "25" | "50" | "custom";

export default function WebStudyRoomPage() {
  const { t } = useLanguage();
  const [activeTab, setActiveTab] = useState<TabKey>("25");
  const [customMinutes, setCustomMinutes] = useState("30");
  const [duration, setDuration] = useState(25);
  const [phase, setPhase] = useState<Phase>("focus");
  const [timeLeft, setTimeLeft] = useState(25 * 60);
  const [isRunning, setIsRunning] = useState(false);
  const [currentStream, setCurrentStream] = useState(LOFI_STREAMS[0]);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [volume, setVolume] = useState(0.5);
  const [audioStatus, setAudioStatus] = useState<string | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const chimeCtxRef = useRef<AudioContext | null>(null);
  // Mốc kết thúc tuyệt đối (epoch ms) của pha đang chạy; null = đồng hồ đang dừng.
  const deadlineRef = useRef<number | null>(null);

  const isBreak = phase === "break";
  // Mẫu số phải theo ĐỘ DÀI CỦA PHA HIỆN TẠI. Trước đây luôn lấy duration*60 nên vừa vào giờ
  // nghỉ (300s còn lại / 1500s) thanh tiến trình đã nhảy thẳng lên 80%.
  const phaseSeconds = isBreak ? BREAK_MINUTES * 60 : duration * 60;
  const percent = Math.min(100, Math.floor(((phaseSeconds - timeLeft) / phaseSeconds) * 100));

  /**
   * Mở sẵn AudioContext. Bắt buộc gọi trong user-gesture (nút Bắt đầu): trình duyệt sinh
   * context ở trạng thái "suspended" và chỉ cho resume khi có tương tác, nếu để tới lúc hết
   * giờ mới tạo thì chuông sẽ câm.
   */
  const primeChime = useCallback(() => {
    try {
      const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      if (!chimeCtxRef.current) chimeCtxRef.current = new Ctor();
      const ctx = chimeCtxRef.current;
      if (ctx.state === "suspended") void ctx.resume();
      return ctx;
    } catch {
      return null;
    }
  }, []);

  /**
   * Chuông báo hết giờ tổng hợp bằng Web Audio (không tải file -> không đụng CSP, không thêm
   * asset).
   */
  const playChime = useCallback(() => {
    try {
      const ctx = primeChime();
      if (!ctx) return;

      // Hai nốt ngân nhẹ (A5 -> E6) cho hợp không khí lofi, tổng ~1.2s.
      [880, 1318.5].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const startAt = ctx.currentTime + i * 0.28;
        osc.type = "sine";
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.0001, startAt);
        gain.gain.exponentialRampToValueAtTime(0.28, startAt + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.9);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(startAt);
        osc.stop(startAt + 0.95);
      });
    } catch {
      // Trình duyệt chặn Web Audio -> vẫn còn tiêu đề tab báo hết giờ, không cần xử lý thêm.
    }
  }, [primeChime]);

  /**
   * Một nhịp đồng hồ. Thời gian còn lại suy ra từ MỐC KẾT THÚC tuyệt đối chứ không trừ dần mỗi
   * giây: trình duyệt bóp setInterval của tab chạy nền xuống ~1 lần/phút, kiểu trừ dần sẽ làm
   * phiên 25 phút kéo dài hàng giờ nếu người dùng chuyển tab.
   *
   * Việc chuyển pha đặt ngay trong callback của timer (hệ thống ngoài) — không phải trong thân
   * effect — nên không sinh cascading render.
   */
  const tick = useCallback(() => {
    if (deadlineRef.current === null) return;
    const remaining = Math.max(0, Math.round((deadlineRef.current - Date.now()) / 1000));
    if (remaining > 0) {
      setTimeLeft(remaining);
      return;
    }

    // Hết giờ: học xong -> tự chạy tiếp giờ nghỉ; nghỉ xong -> dừng hẳn, chờ bấm Bắt đầu.
    playChime();
    if (phase === "focus") {
      deadlineRef.current = Date.now() + BREAK_MINUTES * 60 * 1000;
      setPhase("break");
      setTimeLeft(BREAK_MINUTES * 60);
    } else {
      deadlineRef.current = null;
      setPhase("focus");
      setTimeLeft(duration * 60);
      setIsRunning(false);
    }
  }, [phase, duration, playChime]);

  useEffect(() => {
    if (!isRunning) return;
    const interval = setInterval(tick, 250);
    return () => clearInterval(interval);
  }, [isRunning, tick]);

  // Tiêu đề tab = tín hiệu hết giờ khi người dùng đang ở tab khác.
  useEffect(() => {
    const original = document.title;
    if (isRunning) {
      const mins = Math.floor(timeLeft / 60);
      const secs = timeLeft % 60;
      const clock = `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
      document.title = `${isBreak ? "☕" : "📚"} ${clock} — ${t("study.room_label")}`;
    }
    return () => {
      document.title = original;
    };
  }, [isRunning, timeLeft, isBreak, t]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume;
    }
  }, [volume]);

  // Đóng AudioContext khi rời trang. Phải đọc ref TRONG hàm dọn: lúc effect chạy (mount) ref
  // còn null, chụp giá trị ra ngoài thì mãi mãi đóng null và context bị rò.
  useEffect(() => {
    return () => {
      void chimeCtxRef.current?.close().catch(() => {});
      chimeCtxRef.current = null;
    };
  }, []);

  /**
   * Phân biệt "trình duyệt chặn autoplay" (NotAllowedError — bấm lại là chạy) với "không nạp
   * được nguồn nhạc" (CSP chặn / link chết / mất mạng — bấm lại vô ích). Trước đây mọi lỗi đều
   * hiện "bấm lại để cấp quyền", khiến người dùng bấm mãi trong khi CSP chặn sạch.
   */
  const describeAudioError = useCallback(
    (err: unknown) => {
      const name = err instanceof Error ? err.name : "";
      return name === "NotAllowedError" ? t("study.audio_permission") : t("study.audio_error");
    },
    [t]
  );

  const toggleAudio = () => {
    if (!audioRef.current) return;
    setAudioStatus(null);
    if (isPlayingAudio) {
      audioRef.current.pause();
      setIsPlayingAudio(false);
      return;
    }

    audioRef.current.play()
      .then(() => {
        setIsPlayingAudio(true);
        setAudioStatus(t("study.audio_playing"));
      })
      .catch((err) => {
        if (audioRef.current && currentStream.fallbackUrl && audioRef.current.src !== currentStream.fallbackUrl) {
          audioRef.current.src = currentStream.fallbackUrl;
          audioRef.current.play()
            .then(() => {
              setIsPlayingAudio(true);
              setAudioStatus(t("study.audio_playing_fallback"));
            })
            .catch((fallbackErr) => {
              setIsPlayingAudio(false);
              setAudioStatus(describeAudioError(fallbackErr));
            });
        } else {
          setIsPlayingAudio(false);
          setAudioStatus(describeAudioError(err));
        }
      });
  };

  const handleSelectStream = (stream: typeof LOFI_STREAMS[0]) => {
    setCurrentStream(stream);
    setAudioStatus(null);
    if (!audioRef.current) return;
    audioRef.current.src = stream.url;
    if (!isPlayingAudio) return;

    audioRef.current.play()
      .then(() => setAudioStatus(t("study.audio_playing")))
      .catch((err) => {
        if (audioRef.current && stream.fallbackUrl) {
          audioRef.current.src = stream.fallbackUrl;
          audioRef.current.play()
            // Nhánh này trước đây im lặng -> dòng trạng thái giữ nguyên nội dung cũ, sai thực tế.
            .then(() => setAudioStatus(t("study.audio_playing_fallback")))
            .catch((fallbackErr) => {
              setIsPlayingAudio(false);
              setAudioStatus(describeAudioError(fallbackErr));
            });
        } else {
          setIsPlayingAudio(false);
          setAudioStatus(describeAudioError(err));
        }
      });
  };

  const handleStart = () => {
    // Mở AudioContext ngay trong user-gesture để chuông báo hết giờ chắc chắn kêu được.
    primeChime();
    // Tiếp tục từ đúng chỗ đang dừng: mốc kết thúc = bây giờ + phần còn lại.
    deadlineRef.current = Date.now() + timeLeft * 1000;
    setIsRunning(true);
  };

  const handlePause = () => {
    deadlineRef.current = null;
    setIsRunning(false);
  };

  const handleReset = () => {
    deadlineRef.current = null;
    setIsRunning(false);
    setPhase("focus");
    setTimeLeft(duration * 60);
  };

  const applyDuration = (mins: number, tabKey: TabKey) => {
    deadlineRef.current = null;
    setActiveTab(tabKey);
    setDuration(mins);
    setTimeLeft(mins * 60);
    setIsRunning(false);
    setPhase("focus");
  };

  // Ô nhập tuỳ chọn: kẹp 15–120 phút cho khớp đúng giới hạn của lệnh /study trong bot.
  const handleCustomChange = (raw: string) => {
    setCustomMinutes(raw);
    const parsed = Number.parseInt(raw, 10);
    if (Number.isNaN(parsed)) return;
    const clamped = Math.max(CUSTOM_MIN, Math.min(CUSTOM_MAX, parsed));
    applyDuration(clamped, "custom");
  };

  const handleCustomBlur = () => {
    const parsed = Number.parseInt(customMinutes, 10);
    const clamped = Number.isNaN(parsed) ? 30 : Math.max(CUSTOM_MIN, Math.min(CUSTOM_MAX, parsed));
    setCustomMinutes(String(clamped));
    applyDuration(clamped, "custom");
  };

  const formatMinSec = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  };

  const tabClass = (key: TabKey) =>
    `px-4 py-1.5 text-xs font-semibold rounded-lg transition-all ${
      activeTab === key ? "bg-purple-600 text-white shadow-md" : "text-purple-300 hover:text-white"
    }`;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-between p-4 md:p-8 relative overflow-hidden">
      {/* Background Glow */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-purple-900/20 blur-[120px] rounded-full pointer-events-none" />

      {/* Header */}
      <header className="w-full max-w-5xl flex items-center justify-between z-10 py-4 border-b border-purple-900/30">
        <Link href="/" className="flex items-center gap-2 text-purple-400 hover:text-purple-300 transition-colors">
          <span>{t("study.back_home")}</span>
        </Link>
        <div className="flex items-center gap-2 bg-purple-950/60 border border-purple-800/40 px-4 py-1.5 rounded-full backdrop-blur-md">
          <span className="text-sm font-medium text-purple-200">{t("study.room_label")}</span>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="w-full max-w-4xl z-10 flex flex-col md:flex-row items-center justify-center gap-8 my-auto py-8">
        {/* Visual Animated Scene Card */}
        <div className="w-full md:w-1/2 flex flex-col items-center justify-center bg-purple-950/40 border border-purple-800/30 backdrop-blur-xl rounded-3xl p-6 shadow-2xl relative">
          <div className="w-full aspect-video rounded-2xl bg-slate-900 overflow-hidden relative border border-purple-800/40 flex flex-col items-center justify-center text-center p-6">
            <div className="absolute inset-0 bg-gradient-to-t from-purple-950/90 via-slate-950/40 to-transparent" />

            {/* Visual Icon & Anime Study Atmosphere */}
            <div className="relative z-10 flex flex-col items-center">
              <span className="text-6xl mb-3 animate-bounce">📚🌸</span>
              <h2 className="text-xl font-bold text-purple-200 mb-1">{t("study.scene_title")}</h2>
              <p className="text-xs text-purple-300/80 italic">&quot;{t("study.scene_quote")}&quot;</p>
            </div>

            {/* Falling Sakura Floating Emblems */}
            <div className="absolute top-4 left-4 text-xs bg-purple-900/60 border border-purple-700/40 text-purple-200 px-3 py-1 rounded-full">
              {isBreak ? t("study.session_break") : t("study.session_focus")}
            </div>
          </div>

          {/* HTML5 Lo-Fi Audio Player Controls */}
          <div className="w-full mt-6 bg-slate-900/80 border border-purple-800/30 rounded-2xl p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-purple-300 flex items-center gap-2">
                {t("study.channel_label")}: <span className="text-purple-100">{currentStream.name}</span>
              </span>
              <button
                onClick={toggleAudio}
                className="bg-purple-600 hover:bg-purple-500 text-white text-xs px-3 py-1.5 rounded-lg font-medium transition-all shadow-lg"
              >
                {isPlayingAudio ? t("study.audio_pause") : t("study.audio_play")}
              </button>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-purple-400">{t("study.volume_label")}:</span>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={volume}
                onChange={(e) => setVolume(parseFloat(e.target.value))}
                className="w-full accent-purple-500 bg-purple-950 h-1.5 rounded-lg cursor-pointer"
                aria-label={t("study.volume_label")}
              />
            </div>

            <div className="flex gap-2 mt-1">
              {LOFI_STREAMS.map((s) => (
                <button
                  key={s.id}
                  onClick={() => handleSelectStream(s)}
                  className={`text-xs px-2.5 py-1 rounded-md border transition-all ${
                    currentStream.id === s.id
                      ? "bg-purple-900/80 border-purple-500 text-purple-100"
                      : "bg-slate-950/60 border-purple-900/30 text-purple-400 hover:text-purple-200"
                  }`}
                >
                  {s.id}
                </button>
              ))}
            </div>

            {audioStatus ? (
              <p className="text-[11px] text-purple-300/90 italic mt-0.5" role="status">{audioStatus}</p>
            ) : null}

            <audio ref={audioRef} src={currentStream.url} loop />
          </div>
        </div>

        {/* Pomodoro Timer Control Panel */}
        <div className="w-full md:w-1/2 flex flex-col items-center bg-slate-900/90 border border-purple-800/40 backdrop-blur-xl rounded-3xl p-8 shadow-2xl">
          {/* Tab Selector */}
          <div className="flex gap-2 bg-purple-950/60 p-1.5 rounded-xl border border-purple-800/40 mb-4">
            <button onClick={() => applyDuration(25, "25")} className={tabClass("25")}>
              {t("study.tab_25")}
            </button>
            <button onClick={() => applyDuration(50, "50")} className={tabClass("50")}>
              {t("study.tab_50")}
            </button>
            <button onClick={() => handleCustomBlur()} className={tabClass("custom")}>
              {t("study.tab_custom")}
            </button>
          </div>

          {activeTab === "custom" ? (
            <div className="flex items-center gap-2 mb-2">
              <label htmlFor="study-custom-minutes" className="text-xs text-purple-400">
                {t("study.custom_label")}
              </label>
              <input
                id="study-custom-minutes"
                type="number"
                min={CUSTOM_MIN}
                max={CUSTOM_MAX}
                value={customMinutes}
                onChange={(e) => handleCustomChange(e.target.value)}
                onBlur={handleCustomBlur}
                className="w-20 bg-purple-950/60 border border-purple-800/40 text-purple-100 text-sm rounded-lg px-2 py-1 text-center focus:outline-none focus:border-purple-500"
              />
            </div>
          ) : null}

          {/* Big Time Countdown Display */}
          <div className="text-6xl md:text-7xl font-mono font-bold tracking-wider text-purple-100 my-4 drop-shadow-[0_0_20px_rgba(168,85,247,0.4)]">
            {formatMinSec(timeLeft)}
          </div>

          {/* Progress Bar Display */}
          <div className="w-full bg-purple-950/80 h-3 rounded-full overflow-hidden border border-purple-800/40 my-4 relative">
            <div
              className="h-full bg-gradient-to-r from-purple-600 to-pink-500 transition-all duration-500"
              style={{ width: `${percent}%` }}
            />
          </div>
          <span className="text-xs text-purple-300 font-mono mb-6">{t("study.percent_done", { percent })}</span>

          {/* Action Buttons */}
          <div className="flex items-center gap-4 w-full">
            {!isRunning ? (
              <button
                onClick={handleStart}
                className="flex-1 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white font-bold py-3.5 px-6 rounded-xl shadow-lg transition-all hover:scale-[1.02] active:scale-[0.98]"
              >
                {t("study.btn_start")}
              </button>
            ) : (
              <button
                onClick={handlePause}
                className="flex-1 bg-amber-600 hover:bg-amber-500 text-white font-bold py-3.5 px-6 rounded-xl shadow-lg transition-all"
              >
                {t("study.btn_pause")}
              </button>
            )}
            <button
              onClick={handleReset}
              className="bg-slate-800 hover:bg-slate-700 text-purple-300 font-medium py-3.5 px-5 rounded-xl border border-purple-800/40 transition-all"
            >
              {t("study.btn_reset")}
            </button>
          </div>
        </div>
      </main>

      {/* Footer Info */}
      <footer className="w-full max-w-5xl z-10 py-4 text-center text-xs text-purple-400/60 border-t border-purple-900/30">
        {t("study.footer")}
      </footer>
    </div>
  );
}
