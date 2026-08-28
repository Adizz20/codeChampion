import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer,
} from "recharts";
import {
  Plus, X, RefreshCw, Trash2, Bell, BellOff, AlertTriangle, Loader2,
  Flame, Sun, Moon, Crown, Target, Calendar, TrendingUp, TrendingDown,
  ExternalLink, Zap, User, Award,
} from "lucide-react";

/* ============================== constants ============================== */

const CF_API = "https://codeforces.com/api";
const LC_API = "https://alfa-leetcode-api.onrender.com";
const FRIENDS_KEY = "aclog_friends_v1";
const SETTINGS_KEY = "aclog_settings_v1";
const STATS_KEY = "aclog_stats_v1";

const PERIODS = [
  { id: "daily", label: "DAILY", days: 1 },
  { id: "weekly", label: "WEEKLY", days: 7 },
  { id: "monthly", label: "MONTHLY", days: 30 },
];

const CF_TIERS = [
  { max: 1200, name: "newbie", color: "#8a8f9c" },
  { max: 1400, name: "pupil", color: "#4caf3f" },
  { max: 1600, name: "specialist", color: "#22b3ad" },
  { max: 1900, name: "expert", color: "#4d90f0" },
  { max: 2100, name: "candidate master", color: "#a85ef0" },
  { max: 2300, name: "master", color: "#e0a02e" },
  { max: 2400, name: "int. master", color: "#e0862e" },
  { max: 2600, name: "grandmaster", color: "#e0432e" },
  { max: 3000, name: "int. grandmaster", color: "#cc2020" },
  { max: Infinity, name: "legendary gm", color: "#b0001f" },
];

const AVATAR_COLORS = ["#3DDC84", "#4FC3F7", "#F5A623", "#A78BFA", "#FF7A7A", "#5EEAD4"];

const DEFAULT_GOAL = 25;

/* theme palettes — applied as inline CSS variables on .ac-root so every
   var(--x) in the stylesheet resolves per-theme without duplicating CSS. */
const THEMES = {
  dark: {
    "--bg-void": "#0A0C10", "--bg-panel": "#12151C", "--bg-raised": "#181C25",
    "--border": "#242A38", "--border-soft": "#1C212C",
    "--text": "#E7EAF1", "--text-muted": "#8791A8", "--text-faint": "#5B6274",
    "--ac": "#3DDC84", "--ac-dim": "rgba(61,220,132,0.15)",
    "--warn": "#F5A623", "--wa": "#FF5D5D", "--info": "#4FC3F7",
    "--glow": "radial-gradient(circle at 12% -5%, rgba(61,220,132,0.10), transparent 42%), radial-gradient(circle at 92% 0%, rgba(79,195,247,0.07), transparent 40%)",
    "--cell-0": "rgba(255,255,255,0.05)",
    "--cell-1": "rgba(61,220,132,0.35)",
    "--cell-2": "rgba(61,220,132,0.62)",
    "--cell-3": "rgba(61,220,132,0.95)",
    "--skel": "linear-gradient(90deg, rgba(255,255,255,0.03), rgba(255,255,255,0.08), rgba(255,255,255,0.03))",
  },
  light: {
    "--bg-void": "#EDF1F7", "--bg-panel": "#FFFFFF", "--bg-raised": "#F5F8FC",
    "--border": "#DCE2EC", "--border-soft": "#E8ECF3",
    "--text": "#141A26", "--text-muted": "#57617A", "--text-faint": "#8A94A8",
    "--ac": "#0F9D58", "--ac-dim": "rgba(15,157,88,0.12)",
    "--warn": "#C77700", "--wa": "#E5484D", "--info": "#2E77E6",
    "--glow": "radial-gradient(circle at 12% -5%, rgba(15,157,88,0.08), transparent 42%), radial-gradient(circle at 92% 0%, rgba(46,119,230,0.06), transparent 40%)",
    "--cell-0": "rgba(20,26,38,0.06)",
    "--cell-1": "rgba(15,157,88,0.32)",
    "--cell-2": "rgba(15,157,88,0.60)",
    "--cell-3": "rgba(15,157,88,0.92)",
    "--skel": "linear-gradient(90deg, rgba(20,26,38,0.03), rgba(20,26,38,0.08), rgba(20,26,38,0.03))",
  },
};

/* ============================== helpers ============================== */

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function dayKey(tsSeconds) {
  return new Date(tsSeconds * 1000).toISOString().slice(0, 10);
}

function todayKey() {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
}

function cutoffKey(days) {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - (days - 1));
  return d.toISOString().slice(0, 10);
}

function timeAgo(ts) {
  if (!ts) return "never synced";
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 10) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function agoFromSeconds(sec) {
  return timeAgo(Number(sec) * 1000);
}

function ordinal(n) {
  const s = ["th", "st", "nd", "rd"], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function cfTier(rating) {
  if (!rating) return { name: "unrated", color: "#5b6274" };
  return CF_TIERS.find((t) => rating <= t.max) || CF_TIERS[CF_TIERS.length - 1];
}

function avatarColor(name) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

function initials(name) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
}

function countInPeriod(byDay, days) {
  const cutoff = cutoffKey(days);
  let total = 0;
  for (const [day, count] of Object.entries(byDay || {})) {
    if (day >= cutoff) total += count;
  }
  return total;
}

/* current + longest consecutive-day streak across any number of by-day maps */
function computeStreaks(...byDays) {
  const set = new Set();
  for (const m of byDays) {
    for (const [d, c] of Object.entries(m || {})) if (c > 0) set.add(d);
  }
  if (!set.size) return { current: 0, longest: 0 };

  const cur = new Date();
  cur.setUTCHours(0, 0, 0, 0);
  const has = (d) => set.has(d.toISOString().slice(0, 10));
  // today may not be over yet — if nothing today, start counting from yesterday
  if (!has(cur)) cur.setUTCDate(cur.getUTCDate() - 1);
  let current = 0;
  while (has(cur)) { current++; cur.setUTCDate(cur.getUTCDate() - 1); }

  const days = [...set].sort();
  let longest = 0, run = 0, prev = null;
  for (const d of days) {
    if (prev) {
      const diff = (Date.parse(d) - Date.parse(prev)) / 86400000;
      run = diff === 1 ? run + 1 : 1;
    } else run = 1;
    if (run > longest) longest = run;
    prev = d;
  }
  return { current, longest };
}

function playBeep() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    const ctx = new Ctx();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.value = 880;
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.16, ctx.currentTime + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.32);
    o.connect(g);
    g.connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + 0.34);
    setTimeout(() => ctx.close(), 500);
  } catch (e) {
    /* audio unavailable, ignore */
  }
}

/* dependency-free confetti burst (respects reduced-motion) */
function fireConfetti(count = 90) {
  if (typeof document === "undefined") return;
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
  const root = document.createElement("div");
  root.className = "ac-confetti";
  const colors = ["#3DDC84", "#4FC3F7", "#F5A623", "#FF7A7A", "#A78BFA", "#5EEAD4"];
  for (let i = 0; i < count; i++) {
    const p = document.createElement("i");
    const size = 6 + Math.random() * 6;
    const drift = (Math.random() * 2 - 1) * 160;
    p.style.cssText =
      `left:${Math.random() * 100}vw;width:${size}px;height:${size * 0.5}px;` +
      `background:${colors[i % colors.length]};animation-duration:${1.6 + Math.random() * 1.4}s;` +
      `animation-delay:${Math.random() * 0.25}s;--drift:${drift}px;`;
    root.appendChild(p);
  }
  document.body.appendChild(root);
  setTimeout(() => root.remove(), 3600);
}

/* count-up animation for stat numbers */
function useCountUp(target, duration = 650) {
  const [val, setVal] = useState(target);
  const fromRef = useRef(target);
  const rafRef = useRef(0);
  useEffect(() => {
    const from = fromRef.current;
    const to = Number(target) || 0;
    if (from === to) return;
    const start = performance.now();
    cancelAnimationFrame(rafRef.current);
    const tick = (now) => {
      const p = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setVal(Math.round(from + (to - from) * eased));
      if (p < 1) rafRef.current = requestAnimationFrame(tick);
      else fromRef.current = to;
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [target, duration]);
  return val;
}

function CountUp({ value, className }) {
  const v = useCountUp(Number(value) || 0);
  return <span className={className}>{v}</span>;
}

async function fetchWithTimeout(url, ms) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

async function readDeviceStorage(key) {
  if (window.storage?.get) return window.storage.get(key, false);
  return { value: window.localStorage.getItem(key) };
}

async function writeDeviceStorage(key, value) {
  if (window.storage?.set) return window.storage.set(key, value, false);
  window.localStorage.setItem(key, value);
  return { value };
}

/* ============================== data fetchers ============================== */

async function fetchCodeforces(handle) {
  if (!handle) return null;
  const out = {
    handle, ok: false, error: null,
    rating: null, maxRating: null, rank: null, avatar: null,
    solvedCount: 0, submissionsByDay: {}, ratingHistory: [],
  };
  try {
    const info = await fetchWithTimeout(
      `${CF_API}/user.info?handles=${encodeURIComponent(handle)}`, 12000
    );
    if (info.status !== "OK") throw new Error(info.comment || "handle not found");
    const u = info.result[0];
    out.rating = u.rating ?? null;
    out.maxRating = u.maxRating ?? null;
    out.rank = u.rank ?? null;
    const rawAvatar = u.titlePhoto || u.avatar || "";
    out.avatar = rawAvatar ? (rawAvatar.startsWith("//") ? "https:" + rawAvatar : rawAvatar) : null;

    try {
      const status = await fetchWithTimeout(
        `${CF_API}/user.status?handle=${encodeURIComponent(handle)}&from=1&count=100000`, 20000
      );
      if (status.status === "OK") {
        const firstSolve = {};
        for (const sub of status.result) {
          if (sub.verdict === "OK") {
            const pid = `${sub.problem.contestId || ""}${sub.problem.index || sub.problem.name}`;
            if (!firstSolve[pid] || sub.creationTimeSeconds < firstSolve[pid]) {
              firstSolve[pid] = sub.creationTimeSeconds;
            }
          }
        }
        out.solvedCount = Object.keys(firstSolve).length;
        for (const ts of Object.values(firstSolve)) {
          const d = dayKey(ts);
          out.submissionsByDay[d] = (out.submissionsByDay[d] || 0) + 1;
        }
      }
    } catch (e) { /* submissions optional, keep profile data */ }

    try {
      const rating = await fetchWithTimeout(
        `${CF_API}/user.rating?handle=${encodeURIComponent(handle)}`, 10000
      );
      if (rating.status === "OK") {
        out.ratingHistory = rating.result.map((r) => ({
          t: r.ratingUpdateTimeSeconds * 1000,
          rating: r.newRating,
        }));
      }
    } catch (e) { /* rating history optional */ }

    out.ok = true;
  } catch (e) {
    out.error = e.name === "AbortError" ? "request timed out" : (e.message || "failed to fetch");
  }
  return out;
}

async function fetchLeetCode(username) {
  if (!username) return null;
  const out = {
    username, ok: false, error: null,
    totalSolved: null, easySolved: null, mediumSolved: null, hardSolved: null,
    ranking: null, avatar: null, submissionsByDay: {},
    contestRating: null, contestRanking: null, contestTopPercentage: null, contestHistory: [],
    badges: [], badgesCount: 0, recentAC: [],
  };
  try {
    const enc = encodeURIComponent(username);
    const [profileR, solvedR, calendarR, contestR, badgesR, acR] = await Promise.allSettled([
      fetchWithTimeout(`${LC_API}/${enc}`, 20000),
      fetchWithTimeout(`${LC_API}/${enc}/solved`, 20000),
      fetchWithTimeout(`${LC_API}/${enc}/calendar`, 20000),
      fetchWithTimeout(`${LC_API}/${enc}/contest`, 20000),
      fetchWithTimeout(`${LC_API}/${enc}/badges`, 20000),
      fetchWithTimeout(`${LC_API}/${enc}/acSubmission?limit=8`, 20000),
    ]);

    if (profileR.status === "fulfilled") {
      const p = profileR.value;
      out.avatar = p.avatar || null;
      out.ranking = p.ranking ?? null;
    }
    if (solvedR.status === "fulfilled") {
      const s = solvedR.value;
      out.totalSolved = s.solvedProblem ?? s.totalSolved ?? null;
      out.easySolved = s.easySolved ?? 0;
      out.mediumSolved = s.mediumSolved ?? 0;
      out.hardSolved = s.hardSolved ?? 0;
    }
    if (calendarR.status === "fulfilled") {
      let cal = calendarR.value?.submissionCalendar;
      if (typeof cal === "string") {
        try { cal = JSON.parse(cal); } catch (e) { cal = null; }
      }
      if (cal && typeof cal === "object") {
        for (const [ts, count] of Object.entries(cal)) {
          const d = dayKey(Number(ts));
          out.submissionsByDay[d] = (out.submissionsByDay[d] || 0) + Number(count);
        }
      }
    }
    if (contestR.status === "fulfilled") {
      const c = contestR.value;
      if (c && typeof c.contestRating === "number" && c.contestRating > 0) {
        out.contestRating = Math.round(c.contestRating);
        out.contestRanking = c.contestGlobalRanking ?? null;
        out.contestTopPercentage = c.contestTopPercentage ?? null;
      }
      if (Array.isArray(c?.contestParticipation)) {
        out.contestHistory = c.contestParticipation
          .filter((p) => p.attended && p.rating)
          .map((p) => ({ t: (p.contest?.startTime || 0) * 1000, rating: Math.round(p.rating) }));
      }
    }
    if (badgesR.status === "fulfilled") {
      const b = badgesR.value;
      out.badgesCount = b?.badgesCount ?? (Array.isArray(b?.badges) ? b.badges.length : 0);
      if (Array.isArray(b?.badges)) {
        out.badges = b.badges.slice(0, 8).map((x) => ({
          id: x.id, name: x.displayName || "badge", icon: x.icon || null,
        }));
      }
    }
    if (acR.status === "fulfilled") {
      const list = acR.value?.submission;
      if (Array.isArray(list)) {
        out.recentAC = list.slice(0, 8).map((s) => ({
          title: s.title, titleSlug: s.titleSlug, ts: Number(s.timestamp) || 0,
        }));
      }
    }

    const gotSomething =
      out.totalSolved != null || out.ranking != null ||
      Object.keys(out.submissionsByDay).length > 0 || out.contestRating != null;
    if (!gotSomething) throw new Error("username not found or proxy asleep");
    out.ok = true;
  } catch (e) {
    out.error = e.name === "AbortError" ? "request timed out" : (e.message || "failed to fetch");
  }
  return out;
}

/* today's LeetCode daily challenge — fetched once, shown as a banner */
async function fetchDailyChallenge() {
  try {
    const d = await fetchWithTimeout(`${LC_API}/daily`, 15000);
    const title = d.questionTitle || d.question?.title || null;
    if (!title) return null;
    const slug = d.titleSlug || d.question?.titleSlug || null;
    const link = d.questionLink || (slug ? `https://leetcode.com/problems/${slug}/` : "https://leetcode.com/problemset/");
    const difficulty = d.difficulty || d.question?.difficulty || null;
    return { title, link, difficulty, date: d.date || null };
  } catch (e) {
    return null;
  }
}

/* ============================== small UI pieces ============================== */

function Avatar({ name, url, size = 40, ring }) {
  const [broken, setBroken] = useState(false);
  const base = { width: size, height: size, fontSize: size * 0.38 };
  const ringStyle = ring ? { boxShadow: `0 0 0 2px var(--bg-raised), 0 0 0 3.5px ${ring}` } : null;
  if (url && !broken) {
    return (
      <img
        src={url} alt="" className="ac-avatar-img" style={{ ...base, ...ringStyle }}
        onError={() => setBroken(true)}
      />
    );
  }
  return (
    <div className="ac-avatar-fallback" style={{ ...base, ...ringStyle, background: avatarColor(name) }}>
      {initials(name) || "?"}
    </div>
  );
}

function StreakFlame({ n }) {
  if (!n) return null;
  return (
    <span className={`ac-streak ${n >= 7 ? "ac-streak-hot" : ""}`} title={`${n}-day solving streak`}>
      <Flame size={12} /> {n}
    </span>
  );
}

function RankDelta({ delta }) {
  if (delta == null) return null;
  if (delta === 0) return <span className="ac-delta ac-delta-0" title="no change">•</span>;
  const up = delta > 0;
  return (
    <span className={`ac-delta ${up ? "ac-delta-up" : "ac-delta-down"}`} title={`${up ? "up" : "down"} ${Math.abs(delta)}`}>
      {up ? <TrendingUp size={11} /> : <TrendingDown size={11} />}{Math.abs(delta)}
    </span>
  );
}

function Heatmap({ byDayCF, byDayLC, weeks = 12 }) {
  const cells = useMemo(() => {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const arr = [];
    for (let i = weeks * 7 - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setUTCDate(d.getUTCDate() - i);
      const key = d.toISOString().slice(0, 10);
      const count = (byDayCF?.[key] || 0) + (byDayLC?.[key] || 0);
      arr.push({ key, count });
    }
    return arr;
  }, [byDayCF, byDayLC, weeks]);

  function color(c) {
    if (!c) return "var(--cell-0)";
    if (c === 1) return "var(--cell-1)";
    if (c <= 3) return "var(--cell-2)";
    return "var(--cell-3)";
  }

  return (
    <div className="ac-heatmap" style={{ gridTemplateRows: `repeat(7, 1fr)` }}>
      {cells.map((c) => (
        <div
          key={c.key}
          className="ac-heatmap-cell"
          title={`${c.key} · ${c.count} solved`}
          style={{ background: color(c.count) }}
        />
      ))}
    </div>
  );
}

function DifficultyDonut({ easy, medium, hard }) {
  const total = (easy || 0) + (medium || 0) + (hard || 0);
  if (!total) return <div className="ac-donut-empty">—</div>;
  const data = [
    { name: "Easy", value: easy || 0, color: "#3DDC84" },
    { name: "Medium", value: medium || 0, color: "#F5A623" },
    { name: "Hard", value: hard || 0, color: "#FF5D5D" },
  ];
  return (
    <PieChart width={56} height={56}>
      <Pie
        data={data} dataKey="value" cx={28} cy={28}
        innerRadius={17} outerRadius={27} startAngle={90} endAngle={-270} stroke="none"
      >
        {data.map((d, i) => <Cell key={i} fill={d.color} />)}
      </Pie>
    </PieChart>
  );
}

function RatingSparkline({ history, color, empty = "no rated contests yet" }) {
  if (!history || history.length < 2) {
    return <div className="ac-sparkline-empty">{empty}</div>;
  }
  return (
    <ResponsiveContainer width="100%" height={40}>
      <LineChart data={history} margin={{ top: 4, bottom: 0, left: 0, right: 4 }}>
        <Line type="monotone" dataKey="rating" stroke={color} strokeWidth={2} dot={false} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

function LcBadges({ badges }) {
  if (!badges || !badges.length) return null;
  const shown = badges.filter((b) => b.icon).slice(0, 6);
  if (!shown.length) return null;
  return (
    <div className="ac-lc-badges" title="LeetCode badges">
      {shown.map((b) => (
        <img key={b.id} src={b.icon} alt={b.name} title={b.name} className="ac-lc-badge" loading="lazy" />
      ))}
    </div>
  );
}

function AchievementChips({ items }) {
  if (!items.length) return null;
  return (
    <div className="ac-ach">
      {items.slice(0, 4).map((a, i) => (
        <span key={i} className="ac-ach-chip"><span className="ac-ach-ico">{a.icon}</span>{a.text}</span>
      ))}
    </div>
  );
}

function GoalRing({ value, goal, size = 52 }) {
  const r = (size - 8) / 2;
  const c = 2 * Math.PI * r;
  const pct = goal > 0 ? Math.min(1, value / goal) : 0;
  const done = pct >= 1;
  return (
    <svg width={size} height={size} className="ac-goalring" role="img" aria-label={`${value} of ${goal} weekly goal`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={6} style={{ stroke: "var(--border)" }} />
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={6} strokeLinecap="round"
        strokeDasharray={c} strokeDashoffset={c * (1 - pct)}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ stroke: done ? "var(--ac)" : "var(--info)", transition: "stroke-dashoffset .6s ease" }}
      />
      <text x="50%" y="52%" textAnchor="middle" dominantBaseline="middle" className="ac-goalring-txt">{value}</text>
    </svg>
  );
}

function SkeletonCard() {
  return (
    <div className="ac-card ac-skel-card">
      <div className="ac-card-top">
        <div className="ac-skel ac-skel-avatar" />
        <div style={{ flex: 1 }}>
          <div className="ac-skel ac-skel-line" style={{ width: "55%" }} />
          <div className="ac-skel ac-skel-line" style={{ width: "35%", height: 8, marginTop: 7 }} />
        </div>
      </div>
      <div className="ac-skel ac-skel-line" style={{ width: "72%" }} />
      <div className="ac-skel ac-skel-block" />
    </div>
  );
}

function LeaderboardTooltip({ active, payload, label }) {
  if (!active || !payload || !payload.length) return null;
  const cf = payload.find((p) => p.dataKey === "cfCount")?.value || 0;
  const lc = payload.find((p) => p.dataKey === "lcCount")?.value || 0;
  return (
    <div className="ac-tooltip">
      <div className="ac-tooltip-name">{label}</div>
      <div className="ac-tooltip-row"><span className="ac-dot" style={{ background: "#4FC3F7" }} />CF {cf}</div>
      <div className="ac-tooltip-row"><span className="ac-dot" style={{ background: "#F5A623" }} />LC {lc}</div>
      <div className="ac-tooltip-total">{cf + lc} pts</div>
    </div>
  );
}

function ActivityTrend({ friends, stats, days }) {
  const data = useMemo(() => {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const points = [];
    for (let offset = days - 1; offset >= 0; offset--) {
      const date = new Date(today);
      date.setUTCDate(date.getUTCDate() - offset);
      const key = date.toISOString().slice(0, 10);
      let total = 0;
      for (const friend of friends) {
        const stat = stats[friend.id];
        total += stat?.cf?.ok ? (stat.cf.submissionsByDay[key] || 0) : 0;
        total += stat?.lc?.ok ? (stat.lc.submissionsByDay[key] || 0) : 0;
      }
      points.push({ key, label: key.slice(5), total });
    }
    return points;
  }, [days, friends, stats]);

  return (
    <div className="ac-trend">
      <div className="ac-viz-label">combined activity · {days === 1 ? "today" : `last ${days} days`}</div>
      <ResponsiveContainer width="100%" height={112}>
        <LineChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: -22 }}>
          <XAxis dataKey="label" tick={{ fill: "#8791A8", fontSize: 10, fontFamily: "var(--font-mono)" }} axisLine={false} tickLine={false} minTickGap={18} />
          <YAxis allowDecimals={false} tick={{ fill: "#8791A8", fontSize: 10, fontFamily: "var(--font-mono)" }} axisLine={false} tickLine={false} width={34} />
          <Tooltip
            contentStyle={{ background: "#181C25", border: "1px solid #242A38", borderRadius: 8, fontFamily: "var(--font-mono)", fontSize: 12 }}
            labelStyle={{ color: "#E7EAF1" }}
            formatter={(value) => [`${value} solved`, "activity"]}
          />
          <Line type="monotone" dataKey="total" stroke="#3DDC84" strokeWidth={2.5} dot={days === 1} activeDot={{ r: 4, fill: "#3DDC84" }} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ============================== daily challenge banner ============================== */

function DailyBanner({ daily }) {
  if (!daily) return null;
  const dc = daily.difficulty === "Hard" ? "#FF5D5D" : daily.difficulty === "Medium" ? "#F5A623" : "#3DDC84";
  return (
    <a className="ac-daily" href={daily.link} target="_blank" rel="noreferrer">
      <span className="ac-daily-ico"><Calendar size={15} /></span>
      <span className="ac-daily-label">LC daily</span>
      <span className="ac-daily-title">{daily.title}</span>
      {daily.difficulty && (
        <span className="ac-daily-diff" style={{ color: dc, borderColor: dc + "66", background: dc + "1a" }}>
          {daily.difficulty}
        </span>
      )}
      <span className="ac-daily-cta">solve <ExternalLink size={12} /></span>
    </a>
  );
}

/* ============================== activity feed ============================== */

function ActivityFeed({ items }) {
  if (!items.length) return null;
  return (
    <section className="ac-panel">
      <div className="ac-panel-head">
        <span className="ac-eyebrow">// live feed</span>
        <span className="ac-feed-sub">recent accepted · leetcode</span>
      </div>
      <div className="ac-feed">
        {items.map((it, i) => (
          <a key={i} className="ac-feed-row" href={it.link} target="_blank" rel="noreferrer">
            <span className="ac-feed-dot" style={{ background: it.color }} />
            <span className="ac-feed-who">{it.who}</span>
            <span className="ac-feed-verb">solved</span>
            <span className="ac-feed-what">{it.title}</span>
            <span className="ac-feed-plat">LC</span>
            <span className="ac-feed-time">{it.ago}</span>
          </a>
        ))}
      </div>
    </section>
  );
}

/* ============================== podium ============================== */

function Podium({ rows }) {
  if (!rows.length) return <div className="ac-podium-empty">no activity synced yet — hit sync all</div>;
  const top = rows.slice(0, 3);
  const medals = ["🥇", "🥈", "🥉"];
  const order = [1, 0, 2].filter((i) => top[i]); // visual: 2nd · 1st · 3rd
  return (
    <div className="ac-podium2">
      {order.map((idx) => {
        const row = top[idx];
        return (
          <div key={row.id} className={`ac-pod ac-pod-${idx} ${row.isMe ? "ac-pod-me" : ""}`}>
            <div className="ac-pod-medal">{medals[idx]}</div>
            <div className="ac-pod-name">
              {idx === 0 && <Crown size={13} className="ac-pod-crown" />}
              {row.name}
              {row.isMe && <span className="ac-you-tag">you</span>}
            </div>
            <div className="ac-pod-pts"><CountUp value={row.total} /> <em>pts</em></div>
            <div className="ac-pod-step"><span>{idx + 1}</span></div>
          </div>
        );
      })}
    </div>
  );
}

/* ============================== add friend modal ============================== */

function AddFriendModal({ onClose, onSave }) {
  const [name, setName] = useState("");
  const [cf, setCf] = useState("");
  const [lc, setLc] = useState("");
  const [isMe, setIsMe] = useState(false);
  const [err, setErr] = useState("");
  const firstRef = useRef(null);

  useEffect(() => {
    firstRef.current?.focus();
    function onKey(e) { if (e.key === "Escape") onClose(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function submit(e) {
    e.preventDefault();
    if (!name.trim()) { setErr("give your rival a name"); return; }
    if (!cf.trim() && !lc.trim()) { setErr("add at least one handle — codeforces or leetcode"); return; }
    onSave({ id: uid(), name: name.trim(), cfHandle: cf.trim(), lcUsername: lc.trim(), isMe });
  }

  return (
    <div className="ac-modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <form className="ac-modal" onSubmit={submit}>
        <div className="ac-modal-head">
          <span className="ac-eyebrow">// add rival</span>
          <button type="button" className="ac-icon-btn" onClick={onClose} aria-label="Close"><X size={16} /></button>
        </div>

        <label className="ac-field">
          <span>display name</span>
          <input ref={firstRef} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Priya" />
        </label>

        <label className="ac-field">
          <span>codeforces handle</span>
          <input value={cf} onChange={(e) => setCf(e.target.value)} placeholder="e.g. tourist" />
        </label>

        <label className="ac-field">
          <span>leetcode username</span>
          <input value={lc} onChange={(e) => setLc(e.target.value)} placeholder="e.g. leetcode_user" />
        </label>

        <label className={`ac-me-toggle ${isMe ? "ac-me-toggle-on" : ""}`}>
          <input type="checkbox" checked={isMe} onChange={(e) => setIsMe(e.target.checked)} />
          <User size={14} /> this is me — highlight my rank
        </label>

        {err && <div className="ac-form-err"><AlertTriangle size={14} />{err}</div>}

        <div className="ac-modal-actions">
          <button type="button" className="ac-btn ac-btn-ghost" onClick={onClose}>cancel</button>
          <button type="submit" className="ac-btn ac-btn-primary"><Plus size={15} />add to queue</button>
        </div>
      </form>
    </div>
  );
}

/* ============================== friend card ============================== */

function FriendCard({ friend, stat, onRemove, onRetry, onSetMe, pulsing }) {
  const cf = stat?.cf;
  const lc = stat?.lc;
  const loading = stat?.loading;
  const tier = cfTier(cf?.rating);

  const displayAvatarUrl = cf?.avatar || lc?.avatar || null;
  const ringColor = cf?.ok && cf.rating ? tier.color : (lc?.ok ? "#F5A623" : undefined);

  const streak = useMemo(
    () => computeStreaks(cf?.submissionsByDay, lc?.submissionsByDay),
    [cf, lc]
  );

  const achievements = useMemo(() => {
    const list = [];
    const solvedToday =
      ((cf?.ok ? (cf.submissionsByDay[todayKey()] || 0) : 0) +
        (lc?.ok ? (lc.submissionsByDay[todayKey()] || 0) : 0)) > 0;
    if (streak.longest >= 3) list.push({ icon: "🏅", text: `best ${streak.longest}d` });
    if (solvedToday) list.push({ icon: "⚡", text: "active today" });
    if (lc?.ok && lc.contestRating) list.push({ icon: "🎯", text: `LC ${lc.contestRating}` });
    if (lc?.ok && (lc.hardSolved || 0) >= 25) list.push({ icon: "💪", text: `${lc.hardSolved} hard` });
    if (cf?.ok && cf.rating && cf.rating >= 1900) list.push({ icon: "👑", text: tier.name });
    if (lc?.ok && lc.badgesCount >= 5) list.push({ icon: "🎖️", text: `${lc.badgesCount} badges` });
    return list;
  }, [cf, lc, streak, tier]);

  return (
    <div className={`ac-card ${pulsing ? "ac-card-pulse" : ""} ${friend.isMe ? "ac-card-me" : ""}`}>
      <div className="ac-card-top">
        <Avatar name={friend.name} url={displayAvatarUrl} size={42} ring={ringColor} />
        <div className="ac-card-id">
          <div className="ac-card-name">
            {friend.name}
            {friend.isMe && <span className="ac-you-tag">you</span>}
            <StreakFlame n={streak.current} />
          </div>
          <div className="ac-card-handles">
            {friend.cfHandle && <span>cf:{friend.cfHandle}</span>}
            {friend.cfHandle && friend.lcUsername && <span className="ac-sep">·</span>}
            {friend.lcUsername && <span>lc:{friend.lcUsername}</span>}
          </div>
        </div>
        <button
          className={`ac-icon-btn ac-card-me-btn ${friend.isMe ? "ac-card-me-on" : ""}`}
          onClick={() => onSetMe(friend.id)}
          aria-label={friend.isMe ? "Unset as me" : "Set as me"}
          title={friend.isMe ? "this is you" : "mark as me"}
        >
          <User size={14} />
        </button>
        <button className="ac-icon-btn ac-card-remove" onClick={() => onRemove(friend.id)} aria-label={`Remove ${friend.name}`}>
          <Trash2 size={15} />
        </button>
      </div>

      {loading && !cf && !lc && (
        <div className="ac-card-loading"><Loader2 size={14} className="ac-spin" /> compiling profile…</div>
      )}

      {friend.cfHandle && cf && (
        cf.ok ? (
          <div className="ac-plat-row">
            <span className="ac-plat-tag">CF</span>
            <span className="ac-rating-pill" style={{ color: tier.color, borderColor: tier.color + "55", background: tier.color + "14" }}>
              {cf.rating ?? "unrated"} <span className="ac-tier-name">{tier.name}</span>
            </span>
            <span className="ac-plat-metric">{cf.solvedCount} AC</span>
          </div>
        ) : (
          <div className="ac-plat-error">
            <AlertTriangle size={13} /> CF: {cf.error}
            <button className="ac-retry" onClick={() => onRetry(friend)}>retry</button>
          </div>
        )
      )}

      {friend.lcUsername && lc && (
        lc.ok ? (
          <div className="ac-plat-row">
            <span className="ac-plat-tag ac-plat-tag-lc">LC</span>
            {lc.contestRating && (
              <span className="ac-contest-pill" title={`contest rating · top ${lc.contestTopPercentage ?? "?"}%`}>
                <Zap size={11} /> {lc.contestRating}
              </span>
            )}
            <div className="ac-lc-counts">
              <span style={{ color: "#3DDC84" }}>{lc.easySolved ?? 0}E</span>
              <span style={{ color: "#F5A623" }}>{lc.mediumSolved ?? 0}M</span>
              <span style={{ color: "#FF5D5D" }}>{lc.hardSolved ?? 0}H</span>
            </div>
            <span className="ac-plat-metric">{lc.totalSolved ?? "—"} solved</span>
          </div>
        ) : (
          <div className="ac-plat-error">
            <AlertTriangle size={13} /> LC: {lc.error}
            <button className="ac-retry" onClick={() => onRetry(friend)}>retry</button>
          </div>
        )
      )}

      {lc?.ok && <LcBadges badges={lc.badges} />}

      <AchievementChips items={achievements} />

      {(cf?.ok || lc?.ok) && (
        <div className="ac-card-viz">
          <div className="ac-viz-block">
            <div className="ac-viz-label">activity · last 12wk</div>
            <Heatmap byDayCF={cf?.submissionsByDay} byDayLC={lc?.submissionsByDay} />
          </div>
          <div className="ac-viz-row-2">
            {cf?.ok && cf.ratingHistory.length > 1 && (
              <div className="ac-viz-block ac-viz-grow">
                <div className="ac-viz-label">cf rating</div>
                <RatingSparkline history={cf.ratingHistory} color={tier.color} />
              </div>
            )}
            {lc?.ok && lc.contestHistory.length > 1 && (
              <div className="ac-viz-block ac-viz-grow">
                <div className="ac-viz-label">lc contest</div>
                <RatingSparkline history={lc.contestHistory} color="#F5A623" empty="no lc contests" />
              </div>
            )}
            {lc?.ok && (
              <div className="ac-viz-block">
                <div className="ac-viz-label">lc split</div>
                <DifficultyDonut easy={lc.easySolved} medium={lc.mediumSolved} hard={lc.hardSolved} />
              </div>
            )}
          </div>
        </div>
      )}

      <div className="ac-card-foot">
        {loading ? (
          <span className="ac-syncing"><Loader2 size={12} className="ac-spin" /> syncing…</span>
        ) : (
          <span>synced {timeAgo(stat?.lastUpdated)}</span>
        )}
      </div>
    </div>
  );
}

/* ============================== main app ============================== */

function AppInner() {
  const [hydrated, setHydrated] = useState(false);
  const [friends, setFriends] = useState([]);
  const [stats, setStats] = useState({});
  const [period, setPeriod] = useState("weekly");
  const [showAdd, setShowAdd] = useState(false);
  const [syncingAll, setSyncingAll] = useState(false);
  const [soundOn, setSoundOn] = useState(false);
  const [theme, setTheme] = useState("dark");
  const [goal, setGoal] = useState(DEFAULT_GOAL);
  const [daily, setDaily] = useState(null);
  const [pulseId, setPulseId] = useState(null);

  const friendsRef = useRef([]);
  const lifetimeRef = useRef({});          // id -> last known total solved, for solve-detection pings
  const orderRef = useRef([]);             // current leaderboard order (ids)
  const baselineRanksRef = useRef({});     // id -> rank at last sync start, for rank-change arrows
  const prevTopRef = useRef(undefined);    // previous #1 id, for confetti
  const suppressConfettiRef = useRef(false);
  useEffect(() => { friendsRef.current = friends; }, [friends]);

  /* load persisted data (friends, settings, cached stats) */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await readDeviceStorage(FRIENDS_KEY);
        if (res?.value && !cancelled) setFriends(JSON.parse(res.value));
      } catch (e) { /* nothing saved yet */ }
      try {
        const res = await readDeviceStorage(SETTINGS_KEY);
        if (res?.value && !cancelled) {
          const s = JSON.parse(res.value);
          setSoundOn(s.sound === true);
          if (s.theme === "light" || s.theme === "dark") setTheme(s.theme);
          if (Number.isFinite(s.goal)) setGoal(s.goal);
        }
      } catch (e) { /* defaults are fine */ }
      try {
        const res = await readDeviceStorage(STATS_KEY);
        if (res?.value && !cancelled) {
          const cached = JSON.parse(res.value);
          setStats(cached);
          for (const [id, st] of Object.entries(cached)) {
            lifetimeRef.current[id] =
              (st?.cf?.ok ? st.cf.solvedCount : 0) + (st?.lc?.ok ? (st.lc.totalSolved || 0) : 0);
          }
        }
      } catch (e) { /* no cache yet */ }
      if (!cancelled) setHydrated(true);
    })();
    return () => { cancelled = true; };
  }, []);

  /* persistence via effects (guarded on hydration) */
  useEffect(() => {
    if (!hydrated) return;
    writeDeviceStorage(FRIENDS_KEY, JSON.stringify(friends)).catch(() => {});
  }, [friends, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    writeDeviceStorage(SETTINGS_KEY, JSON.stringify({ sound: soundOn, theme, goal })).catch(() => {});
  }, [soundOn, theme, goal, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    const slim = {};
    for (const [id, st] of Object.entries(stats)) {
      if (!st) continue;
      const { loading, ...rest } = st;
      slim[id] = rest;
    }
    writeDeviceStorage(STATS_KEY, JSON.stringify(slim)).catch(() => {});
  }, [stats, hydrated]);

  /* apply theme to page background (variables live on .ac-root; this covers overscroll) */
  useEffect(() => {
    const bg = THEMES[theme]["--bg-void"];
    document.documentElement.style.background = bg;
    document.body.style.background = bg;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", bg);
  }, [theme]);

  /* fetch today's LeetCode daily challenge once */
  useEffect(() => {
    if (!hydrated) return;
    let cancelled = false;
    fetchDailyChallenge().then((d) => { if (!cancelled && d) setDaily(d); });
    return () => { cancelled = true; };
  }, [hydrated]);

  const refreshFriend = useCallback(async (friend) => {
    setStats((prev) => ({ ...prev, [friend.id]: { ...(prev[friend.id] || {}), loading: true } }));
    const [cf, lc] = await Promise.all([
      fetchCodeforces(friend.cfHandle),
      fetchLeetCode(friend.lcUsername),
    ]);
    const newTotal = (cf?.ok ? cf.solvedCount : 0) + (lc?.ok ? (lc.totalSolved || 0) : 0);
    const prevTotal = lifetimeRef.current[friend.id];
    if (prevTotal !== undefined && newTotal > prevTotal) {
      setPulseId(friend.id);
      setTimeout(() => setPulseId((p) => (p === friend.id ? null : p)), 3000);
      if (soundOn) playBeep();
    }
    lifetimeRef.current[friend.id] = newTotal;
    setStats((prev) => ({ ...prev, [friend.id]: { cf, lc, loading: false, lastUpdated: Date.now() } }));
  }, [soundOn]);

  const refreshAll = useCallback(async () => {
    baselineRanksRef.current = Object.fromEntries((orderRef.current || []).map((id, i) => [id, i]));
    setSyncingAll(true);
    for (const f of friendsRef.current) {
      await refreshFriend(f);
      await sleep(220);
    }
    setSyncingAll(false);
  }, [refreshFriend]);

  useEffect(() => {
    if (hydrated && friendsRef.current.length) refreshAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated]);

  /* changing the period invalidates rank deltas and shouldn't trigger confetti */
  useEffect(() => {
    suppressConfettiRef.current = true;
    baselineRanksRef.current = {};
  }, [period]);

  function addFriend(f) {
    const next = [...friends.map((x) => (f.isMe ? { ...x, isMe: false } : x)), f];
    setFriends(next);
    setShowAdd(false);
    refreshFriend(f);
  }

  function removeFriend(id) {
    setFriends((prev) => prev.filter((f) => f.id !== id));
    setStats((prev) => { const c = { ...prev }; delete c[id]; return c; });
  }

  function setMe(id) {
    setFriends((prev) => prev.map((f) => ({ ...f, isMe: f.id === id ? !f.isMe : false })));
  }

  function toggleSound() { setSoundOn((v) => !v); }
  function toggleTheme() { setTheme((t) => (t === "dark" ? "light" : "dark")); }

  const periodDays = PERIODS.find((p) => p.id === period).days;

  const leaderboard = useMemo(() => {
    const rows = friends
      .map((f) => {
        const s = stats[f.id];
        const cfCount = s?.cf?.ok ? countInPeriod(s.cf.submissionsByDay, periodDays) : 0;
        const lcCount = s?.lc?.ok ? countInPeriod(s.lc.submissionsByDay, periodDays) : 0;
        return { id: f.id, name: f.name, isMe: !!f.isMe, cfCount, lcCount, total: cfCount + lcCount };
      })
      .sort((a, b) => b.total - a.total);
    const base = baselineRanksRef.current;
    return rows.map((row, i) => ({
      ...row,
      delta: base[row.id] != null ? base[row.id] - i : null,
    }));
  }, [friends, stats, periodDays]);

  useEffect(() => { orderRef.current = leaderboard.map((r) => r.id); }, [leaderboard]);

  /* confetti when a new rival takes #1 */
  useEffect(() => {
    const top = leaderboard[0];
    const id = top?.id ?? null;
    if (prevTopRef.current === undefined) { prevTopRef.current = id; return; }
    if (suppressConfettiRef.current) { suppressConfettiRef.current = false; prevTopRef.current = id; return; }
    if (id && id !== prevTopRef.current && top.total > 0) {
      fireConfetti();
      if (soundOn) playBeep();
    }
    prevTopRef.current = id;
  }, [leaderboard, soundOn]);

  const mostActiveToday = useMemo(() => {
    let best = null;
    for (const f of friends) {
      const s = stats[f.id];
      const cfT = s?.cf?.ok ? (s.cf.submissionsByDay[todayKey()] || 0) : 0;
      const lcT = s?.lc?.ok ? (s.lc.submissionsByDay[todayKey()] || 0) : 0;
      const t = cfT + lcT;
      if (t > 0 && (!best || t > best.total)) best = { name: f.name, total: t };
    }
    return best;
  }, [friends, stats]);

  const feedItems = useMemo(() => {
    const items = [];
    for (const f of friends) {
      const rec = stats[f.id]?.lc?.recentAC;
      if (Array.isArray(rec)) {
        for (const r of rec) {
          if (!r.ts) continue;
          items.push({
            who: f.name, title: r.title, ts: r.ts, ago: agoFromSeconds(r.ts),
            color: avatarColor(f.name),
            link: r.titleSlug ? `https://leetcode.com/problems/${r.titleSlug}/` : "https://leetcode.com",
          });
        }
      }
    }
    items.sort((a, b) => b.ts - a.ts);
    return items.slice(0, 12);
  }, [friends, stats]);

  const me = useMemo(() => friends.find((f) => f.isMe), [friends]);
  const myRow = me ? leaderboard.find((r) => r.id === me.id) : null;
  const myRank = myRow ? leaderboard.findIndex((r) => r.id === me.id) + 1 : null;
  const myWeekly = useMemo(() => {
    if (!me) return 0;
    const s = stats[me.id];
    return (s?.cf?.ok ? countInPeriod(s.cf.submissionsByDay, 7) : 0) +
      (s?.lc?.ok ? countInPeriod(s.lc.submissionsByDay, 7) : 0);
  }, [me, stats]);

  const anyLoaded = Object.keys(stats).length > 0;
  const combinedPts = leaderboard.reduce((a, b) => a + b.total, 0);

  return (
    <div className="ac-root" style={THEMES[theme]}>
      <style>{CSS}</style>

      <header className="ac-header">
        <div className="ac-header-title">
          <div className="ac-window-dots"><span /><span /><span /></div>
          <div>
            <h1>codeChampion</h1>
            <p>// track what your circle is solving on codeforces &amp; leetcode</p>
          </div>
        </div>
        <div className="ac-header-actions">
          <button className="ac-icon-btn" onClick={toggleTheme} aria-label="Toggle theme" title={theme === "dark" ? "switch to light" : "switch to dark"}>
            {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
          </button>
          <button className="ac-icon-btn" onClick={toggleSound} aria-label="Toggle solve pings" title={soundOn ? "solve pings on" : "solve pings off"}>
            {soundOn ? <Bell size={16} /> : <BellOff size={16} />}
          </button>
          <button className="ac-btn ac-btn-ghost" onClick={refreshAll} disabled={syncingAll || !friends.length}>
            <RefreshCw size={14} className={syncingAll ? "ac-spin" : ""} />
            {syncingAll ? "syncing…" : "sync all"}
          </button>
          <button className="ac-btn ac-btn-primary" onClick={() => setShowAdd(true)}>
            <Plus size={15} /> add rival
          </button>
        </div>
      </header>

      <DailyBanner daily={daily} />

      {friends.length > 0 && (
        <div className="ac-stat-strip">
          <div className="ac-stat">
            <CountUp value={friends.length} className="ac-stat-num" />
            <span className="ac-stat-label">rivals tracked</span>
          </div>
          <div className="ac-stat">
            <span className="ac-stat-num">{mostActiveToday ? mostActiveToday.total : "—"}</span>
            <span className="ac-stat-label">{mostActiveToday ? `${mostActiveToday.name} leads today` : "nobody solving yet today"}</span>
          </div>
          <div className="ac-stat">
            <CountUp value={combinedPts} className="ac-stat-num" />
            <span className="ac-stat-label">combined pts this {period === "daily" ? "day" : period === "weekly" ? "week" : "month"}</span>
          </div>
          {me && (
            <div className="ac-stat ac-stat-goal">
              <GoalRing value={myWeekly} goal={goal} />
              <div className="ac-goal-info">
                <span className="ac-stat-num ac-stat-rank">
                  {myRank ? ordinal(myRank) : "—"}
                  {myRow && <RankDelta delta={myRow.delta} />}
                </span>
                <span className="ac-stat-label">you · {myWeekly}/{goal} this week</span>
                <div className="ac-goal-step">
                  <button onClick={() => setGoal((g) => Math.max(1, g - 5))} aria-label="lower goal"><Target size={11} />−5</button>
                  <button onClick={() => setGoal((g) => g + 5)} aria-label="raise goal"><Target size={11} />+5</button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      <section className="ac-panel">
        <div className="ac-panel-head">
          <span className="ac-eyebrow">// ranklist</span>
          <div className="ac-tabs">
            {PERIODS.map((p) => (
              <button
                key={p.id}
                className={`ac-tab ${period === p.id ? "ac-tab-active" : ""}`}
                onClick={() => setPeriod(p.id)}
              >{p.label}</button>
            ))}
          </div>
        </div>

        {friends.length === 0 ? (
          <div className="ac-empty">
            <div className="ac-empty-cursor">queue is empty_</div>
            <p>add a rival's codeforces handle or leetcode username to start the scoreboard.</p>
            <button className="ac-btn ac-btn-primary" onClick={() => setShowAdd(true)}><Plus size={15} /> add your first rival</button>
          </div>
        ) : (
          <>
            <Podium rows={leaderboard} />

            <ResponsiveContainer width="100%" height={Math.max(120, leaderboard.length * 40)}>
              <BarChart data={leaderboard} layout="vertical" margin={{ top: 4, right: 20, bottom: 4, left: 4 }}>
                <XAxis type="number" hide />
                <YAxis
                  type="category" dataKey="name" width={96}
                  tick={{ fill: "#8791A8", fontSize: 12, fontFamily: "var(--font-mono)" }}
                  axisLine={false} tickLine={false}
                />
                <Tooltip content={<LeaderboardTooltip />} cursor={{ fill: "rgba(127,127,127,0.06)" }} />
                <Bar dataKey="cfCount" stackId="a" fill="#4FC3F7" name="Codeforces" radius={[3, 0, 0, 3]} />
                <Bar dataKey="lcCount" stackId="a" fill="#F5A623" name="LeetCode" radius={[0, 3, 3, 0]} />
              </BarChart>
            </ResponsiveContainer>
            <div className="ac-legend">
              <span><i style={{ background: "#4FC3F7" }} /> codeforces · unique accepted problems</span>
              <span><i style={{ background: "#F5A623" }} /> leetcode · submission activity</span>
            </div>
            <ActivityTrend friends={friends} stats={stats} days={periodDays} />
          </>
        )}
      </section>

      <ActivityFeed items={feedItems} />

      {friends.length > 0 && (
        <section className="ac-panel">
          <div className="ac-panel-head">
            <span className="ac-eyebrow">// rivals</span>
          </div>
          <div className="ac-grid">
            {friends.map((f) => {
              const st = stats[f.id];
              const bare = !st || (st.loading && !st.cf && !st.lc);
              return bare ? (
                <SkeletonCard key={f.id} />
              ) : (
                <FriendCard
                  key={f.id}
                  friend={f}
                  stat={st}
                  onRemove={removeFriend}
                  onRetry={refreshFriend}
                  onSetMe={setMe}
                  pulsing={pulseId === f.id}
                />
              );
            })}
          </div>
        </section>
      )}

      {!anyLoaded && friends.length > 0 && (
        <div className="ac-boot-note"><Loader2 size={13} className="ac-spin" /> judging queue — first sync can take a few seconds per rival</div>
      )}

      {showAdd && <AddFriendModal onClose={() => setShowAdd(false)} onSave={addFriend} />}
    </div>
  );
}

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{
          background: "#0A0C10", color: "#E7EAF1", minHeight: "100%",
          fontFamily: "ui-monospace, monospace", padding: 24, lineHeight: 1.6,
        }}>
          <style>{CSS}</style>
          <div className="ac-panel" style={{ maxWidth: 520 }}>
            <span className="ac-eyebrow">// runtime error</span>
            <p style={{ color: "#FF5D5D", marginTop: 10 }}>
              codeChampion hit a snag and stopped: {String(this.state.error?.message || this.state.error)}
            </p>
            <p style={{ color: "#8791A8", fontSize: 13 }}>
              Your saved rivals are untouched — reloading this artifact should recover it.
            </p>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  return (
    <ErrorBoundary>
      <AppInner />
    </ErrorBoundary>
  );
}

/* ============================== styles ============================== */

const CSS = `
:root{
  --bg-void:#0A0C10; --bg-panel:#12151C; --bg-raised:#181C25;
  --border:#242A38; --border-soft:#1C212C;
  --text:#E7EAF1; --text-muted:#8791A8; --text-faint:#5B6274;
  --ac:#3DDC84; --ac-dim:rgba(61,220,132,0.15);
  --warn:#F5A623; --wa:#FF5D5D; --info:#4FC3F7;
  --cell-0:rgba(255,255,255,0.05); --cell-1:rgba(61,220,132,0.35); --cell-2:rgba(61,220,132,0.62); --cell-3:rgba(61,220,132,0.95);
  --glow:radial-gradient(circle at 12% -5%, rgba(61,220,132,0.10), transparent 42%);
  --skel:linear-gradient(90deg, rgba(255,255,255,0.03), rgba(255,255,255,0.08), rgba(255,255,255,0.03));
  --font-mono:'JetBrains Mono','IBM Plex Mono',ui-monospace,'SF Mono',Menlo,Consolas,monospace;
  --font-sans:'Inter',ui-sans-serif,system-ui,-apple-system,sans-serif;
  --radius:10px;
}
html,body,#root{ min-height:100%; margin:0; background:var(--bg-void); }
html,body{ min-height:100vh; }
*{box-sizing:border-box;}
.ac-root{
  background:var(--bg-void); color:var(--text); font-family:var(--font-sans);
  min-height:100vh; width:100%; padding:20px; display:flex; flex-direction:column; gap:18px;
  background-image:var(--glow); background-attachment:fixed;
  transition:background-color .3s ease;
}
.ac-root :focus-visible{ outline:2px solid var(--ac); outline-offset:2px; border-radius:4px; }
.ac-spin{ animation:ac-spin 0.9s linear infinite; }
@keyframes ac-spin{ to{ transform:rotate(360deg); } }
@media (prefers-reduced-motion: reduce){ *{ animation:none !important; transition:none !important; } }

.ac-header{ display:flex; justify-content:space-between; align-items:flex-start; gap:12px; flex-wrap:wrap; }
.ac-header-title{ display:flex; align-items:center; gap:12px; }
.ac-window-dots{ display:flex; gap:5px; }
.ac-window-dots span{ width:8px; height:8px; border-radius:50%; background:var(--border); }
.ac-window-dots span:nth-child(1){ background:#FF5D5D77; }
.ac-window-dots span:nth-child(2){ background:#F5A62377; }
.ac-window-dots span:nth-child(3){ background:#3DDC8477; }
.ac-header-title h1{ font-family:var(--font-mono); font-size:22px; font-weight:800; margin:0; letter-spacing:-0.02em; }
.ac-header-title p{ margin:2px 0 0; font-size:12.5px; color:var(--text-faint); font-family:var(--font-mono); }
.ac-header-actions{ display:flex; align-items:center; gap:8px; flex-wrap:wrap; }

.ac-btn{
  display:inline-flex; align-items:center; gap:6px; font-family:var(--font-mono);
  font-size:13px; font-weight:600; padding:8px 14px; border-radius:8px; border:1px solid transparent;
  cursor:pointer; transition:transform .12s ease, background .15s ease, border-color .15s ease, filter .15s ease;
}
.ac-btn:active{ transform:translateY(1px); }
.ac-btn:disabled{ opacity:.5; cursor:not-allowed; }
.ac-btn-primary{ background:var(--ac); color:#04160D; }
.ac-btn-primary:hover:not(:disabled){ filter:brightness(1.08); }
.ac-btn-ghost{ background:var(--bg-panel); color:var(--text-muted); border-color:var(--border); }
.ac-btn-ghost:hover:not(:disabled){ color:var(--text); border-color:var(--text-faint); }
.ac-icon-btn{
  display:inline-flex; align-items:center; justify-content:center; width:34px; height:34px;
  border-radius:8px; background:var(--bg-panel); border:1px solid var(--border); color:var(--text-muted);
  cursor:pointer; transition:color .15s ease, border-color .15s ease;
}
.ac-icon-btn:hover{ color:var(--text); border-color:var(--text-faint); }

.ac-daily{
  display:flex; align-items:center; gap:10px; text-decoration:none; color:var(--text);
  background:linear-gradient(90deg, var(--ac-dim), transparent 70%), var(--bg-panel);
  border:1px solid var(--border); border-radius:var(--radius); padding:10px 14px; font-size:13px;
  transition:border-color .15s ease, transform .12s ease;
}
.ac-daily:hover{ border-color:var(--ac); transform:translateY(-1px); }
.ac-daily-ico{ display:inline-flex; color:var(--ac); }
.ac-daily-label{ font-family:var(--font-mono); font-size:11px; text-transform:uppercase; letter-spacing:.06em; color:var(--text-faint); }
.ac-daily-title{ font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.ac-daily-diff{ font-family:var(--font-mono); font-size:10.5px; font-weight:700; border:1px solid; padding:2px 7px; border-radius:20px; }
.ac-daily-cta{ margin-left:auto; display:inline-flex; align-items:center; gap:5px; font-family:var(--font-mono); font-size:12px; color:var(--ac); font-weight:700; }

.ac-stat-strip{
  display:flex; gap:1px; background:var(--border); border:1px solid var(--border);
  border-radius:var(--radius); overflow:hidden; flex-wrap:wrap;
}
.ac-stat{ flex:1; min-width:150px; background:var(--bg-panel); padding:12px 16px; display:flex; flex-direction:column; gap:2px; }
.ac-stat-num{ font-family:var(--font-mono); font-size:20px; font-weight:800; color:var(--ac); display:inline-flex; align-items:center; gap:6px; }
.ac-stat-label{ font-size:11.5px; color:var(--text-faint); }
.ac-stat-goal{ flex-direction:row; align-items:center; gap:12px; }
.ac-goal-info{ display:flex; flex-direction:column; gap:2px; }
.ac-stat-rank{ color:var(--text); }
.ac-goalring-txt{ font-family:var(--font-mono); font-size:15px; font-weight:800; fill:var(--text); }
.ac-goal-step{ display:flex; gap:4px; margin-top:3px; }
.ac-goal-step button{
  display:inline-flex; align-items:center; gap:2px; font-family:var(--font-mono); font-size:10px; font-weight:700;
  background:var(--bg-raised); border:1px solid var(--border); color:var(--text-muted);
  border-radius:5px; padding:2px 5px; cursor:pointer;
}
.ac-goal-step button:hover{ color:var(--ac); border-color:var(--ac); }

.ac-panel{ background:var(--bg-panel); border:1px solid var(--border); border-radius:var(--radius); padding:18px; }
.ac-panel-head{ display:flex; justify-content:space-between; align-items:center; margin-bottom:14px; flex-wrap:wrap; gap:10px; }
.ac-eyebrow{ font-family:var(--font-mono); font-size:11.5px; letter-spacing:.08em; color:var(--text-faint); text-transform:uppercase; }

.ac-tabs{ display:flex; gap:2px; background:var(--bg-raised); border:1px solid var(--border); border-radius:8px; padding:3px; }
.ac-tab{
  font-family:var(--font-mono); font-size:11.5px; font-weight:700; letter-spacing:.04em;
  padding:6px 12px; border-radius:6px; background:transparent; border:none; color:var(--text-faint); cursor:pointer;
  transition:color .15s ease, background .15s ease;
}
.ac-tab-active{ background:var(--ac-dim); color:var(--ac); }

.ac-empty{
  border:1px dashed var(--border); border-radius:var(--radius); padding:36px 20px; text-align:center;
  display:flex; flex-direction:column; align-items:center; gap:12px;
}
.ac-empty-cursor{ font-family:var(--font-mono); font-size:16px; color:var(--ac); }
.ac-empty-cursor::after{ content:''; display:inline-block; width:8px; height:15px; background:var(--ac); margin-left:4px; animation:ac-blink 1s step-end infinite; vertical-align:-2px; }
@keyframes ac-blink{ 50%{ opacity:0; } }
.ac-empty p{ margin:0; color:var(--text-muted); font-size:13.5px; max-width:360px; }

/* podium */
.ac-podium2{ display:flex; align-items:flex-end; justify-content:center; gap:12px; margin-bottom:18px; flex-wrap:wrap; }
.ac-pod{
  flex:1; max-width:220px; min-width:130px; background:var(--bg-raised); border:1px solid var(--border);
  border-radius:11px 11px 0 0; padding:14px 12px 0; display:flex; flex-direction:column; align-items:center; gap:4px;
  animation:ac-rise .4s ease both;
}
.ac-pod-medal{ font-size:26px; line-height:1; }
.ac-pod-name{ font-size:13.5px; font-weight:700; display:flex; align-items:center; gap:5px; text-align:center; }
.ac-pod-crown{ color:var(--ac); }
.ac-pod-pts{ font-family:var(--font-mono); font-size:13px; color:var(--text-muted); }
.ac-pod-pts em{ font-style:normal; color:var(--text-faint); }
.ac-pod-step{ width:100%; display:flex; align-items:center; justify-content:center; margin-top:6px; font-family:var(--font-mono); font-weight:800; color:var(--bg-void); }
.ac-pod-0{ order:2; }
.ac-pod-0 .ac-pod-step{ height:64px; background:linear-gradient(180deg, var(--ac), rgba(61,220,132,.55)); }
.ac-pod-0{ border-color:var(--ac); box-shadow:0 0 0 1px var(--ac) inset, 0 -8px 26px -14px var(--ac); }
.ac-pod-1{ order:1; animation-delay:.05s; }
.ac-pod-1 .ac-pod-step{ height:44px; background:linear-gradient(180deg, #9fb0c8, #6b7688); }
.ac-pod-2{ order:3; animation-delay:.1s; }
.ac-pod-2 .ac-pod-step{ height:30px; background:linear-gradient(180deg, #cd9a63, #9c6f3f); }
.ac-pod-step span{ font-size:16px; }
.ac-pod-me{ outline:2px dashed var(--ac); outline-offset:2px; }
@keyframes ac-rise{ from{ opacity:0; transform:translateY(6px); } to{ opacity:1; transform:translateY(0); } }
.ac-podium-empty{ color:var(--text-faint); font-size:13px; font-family:var(--font-mono); padding:10px 0; text-align:center; }

.ac-you-tag{ font-family:var(--font-mono); font-size:9.5px; font-weight:800; text-transform:uppercase; letter-spacing:.05em; color:var(--ac); background:var(--ac-dim); border-radius:4px; padding:1px 5px; }

.ac-delta{ display:inline-flex; align-items:center; gap:1px; font-family:var(--font-mono); font-size:11px; font-weight:700; }
.ac-delta-up{ color:var(--ac); }
.ac-delta-down{ color:var(--wa); }
.ac-delta-0{ color:var(--text-faint); }

.ac-legend{ display:flex; gap:18px; margin-top:10px; flex-wrap:wrap; }
.ac-legend span{ display:inline-flex; align-items:center; gap:6px; font-size:11.5px; color:var(--text-faint); font-family:var(--font-mono); }
.ac-legend i{ width:8px; height:8px; border-radius:2px; display:inline-block; }
.ac-trend{ border-top:1px solid var(--border-soft); margin-top:16px; padding-top:14px; }

.ac-tooltip{ background:var(--bg-raised); border:1px solid var(--border); border-radius:8px; padding:8px 10px; font-family:var(--font-mono); font-size:12px; }
.ac-tooltip-name{ font-weight:700; margin-bottom:4px; }
.ac-tooltip-row{ display:flex; align-items:center; gap:6px; color:var(--text-muted); margin:2px 0; }
.ac-tooltip-total{ margin-top:4px; color:var(--ac); font-weight:700; border-top:1px solid var(--border); padding-top:4px; }
.ac-dot{ width:7px; height:7px; border-radius:50%; display:inline-block; }

/* live feed */
.ac-feed-sub{ font-family:var(--font-mono); font-size:11px; color:var(--text-faint); }
.ac-feed{ display:flex; flex-direction:column; gap:1px; }
.ac-feed-row{
  display:flex; align-items:center; gap:8px; text-decoration:none; color:var(--text);
  padding:8px 8px; border-radius:7px; font-size:13px; transition:background .12s ease;
}
.ac-feed-row:hover{ background:var(--bg-raised); }
.ac-feed-dot{ width:8px; height:8px; border-radius:50%; flex-shrink:0; }
.ac-feed-who{ font-weight:700; }
.ac-feed-verb{ color:var(--text-faint); font-size:12px; }
.ac-feed-what{ color:var(--info); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; flex:1; min-width:0; }
.ac-feed-plat{ font-family:var(--font-mono); font-size:9.5px; font-weight:800; background:var(--warn); color:#241500; padding:1px 5px; border-radius:4px; }
.ac-feed-time{ font-family:var(--font-mono); font-size:11px; color:var(--text-faint); flex-shrink:0; }

.ac-grid{ display:grid; grid-template-columns:repeat(auto-fill, minmax(300px,1fr)); gap:12px; }
.ac-card{
  background:var(--bg-raised); border:1px solid var(--border); border-radius:var(--radius); padding:14px;
  display:flex; flex-direction:column; gap:10px; animation:ac-rise .35s ease both; transition:border-color .3s ease, box-shadow .3s ease;
}
.ac-card-pulse{ border-color:var(--ac); box-shadow:0 0 0 1px var(--ac), 0 0 18px -4px var(--ac); }
.ac-card-me{ border-color:var(--ac); box-shadow:0 0 0 1px var(--ac-dim); }
.ac-card-top{ display:flex; align-items:center; gap:10px; }
.ac-avatar-img{ border-radius:50%; object-fit:cover; flex-shrink:0; border:1px solid var(--border); }
.ac-avatar-fallback{ border-radius:50%; display:flex; align-items:center; justify-content:center; font-family:var(--font-mono); font-weight:800; color:#04160D; flex-shrink:0; }
.ac-card-id{ flex:1; min-width:0; }
.ac-card-name{ font-weight:700; font-size:14.5px; display:flex; align-items:center; gap:6px; white-space:nowrap; overflow:hidden; }
.ac-card-handles{ font-family:var(--font-mono); font-size:11px; color:var(--text-faint); display:flex; gap:5px; }
.ac-sep{ opacity:.5; }
.ac-card-me-btn{ width:28px; height:28px; opacity:.55; }
.ac-card-me-btn:hover{ opacity:1; color:var(--ac); border-color:var(--ac); }
.ac-card-me-on{ opacity:1; color:var(--ac); border-color:var(--ac); background:var(--ac-dim); }
.ac-card-remove{ width:28px; height:28px; opacity:.55; }
.ac-card-remove:hover{ opacity:1; color:var(--wa); border-color:var(--wa); }

.ac-streak{ display:inline-flex; align-items:center; gap:2px; font-family:var(--font-mono); font-size:11px; font-weight:800; color:var(--warn); background:rgba(245,166,35,0.12); border-radius:5px; padding:1px 5px; }
.ac-streak-hot{ color:var(--wa); background:rgba(255,93,93,0.14); }

.ac-card-loading{ display:flex; align-items:center; gap:7px; color:var(--text-faint); font-family:var(--font-mono); font-size:12px; padding:6px 0; }

.ac-plat-row{ display:flex; align-items:center; gap:8px; font-family:var(--font-mono); font-size:12px; }
.ac-plat-tag{ background:var(--info); color:#04141C; font-weight:800; font-size:10px; padding:2px 6px; border-radius:4px; }
.ac-plat-tag-lc{ background:var(--warn); color:#241500; }
.ac-rating-pill{ border:1px solid; padding:2px 8px; border-radius:20px; font-weight:700; }
.ac-tier-name{ font-weight:500; opacity:.85; text-transform:capitalize; }
.ac-contest-pill{ display:inline-flex; align-items:center; gap:3px; border:1px solid rgba(245,166,35,0.4); color:var(--warn); background:rgba(245,166,35,0.1); padding:2px 7px; border-radius:20px; font-weight:700; }
.ac-plat-metric{ margin-left:auto; color:var(--text-muted); }
.ac-lc-counts{ display:flex; gap:8px; font-weight:700; }

.ac-lc-badges{ display:flex; gap:5px; align-items:center; flex-wrap:wrap; }
.ac-lc-badge{ width:22px; height:22px; object-fit:contain; border-radius:5px; }

.ac-ach{ display:flex; gap:6px; flex-wrap:wrap; }
.ac-ach-chip{ display:inline-flex; align-items:center; gap:4px; font-family:var(--font-mono); font-size:10.5px; font-weight:600; color:var(--text-muted); background:var(--bg-panel); border:1px solid var(--border); border-radius:20px; padding:2px 8px; }
.ac-ach-ico{ font-size:11px; }

.ac-plat-error{ display:flex; align-items:center; gap:6px; font-size:12px; color:var(--wa); background:rgba(255,93,93,0.08); border:1px solid rgba(255,93,93,0.25); border-radius:7px; padding:6px 9px; }
.ac-retry{ margin-left:auto; background:none; border:1px solid rgba(255,93,93,0.4); color:var(--wa); font-family:var(--font-mono); font-size:11px; padding:2px 8px; border-radius:5px; cursor:pointer; }
.ac-retry:hover{ background:rgba(255,93,93,0.15); }

.ac-card-viz{ display:flex; flex-direction:column; gap:8px; padding-top:2px; border-top:1px solid var(--border-soft); }
.ac-viz-label{ font-family:var(--font-mono); font-size:10px; color:var(--text-faint); text-transform:uppercase; letter-spacing:.06em; margin-bottom:4px; }
.ac-heatmap{ display:grid; grid-auto-flow:column; grid-auto-columns:9px; gap:2.5px; }
.ac-heatmap-cell{ width:9px; height:9px; border-radius:2px; }
.ac-viz-row-2{ display:flex; gap:14px; align-items:flex-end; }
.ac-viz-block{ min-width:0; }
.ac-viz-grow{ flex:1; }
.ac-sparkline-empty{ font-size:11px; color:var(--text-faint); font-family:var(--font-mono); padding:12px 0; }
.ac-donut-empty{ color:var(--text-faint); font-family:var(--font-mono); font-size:12px; width:56px; height:56px; display:flex; align-items:center; justify-content:center; }

.ac-card-foot{ font-family:var(--font-mono); font-size:10.5px; color:var(--text-faint); border-top:1px solid var(--border-soft); padding-top:8px; }
.ac-syncing{ display:inline-flex; align-items:center; gap:5px; color:var(--info); }

.ac-boot-note{ display:flex; align-items:center; gap:8px; color:var(--text-faint); font-family:var(--font-mono); font-size:12px; justify-content:center; padding:6px; }

/* skeletons */
.ac-skel{ background:var(--skel); background-size:200% 100%; animation:ac-shimmer 1.3s linear infinite; border-radius:6px; }
@keyframes ac-shimmer{ to{ background-position:-200% 0; } }
.ac-skel-card{ pointer-events:none; }
.ac-skel-avatar{ width:42px; height:42px; border-radius:50%; }
.ac-skel-line{ height:11px; }
.ac-skel-block{ height:60px; border-radius:8px; }

/* confetti */
.ac-confetti{ position:fixed; inset:0; pointer-events:none; z-index:80; overflow:hidden; }
.ac-confetti i{ position:absolute; top:-16px; border-radius:1px; opacity:.95; animation-name:ac-confetti-fall; animation-timing-function:cubic-bezier(.25,.6,.55,1); animation-fill-mode:forwards; }
@keyframes ac-confetti-fall{ to{ transform:translateY(106vh) translateX(var(--drift)) rotate(720deg); opacity:.85; } }

.ac-modal-backdrop{
  position:fixed; inset:0; background:rgba(5,6,9,0.7); backdrop-filter:blur(3px);
  display:flex; align-items:center; justify-content:center; padding:16px; z-index:50;
  animation:ac-fade .15s ease both;
}
@keyframes ac-fade{ from{ opacity:0; } to{ opacity:1; } }
.ac-modal{
  background:var(--bg-raised); border:1px solid var(--border); border-radius:var(--radius);
  width:100%; max-width:400px; padding:18px; display:flex; flex-direction:column; gap:14px;
  animation:ac-rise .2s ease both;
}
.ac-modal-head{ display:flex; justify-content:space-between; align-items:center; }
.ac-field{ display:flex; flex-direction:column; gap:6px; }
.ac-field span{ font-family:var(--font-mono); font-size:11px; color:var(--text-faint); text-transform:uppercase; letter-spacing:.04em; }
.ac-field input{
  background:var(--bg-void); border:1px solid var(--border); border-radius:7px; padding:9px 11px;
  color:var(--text); font-family:var(--font-sans); font-size:13.5px;
}
.ac-field input:focus{ outline:none; border-color:var(--ac); }
.ac-me-toggle{ display:flex; align-items:center; gap:8px; font-family:var(--font-mono); font-size:12px; color:var(--text-muted); cursor:pointer; border:1px solid var(--border); border-radius:8px; padding:9px 11px; transition:border-color .15s ease, color .15s ease; }
.ac-me-toggle input{ accent-color:var(--ac); width:15px; height:15px; }
.ac-me-toggle-on{ color:var(--ac); border-color:var(--ac); background:var(--ac-dim); }
.ac-form-err{ display:flex; align-items:center; gap:6px; color:var(--wa); font-size:12.5px; }
.ac-modal-actions{ display:flex; justify-content:flex-end; gap:8px; margin-top:4px; }

@media (max-width:640px){
  .ac-root{ padding:14px; }
  .ac-header{ flex-direction:column; }
  .ac-pod{ border-radius:9px; }
  .ac-pod-0, .ac-pod-1, .ac-pod-2{ order:0; }
  .ac-pod-step{ display:none; }
}
`;
