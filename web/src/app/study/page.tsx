"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";

const LOFI_STREAMS = [
  { id: "kikyo", name: "🌸 Kikyo Study Chill", url: "https://kuvlkaxregnanhzgqrbp.supabase.co/storage/v1/object/public/hvl_audio/01.mp3" },
  { id: "rainy", name: "🍵 Rainy Gekka Tea Shop", url: "https://kuvlkaxregnanhzgqrbp.supabase.co/storage/v1/object/public/hvl_audio/05.mp3" },
  { id: "midnight", name: "🌙 Midnight Academy", url: "https://kuvlkaxregnanhzgqrbp.supabase.co/storage/v1/object/public/hvl_audio/10.mp3" },
];

export default function WebStudyRoomPage() {
  const [activeTab, setActiveTab] = useState<"25" | "50" | "custom">("25");
  const [duration, setDuration] = useState(25);
  const [timeLeft, setTimeLeft] = useState(25 * 60);
  const [isRunning, setIsRunning] = useState(false);
  const [isBreak, setIsBreak] = useState(false);
  const [currentStream, setCurrentStream] = useState(LOFI_STREAMS[0]);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [volume, setVolume] = useState(0.5);

  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Timer Countdown Effect
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    if (isRunning && timeLeft > 0) {
      interval = setInterval(() => {
        setTimeLeft((prev) => prev - 1);
      }, 1000);
    } else if (timeLeft === 0 && isRunning) {
      setIsRunning(false);
      if (!isBreak) {
        setIsBreak(true);
        setTimeLeft(5 * 60); // 5 min break
      } else {
        setIsBreak(false);
        setTimeLeft(duration * 60);
      }
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isRunning, timeLeft, isBreak, duration]);

  // Audio Player Handling
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume;
    }
  }, [volume]);

  const toggleAudio = () => {
    if (!audioRef.current) return;
    if (isPlayingAudio) {
      audioRef.current.pause();
      setIsPlayingAudio(false);
    } else {
      audioRef.current.play().then(() => setIsPlayingAudio(true)).catch(() => {});
    }
  };

  const handleSelectStream = (stream: typeof LOFI_STREAMS[0]) => {
    setCurrentStream(stream);
    if (audioRef.current) {
      audioRef.current.src = stream.url;
      if (isPlayingAudio) {
        audioRef.current.play().catch(() => {});
      }
    }
  };

  const handleStart = () => {
    setIsRunning(true);
  };

  const handlePause = () => {
    setIsRunning(false);
  };

  const handleReset = () => {
    setIsRunning(false);
    setIsBreak(false);
    setTimeLeft(duration * 60);
  };

  const handleSelectDuration = (mins: number, tabKey: "25" | "50" | "custom") => {
    setActiveTab(tabKey);
    setDuration(mins);
    setTimeLeft(mins * 60);
    setIsRunning(false);
    setIsBreak(false);
  };

  const formatMinSec = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  };

  const percent = Math.min(100, Math.floor(((duration * 60 - timeLeft) / (duration * 60)) * 100));

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-between p-4 md:p-8 relative overflow-hidden">
      {/* Background Glow */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-purple-900/20 blur-[120px] rounded-full pointer-events-none" />

      {/* Header */}
      <header className="w-full max-w-5xl flex items-center justify-between z-10 py-4 border-b border-purple-900/30">
        <Link href="/" className="flex items-center gap-2 text-purple-400 hover:text-purple-300 transition-colors">
          <span>← Trang chủ</span>
        </Link>
        <div className="flex items-center gap-2 bg-purple-950/60 border border-purple-800/40 px-4 py-1.5 rounded-full backdrop-blur-md">
          <span className="text-sm font-medium text-purple-200">Góc Học Bài Lofi Waguri 🌸</span>
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
              <h2 className="text-xl font-bold text-purple-200 mb-1">Học Viện Kikyo • Thư Viện Tĩnh Lặng</h2>
              <p className="text-xs text-purple-300/80 italic">"Waguri đang ngồi cạnh giữ im lặng để cậu tập trung nè~"</p>
            </div>

            {/* Falling Sakura Floating Emblems */}
            <div className="absolute top-4 left-4 text-xs bg-purple-900/60 border border-purple-700/40 text-purple-200 px-3 py-1 rounded-full">
              {isBreak ? "☕ Thời gian nghỉ giải lao" : "🟢 Đang trong phiên tập trung"}
            </div>
          </div>

          {/* HTML5 Lo-Fi Audio Player Controls */}
          <div className="w-full mt-6 bg-slate-900/80 border border-purple-800/30 rounded-2xl p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-purple-300 flex items-center gap-2">
                🎧 Kênh Lofi: <span className="text-purple-100">{currentStream.name}</span>
              </span>
              <button
                onClick={toggleAudio}
                className="bg-purple-600 hover:bg-purple-500 text-white text-xs px-3 py-1.5 rounded-lg font-medium transition-all shadow-lg"
              >
                {isPlayingAudio ? "Tạm dừng ⏸️" : "Phát nhạc 🎵"}
              </button>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-purple-400">Âm lượng:</span>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={volume}
                onChange={(e) => setVolume(parseFloat(e.target.value))}
                className="w-full accent-purple-500 bg-purple-950 h-1.5 rounded-lg cursor-pointer"
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

            <audio ref={audioRef} src={currentStream.url} loop />
          </div>
        </div>

        {/* Pomodoro Timer Control Panel */}
        <div className="w-full md:w-1/2 flex flex-col items-center bg-slate-900/90 border border-purple-800/40 backdrop-blur-xl rounded-3xl p-8 shadow-2xl">
          {/* Tab Selector */}
          <div className="flex gap-2 bg-purple-950/60 p-1.5 rounded-xl border border-purple-800/40 mb-6">
            <button
              onClick={() => handleSelectDuration(25, "25")}
              className={`px-4 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                activeTab === "25" ? "bg-purple-600 text-white shadow-md" : "text-purple-300 hover:text-white"
              }`}
            >
              25 Phút (Pomodoro)
            </button>
            <button
              onClick={() => handleSelectDuration(50, "50")}
              className={`px-4 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                activeTab === "50" ? "bg-purple-600 text-white shadow-md" : "text-purple-300 hover:text-white"
              }`}
            >
              50 Phút (Deep Work)
            </button>
          </div>

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
          <span className="text-xs text-purple-300 font-mono mb-6">{percent}% hoàn thành</span>

          {/* Action Buttons */}
          <div className="flex items-center gap-4 w-full">
            {!isRunning ? (
              <button
                onClick={handleStart}
                className="flex-1 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white font-bold py-3.5 px-6 rounded-xl shadow-lg transition-all hover:scale-[1.02] active:scale-[0.98]"
              >
                Bắt đầu học 🚀
              </button>
            ) : (
              <button
                onClick={handlePause}
                className="flex-1 bg-amber-600 hover:bg-amber-500 text-white font-bold py-3.5 px-6 rounded-xl shadow-lg transition-all"
              >
                Tạm dừng ⏸️
              </button>
            )}
            <button
              onClick={handleReset}
              className="bg-slate-800 hover:bg-slate-700 text-purple-300 font-medium py-3.5 px-5 rounded-xl border border-purple-800/40 transition-all"
            >
              Đặt lại 🔄
            </button>
          </div>
        </div>
      </main>

      {/* Footer Info */}
      <footer className="w-full max-w-5xl z-10 py-4 text-center text-xs text-purple-400/60 border-t border-purple-900/30">
        Waguri Bot Ecosystem • Pomodoro 24/7 Lofi Study Room
      </footer>
    </div>
  );
}
