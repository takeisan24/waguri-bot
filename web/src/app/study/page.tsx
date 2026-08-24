"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { useLanguage } from "../../components/LanguageProvider";
import {
  batDauPhienHoc,
  buTruThoiGianTamDung,
  hoanThanhPhienHoc,
  huyPhienHoc,
  dapNhipPhienHoc,
  dangDangNhap,
} from "./actions";

// Năm kênh nhạc LOFI thật (Pixabay Content License — miễn phí, không cần ghi công).
//
// Bộ cũ lấy nhạc dự phòng từ bucket `hvl_audio` — đó là album rap của easter egg HVL/MCK, sai
// hoàn toàn không khí phòng học. Nay mỗi kênh có hai nguồn CÙNG MỘT BÀI:
//   · `url`         -> CDN Pixabay: miễn phí băng thông, cache toàn cầu, `Access-Control-Allow-Origin: *`
//   · `fallbackUrl` -> bản sao trong Supabase Storage bucket `study_lofi` của chính dự án
//
// Vì sao phải có bản sao: một trong ba link Pixabay của bộ cũ đã chết thật (403 AccessDenied),
// và khi CSP còn chặn thì không ai nhận ra. Pixabay gỡ bài lúc nào là quyền của họ; bản sao
// nằm trong Storage của mình thì không ai gỡ được.
const LOFI_MIRROR = "https://kuvlkaxregnanhzgqrbp.supabase.co/storage/v1/object/public/study_lofi";

const LOFI_STREAMS = [
  {
    id: "study",
    name: "🌸 Kikyo Study Session",
    url: "https://cdn.pixabay.com/audio/2026/07/15/audio_6b51a3af77.mp3",
    fallbackUrl: `${LOFI_MIRROR}/study-session.mp3`,
  },
  {
    id: "coffee",
    name: "☕ Gekka Coffee Shop",
    url: "https://cdn.pixabay.com/audio/2026/07/15/audio_6353298add.mp3",
    fallbackUrl: `${LOFI_MIRROR}/coffee-shop.mp3`,
  },
  {
    id: "sunny",
    name: "🌤️ Sunny Terrace",
    url: "https://cdn.pixabay.com/audio/2026/07/15/audio_c93b94ebff.mp3",
    fallbackUrl: `${LOFI_MIRROR}/sunny-cafe.mp3`,
  },
  {
    id: "diner",
    name: "🍜 Midnight Diner",
    url: "https://cdn.pixabay.com/audio/2026/07/15/audio_6c889c5533.mp3",
    fallbackUrl: `${LOFI_MIRROR}/restaurant.mp3`,
  },
  {
    id: "night",
    name: "🌙 Quiet Night Beats",
    url: "https://cdn.pixabay.com/audio/2026/07/25/audio_4bc2101521.mp3",
    fallbackUrl: `${LOFI_MIRROR}/chill-vlog.mp3`,
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

  // --- Phiên được DB ghi nhận (chỉ khi đã đăng nhập) ---
  const [daDangNhap, setDaDangNhap] = useState<boolean | null>(null);  // null = chưa biết
  const [tenPhien, setTenPhien] = useState("");
  const [phienDb, setPhienDb] = useState<{ id: number } | null>(null);
  const [thongBao, setThongBao] = useState<string | null>(null);
  const [phanThuong, setPhanThuong] = useState<
    { coins: number; exp: number; points: number; streak: number; minutes: number } | null
  >(null);
  const [dangGoi, setDangGoi] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const chimeCtxRef = useRef<AudioContext | null>(null);
  // Mốc kết thúc tuyệt đối (epoch ms) của pha đang chạy; null = đồng hồ đang dừng.
  const deadlineRef = useRef<number | null>(null);
  // Lúc bấm tạm dừng, để khi học tiếp còn biết đã nghỉ bao lâu mà dời hạn phía máy chủ.
  const tamDungLucRef = useRef<number | null>(null);
  // Khoá chống gọi chốt phiên nhiều lần: nhịp đồng hồ chạy mỗi 250ms, không khoá thì một lần
  // hết giờ bắn ra cả chục lượt gọi máy chủ.
  const dangChotRef = useRef(false);

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
  /** Chuyển sang pha nghỉ (dùng chung cho cả phiên có DB lẫn phiên chạy chay). */
  const vaoGioNghi = useCallback(() => {
    deadlineRef.current = Date.now() + BREAK_MINUTES * 60 * 1000;
    setPhase("break");
    setTimeLeft(BREAK_MINUTES * 60);
  }, []);

  const tick = useCallback(() => {
    if (deadlineRef.current === null) return;
    const remaining = Math.max(0, Math.round((deadlineRef.current - Date.now()) / 1000));
    if (remaining > 0) {
      setTimeLeft(remaining);
      return;
    }

    if (phase === "focus") {
      // Phiên có DB: máy chủ mới là bên quyết định đã đủ giờ hay chưa.
      if (phienDb) {
        // Đang chờ máy chủ trả lời -> KHÔNG làm gì thêm. Thiếu nhánh này thì nhịp 250ms kế tiếp
        // rơi xuống đường "chạy chay" bên dưới, nhảy sang giờ nghỉ và xoá mất kết quả đang chờ.
        if (dangChotRef.current) return;
        dangChotRef.current = true;
        setDangGoi(true);
        void hoanThanhPhienHoc(phienDb.id)
          .then((kq) => {
            if (kq.ok) {
              playChime();
              setPhanThuong({ coins: kq.coins, exp: kq.exp, points: kq.points, streak: kq.streak, minutes: kq.minutes });
              setThongBao(null);
              setPhienDb(null);
              vaoGioNghi();
              return;
            }
            if (kq.ma === "chua_het_gio") {
              // Đồng hồ máy này chạy nhanh hơn máy chủ. KHÔNG kết thúc phiên — dời hạn theo số
              // giây máy chủ báo rồi đếm tiếp. Không có cái này thì lệch đồng hồ vài giây làm
              // người dùng mất trắng phần thưởng.
              deadlineRef.current = Date.now() + (kq.giayConLai || 1) * 1000;
              dangChotRef.current = false;
              return;
            }
            // Các nhánh còn lại đều là hỏng thật -> nói thẳng, KHÔNG hiện phần thưởng giả.
            // `chua_choi_bot` cố ý để phiên nguyên ACTIVE phía DB (để còn nhận thưởng sau khi
            // có ví). Nhưng người dùng không có nút nào để quay lại nhận, mà phiên treo đó lại
            // khoá lần bắt đầu kế tiếp bằng thông báo "đang có phiên khác" — sai và khó hiểu.
            // Nên dọn hẳn ở đây: mất phiên là điều không tránh được khi không có ví để cộng.
            if (kq.ma === "chua_choi_bot") void huyPhienHoc(phienDb.id);
            setPhienDb(null);
            setThongBao(
              kq.ma === "chua_choi_bot" ? t("study.err_no_game_account")
                : kq.ma === "chua_dang_nhap" ? t("study.err_login_lost")
                  : kq.ma === "khong_thay_phien" ? t("study.err_session_gone")
                    : t("study.err_db")
            );
            playChime();
            vaoGioNghi();
          })
          .finally(() => setDangGoi(false));
        return;
      }

      // Phiên chạy chay (chưa đăng nhập): không có gì để chốt.
      playChime();
      vaoGioNghi();
      return;
    }

    // Hết giờ nghỉ -> dừng hẳn, chờ bấm Bắt đầu cho phiên mới.
    playChime();
    deadlineRef.current = null;
    setPhase("focus");
    setTimeLeft(duration * 60);
    setIsRunning(false);
  }, [phase, duration, playChime, phienDb, vaoGioNghi, t]);

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

  // Nhịp tim: báo cho máy chủ biết tab này còn mở. Chạy KỂ CẢ khi đang tạm dừng — tạm dừng vẫn
  // là đang giữ phiên. 60 giây một nhịp, ngưỡng bỏ hoang phía DB là 5 phút nên lỡ vài nhịp vẫn ổn.
  useEffect(() => {
    if (!phienDb) return;
    const id = setInterval(() => { void dapNhipPhienHoc(phienDb.id); }, 60_000);
    return () => clearInterval(id);
  }, [phienDb]);

  // Có đăng nhập Discord hay không quyết định phiên này có được ghi nhận & thưởng hay không.
  useEffect(() => {
    let huy = false;
    void dangDangNhap().then((v) => { if (!huy) setDaDangNhap(v); });
    return () => { huy = true; };
  }, []);

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

  const handleStart = async () => {
    // Mở AudioContext ngay trong user-gesture để chuông báo hết giờ chắc chắn kêu được.
    primeChime();
    setPhanThuong(null);
    setThongBao(null);

    // Học tiếp sau khi tạm dừng: dời hạn phía máy chủ đúng bằng khoảng đã nghỉ, vì đồng hồ
    // máy chủ không biết mình vừa bấm tạm dừng.
    if (phienDb && tamDungLucRef.current !== null) {
      const giayDaDung = Math.round((Date.now() - tamDungLucRef.current) / 1000);
      tamDungLucRef.current = null;
      deadlineRef.current = Date.now() + timeLeft * 1000;
      setIsRunning(true);
      await buTruThoiGianTamDung(phienDb.id, giayDaDung);
      return;
    }

    // Chưa đăng nhập -> vẫn cho học, chỉ là không ghi nhận gì. Không chặn tính năng.
    if (!daDangNhap || phase === "break") {
      deadlineRef.current = Date.now() + timeLeft * 1000;
      setIsRunning(true);
      return;
    }

    // Phiên mới, có đăng nhập -> để máy chủ chốt mốc kết thúc.
    setDangGoi(true);
    const kq = await batDauPhienHoc(duration, tenPhien);
    setDangGoi(false);

    if (!kq.ok) {
      setThongBao(
        kq.ma === "dang_co_phien" ? t("study.err_already_active")
          : kq.ma === "chua_dang_nhap" ? t("study.err_login_lost")
            : t("study.err_db")
      );
      // Vẫn cho đồng hồ chạy chay để người dùng không bị chặn đứng — nhưng đã báo rõ là
      // phiên này KHÔNG được ghi nhận.
      deadlineRef.current = Date.now() + timeLeft * 1000;
      setIsRunning(true);
      return;
    }

    dangChotRef.current = false;
    setPhienDb({ id: kq.sessionId });
    // Mốc kết thúc lấy theo ĐỒNG HỒ MÁY CHỦ, không phải máy người dùng.
    deadlineRef.current = new Date(kq.endsAt).getTime();
    setTimeLeft(Math.max(1, Math.round((new Date(kq.endsAt).getTime() - Date.now()) / 1000)));
    setIsRunning(true);
  };

  const handlePause = () => {
    deadlineRef.current = null;
    setIsRunning(false);
    if (phienDb) tamDungLucRef.current = Date.now();
  };

  /** Dừng hẳn phiên đang chạy. Có phiên DB thì huỷ luôn trên máy chủ (không thưởng). */
  const handleReset = () => {
    const dangHuy = phienDb;
    deadlineRef.current = null;
    tamDungLucRef.current = null;
    dangChotRef.current = false;
    setIsRunning(false);
    setPhase("focus");
    setTimeLeft(duration * 60);
    setPhanThuong(null);
    if (dangHuy) {
      setPhienDb(null);
      setThongBao(t("study.notice_cancelled"));
      void huyPhienHoc(dangHuy.id);
    } else {
      setThongBao(null);
    }
  };

  const applyDuration = (mins: number, tabKey: TabKey) => {
    // Đổi độ dài giữa chừng = bỏ phiên đang chạy; phải huỷ trên máy chủ, nếu không dòng ACTIVE
    // nằm lại và khoá luôn lần bắt đầu kế tiếp.
    const dangHuy = phienDb;
    deadlineRef.current = null;
    tamDungLucRef.current = null;
    dangChotRef.current = false;
    setActiveTab(tabKey);
    setDuration(mins);
    setTimeLeft(mins * 60);
    setIsRunning(false);
    setPhase("focus");
    setPhanThuong(null);
    if (dangHuy) {
      setPhienDb(null);
      void huyPhienHoc(dangHuy.id);
    }
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

            <div className="flex gap-2 mt-1 flex-wrap">
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

          {/* Tên phiên — ghi vào DB để lịch sử học có ý nghĩa, giống tuỳ chọn `title` của bot */}
          {daDangNhap && !phienDb ? (
            <input
              type="text"
              maxLength={50}
              value={tenPhien}
              onChange={(e) => setTenPhien(e.target.value)}
              placeholder={t("study.name_placeholder")}
              aria-label={t("study.name_placeholder")}
              className="w-full mb-2 bg-purple-950/40 border border-purple-800/40 text-purple-100 text-sm rounded-lg px-3 py-2 text-center placeholder:text-purple-400/50 focus:outline-none focus:border-purple-500"
            />
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
              {phienDb ? t("study.btn_give_up") : t("study.btn_reset")}
            </button>
          </div>

          {/* ---- Trạng thái ghi nhận phiên học ---- */}
          <div className="w-full mt-5 flex flex-col gap-2" role="status">
            {phanThuong ? (
              <div className="rounded-xl border border-emerald-700/50 bg-emerald-950/40 px-4 py-3 text-center">
                <p className="text-sm font-semibold text-emerald-300">{t("study.reward_title")}</p>
                <p className="text-xs text-emerald-200/90 mt-1">
                  {t("study.reward_body", {
                    minutes: phanThuong.minutes,
                    coins: phanThuong.coins.toLocaleString("vi-VN"),
                    exp: phanThuong.exp.toLocaleString("vi-VN"),
                    points: phanThuong.points,
                    streak: phanThuong.streak,
                  })}
                </p>
              </div>
            ) : null}

            {thongBao ? (
              <p className="text-[11px] text-amber-300/90 italic text-center">{thongBao}</p>
            ) : null}

            {daDangNhap === false ? (
              <p className="text-[11px] text-purple-300/80 text-center">
                {t("study.guest_notice")}{" "}
                <Link href="/login" className="text-purple-300 underline hover:text-purple-200">
                  {t("study.guest_login")}
                </Link>
              </p>
            ) : null}

            {phienDb ? (
              <p className="text-[11px] text-purple-300/80 text-center">
                {t("study.tracked_notice", { minutes: duration })}
              </p>
            ) : null}

            {dangGoi ? (
              <p className="text-[11px] text-purple-400/70 text-center">{t("study.saving")}</p>
            ) : null}
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
