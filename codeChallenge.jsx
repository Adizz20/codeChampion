import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer,
} from "recharts";
import { Plus, X, RefreshCw, Trash2, Bell, BellOff, AlertTriangle, Loader2 } from "lucide-react";

/* ============================== constants ============================== */

const CF_API = "https://codeforces.com/api";
const LC_API = "https://alfa-leetcode-api.onrender.com";
const FRIENDS_KEY = "aclog_friends_v1";
const SETTINGS_KEY = "aclog_settings_v1";

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

/* ============================== helpers ============================== */

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

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
  };
  try {
    const [profileR, solvedR, calendarR] = await Promise.allSettled([
      fetchWithTimeout(`${LC_API}/${encodeURIComponent(username)}`, 20000),
      fetchWithTimeout(`${LC_API}/${encodeURIComponent(username)}/solved`, 20000),
      fetchWithTimeout(`${LC_API}/${encodeURIComponent(username)}/calendar`, 20000),
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

    const gotSomething = out.totalSolved != null || out.ranking != null || Object.keys(out.submissionsByDay).length > 0;
    if (!gotSomething) throw new Error("username not found or proxy asleep");
    out.ok = true;
  } catch (e) {
    out.error = e.name === "AbortError" ? "request timed out" : (e.message || "failed to fetch");
  }
  return out;
}

/* ============================== small UI pieces ============================== */

function Avatar({ name, url, size = 40 }) {
  const [broken, setBroken] = useState(false);
  const style = { width: size, height: size, fontSize: size * 0.38 };
  if (url && !broken) {
    return (
      <img
        src={url} alt="" className="ac-avatar-img" style={style}
        onError={() => setBroken(true)}
      />
    );
  }
  return (
    <div className="ac-avatar-fallback" style={{ ...style, background: avatarColor(name) }}>
      {initials(name) || "?"}
    </div>
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
    if (!c) return "rgba(255,255,255,0.05)";
    if (c === 1) return "rgba(61,220,132,0.35)";
    if (c <= 3) return "rgba(61,220,132,0.62)";
    return "rgba(61,220,132,0.95)";
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

function RatingSparkline({ history, color }) {
  if (!history || history.length < 2) {
    return <div className="ac-sparkline-empty">no rated contests yet</div>;
  }
  return (
    <ResponsiveContainer width="100%" height={40}>
      <LineChart data={history} margin={{ top: 4, bottom: 0, left: 0, right: 4 }}>
        <Line type="monotone" dataKey="rating" stroke={color} strokeWidth={2} dot={false} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
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
          <XAxis dataKey="label" tick={{ fill: "#5B6274", fontSize: 10, fontFamily: "var(--font-mono)" }} axisLine={false} tickLine={false} minTickGap={18} />
          <YAxis allowDecimals={false} tick={{ fill: "#5B6274", fontSize: 10, fontFamily: "var(--font-mono)" }} axisLine={false} tickLine={false} width={34} />
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

/* ============================== add friend modal ============================== */

function AddFriendModal({ onClose, onSave }) {
  const [name, setName] = useState("");
  const [cf, setCf] = useState("");
  const [lc, setLc] = useState("");
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
    onSave({ id: uid(), name: name.trim(), cfHandle: cf.trim(), lcUsername: lc.trim() });
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

function FriendCard({ friend, stat, onRemove, onRetry, pulsing }) {
  const cf = stat?.cf;
  const lc = stat?.lc;
  const loading = stat?.loading;
  const tier = cfTier(cf?.rating);

  const displayAvatarUrl = cf?.avatar || lc?.avatar || null;

  return (
    <div className={`ac-card ${pulsing ? "ac-card-pulse" : ""}`}>
      <div className="ac-card-top">
        <Avatar name={friend.name} url={displayAvatarUrl} size={42} />
        <div className="ac-card-id">
          <div className="ac-card-name">{friend.name}</div>
          <div className="ac-card-handles">
            {friend.cfHandle && <span>cf:{friend.cfHandle}</span>}
            {friend.cfHandle && friend.lcUsername && <span className="ac-sep">·</span>}
            {friend.lcUsername && <span>lc:{friend.lcUsername}</span>}
          </div>
        </div>
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
  const [pulseId, setPulseId] = useState(null);

  const friendsRef = useRef([]);
  const lifetimeRef = useRef({}); // id -> last known total solved, for solve-detection pings
  useEffect(() => { friendsRef.current = friends; }, [friends]);

  /* load persisted data */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await readDeviceStorage(FRIENDS_KEY);
        if (res?.value && !cancelled) setFriends(JSON.parse(res.value));
      } catch (e) { /* nothing saved yet */ }
      try {
        const res = await readDeviceStorage(SETTINGS_KEY);
        if (res?.value && !cancelled) setSoundOn(JSON.parse(res.value).sound === true);
      } catch (e) { /* defaults are fine */ }
      if (!cancelled) setHydrated(true);
    })();
    return () => { cancelled = true; };
  }, []);

  async function persistFriends(list) {
    try { await writeDeviceStorage(FRIENDS_KEY, JSON.stringify(list)); }
    catch (e) { /* best-effort */ }
  }
  async function persistSettings(next) {
    try { await writeDeviceStorage(SETTINGS_KEY, JSON.stringify(next)); }
    catch (e) { /* best-effort */ }
  }

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
    setSyncingAll(true);
    for (const f of friendsRef.current) {
      await refreshFriend(f);
      await new Promise((r) => setTimeout(r, 220));
    }
    setSyncingAll(false);
  }, [refreshFriend]);

  useEffect(() => {
    if (hydrated && friendsRef.current.length) refreshAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated]);

  function addFriend(f) {
    const next = [...friends, f];
    setFriends(next);
    persistFriends(next);
    setShowAdd(false);
    refreshFriend(f);
  }

  function removeFriend(id) {
    const next = friends.filter((f) => f.id !== id);
    setFriends(next);
    persistFriends(next);
    setStats((prev) => { const c = { ...prev }; delete c[id]; return c; });
  }

  function toggleSound() {
    const next = !soundOn;
    setSoundOn(next);
    persistSettings({ sound: next });
  }

  const periodDays = PERIODS.find((p) => p.id === period).days;

  const leaderboard = useMemo(() => {
    return friends
      .map((f) => {
        const s = stats[f.id];
        const cfCount = s?.cf?.ok ? countInPeriod(s.cf.submissionsByDay, periodDays) : 0;
        const lcCount = s?.lc?.ok ? countInPeriod(s.lc.submissionsByDay, periodDays) : 0;
        return { id: f.id, name: f.name, cfCount, lcCount, total: cfCount + lcCount };
      })
      .sort((a, b) => b.total - a.total);
  }, [friends, stats, periodDays]);

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

  const anyLoaded = Object.keys(stats).length > 0;

  return (
    <div className="ac-root">
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

      {friends.length > 0 && (
        <div className="ac-stat-strip">
          <div className="ac-stat"><span className="ac-stat-num">{friends.length}</span><span className="ac-stat-label">rivals tracked</span></div>
          <div className="ac-stat">
            <span className="ac-stat-num">{mostActiveToday ? mostActiveToday.total : "—"}</span>
            <span className="ac-stat-label">{mostActiveToday ? `${mostActiveToday.name} leads today` : "nobody solving yet today"}</span>
          </div>
          <div className="ac-stat">
            <span className="ac-stat-num">{leaderboard.reduce((a, b) => a + b.total, 0)}</span>
            <span className="ac-stat-label">combined pts this {period === "daily" ? "day" : period === "weekly" ? "week" : "month"}</span>
          </div>
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
            <div className="ac-podium">
              {leaderboard.slice(0, 3).map((row, i) => (
                <div key={row.id} className={`ac-podium-card ac-podium-${i}`}>
                  <span className="ac-podium-rank">{String(i + 1).padStart(2, "0")}</span>
                  <span className="ac-podium-name">{row.name}</span>
                  <span className="ac-podium-total">{row.total} <em>pts</em></span>
                </div>
              ))}
              {leaderboard.length === 0 && <div className="ac-podium-empty">no activity synced yet — hit sync all</div>}
            </div>

            <ResponsiveContainer width="100%" height={Math.max(120, leaderboard.length * 40)}>
              <BarChart data={leaderboard} layout="vertical" margin={{ top: 4, right: 20, bottom: 4, left: 4 }}>
                <XAxis type="number" hide />
                <YAxis
                  type="category" dataKey="name" width={96}
                  tick={{ fill: "#8791A8", fontSize: 12, fontFamily: "var(--font-mono)" }}
                  axisLine={false} tickLine={false}
                />
                <Tooltip content={<LeaderboardTooltip />} cursor={{ fill: "rgba(255,255,255,0.035)" }} />
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

      {friends.length > 0 && (
        <section className="ac-panel">
          <div className="ac-panel-head">
            <span className="ac-eyebrow">// rivals</span>
          </div>
          <div className="ac-grid">
            {friends.map((f) => (
              <FriendCard
                key={f.id}
                friend={f}
                stat={stats[f.id]}
                onRemove={removeFriend}
                onRetry={refreshFriend}
                pulsing={pulseId === f.id}
              />
            ))}
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
  --font-mono:'JetBrains Mono','IBM Plex Mono',ui-monospace,'SF Mono',Menlo,Consolas,monospace;
  --font-sans:'Inter',ui-sans-serif,system-ui,-apple-system,sans-serif;
  --radius:10px;
}
*{box-sizing:border-box;}
.ac-root{
  background:var(--bg-void); color:var(--text); font-family:var(--font-sans);
  min-height:100%; padding:20px; display:flex; flex-direction:column; gap:18px;
  background-image:radial-gradient(circle at 10% 0%, rgba(61,220,132,0.05), transparent 40%);
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
  cursor:pointer; transition:transform .12s ease, background .15s ease, border-color .15s ease;
}
.ac-btn:active{ transform:translateY(1px); }
.ac-btn:disabled{ opacity:.5; cursor:not-allowed; }
.ac-btn-primary{ background:var(--ac); color:#04160D; }
.ac-btn-primary:hover:not(:disabled){ background:#5CE89C; }
.ac-btn-ghost{ background:var(--bg-panel); color:var(--text-muted); border-color:var(--border); }
.ac-btn-ghost:hover:not(:disabled){ color:var(--text); border-color:var(--text-faint); }
.ac-icon-btn{
  display:inline-flex; align-items:center; justify-content:center; width:34px; height:34px;
  border-radius:8px; background:var(--bg-panel); border:1px solid var(--border); color:var(--text-muted);
  cursor:pointer; transition:color .15s ease, border-color .15s ease;
}
.ac-icon-btn:hover{ color:var(--text); border-color:var(--text-faint); }

.ac-stat-strip{
  display:flex; gap:1px; background:var(--border); border:1px solid var(--border);
  border-radius:var(--radius); overflow:hidden;
}
.ac-stat{ flex:1; background:var(--bg-panel); padding:12px 16px; display:flex; flex-direction:column; gap:2px; }
.ac-stat-num{ font-family:var(--font-mono); font-size:20px; font-weight:800; color:var(--ac); }
.ac-stat-label{ font-size:11.5px; color:var(--text-faint); }

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

.ac-podium{ display:grid; grid-template-columns:repeat(auto-fit, minmax(160px,1fr)); gap:10px; margin-bottom:16px; }
.ac-podium-card{
  background:var(--bg-raised); border:1px solid var(--border); border-radius:9px; padding:12px 14px;
  display:flex; flex-direction:column; gap:4px; animation:ac-rise .4s ease both;
}
.ac-podium-0{ border-color:var(--ac); box-shadow:0 0 0 1px var(--ac) inset; }
.ac-podium-1{ animation-delay:.05s; }
.ac-podium-2{ animation-delay:.1s; }
@keyframes ac-rise{ from{ opacity:0; transform:translateY(6px); } to{ opacity:1; transform:translateY(0); } }
.ac-podium-rank{ font-family:var(--font-mono); font-size:22px; font-weight:800; color:var(--text-faint); }
.ac-podium-0 .ac-podium-rank{ color:var(--ac); }
.ac-podium-name{ font-size:13.5px; font-weight:600; }
.ac-podium-total{ font-family:var(--font-mono); font-size:13px; color:var(--text-muted); }
.ac-podium-total em{ font-style:normal; color:var(--text-faint); }
.ac-podium-empty{ grid-column:1/-1; color:var(--text-faint); font-size:13px; font-family:var(--font-mono); padding:10px 0; }

.ac-legend{ display:flex; gap:18px; margin-top:10px; flex-wrap:wrap; }
.ac-legend span{ display:inline-flex; align-items:center; gap:6px; font-size:11.5px; color:var(--text-faint); font-family:var(--font-mono); }
.ac-legend i{ width:8px; height:8px; border-radius:2px; display:inline-block; }
.ac-trend{ border-top:1px solid var(--border-soft); margin-top:16px; padding-top:14px; }

.ac-tooltip{ background:var(--bg-raised); border:1px solid var(--border); border-radius:8px; padding:8px 10px; font-family:var(--font-mono); font-size:12px; }
.ac-tooltip-name{ font-weight:700; margin-bottom:4px; }
.ac-tooltip-row{ display:flex; align-items:center; gap:6px; color:var(--text-muted); margin:2px 0; }
.ac-tooltip-total{ margin-top:4px; color:var(--ac); font-weight:700; border-top:1px solid var(--border); padding-top:4px; }
.ac-dot{ width:7px; height:7px; border-radius:50%; display:inline-block; }

.ac-grid{ display:grid; grid-template-columns:repeat(auto-fill, minmax(300px,1fr)); gap:12px; }
.ac-card{
  background:var(--bg-raised); border:1px solid var(--border); border-radius:var(--radius); padding:14px;
  display:flex; flex-direction:column; gap:10px; animation:ac-rise .35s ease both; transition:border-color .3s ease, box-shadow .3s ease;
}
.ac-card-pulse{ border-color:var(--ac); box-shadow:0 0 0 1px var(--ac), 0 0 18px -4px var(--ac); }
.ac-card-top{ display:flex; align-items:center; gap:10px; }
.ac-avatar-img{ border-radius:50%; object-fit:cover; flex-shrink:0; border:1px solid var(--border); }
.ac-avatar-fallback{ border-radius:50%; display:flex; align-items:center; justify-content:center; font-family:var(--font-mono); font-weight:800; color:#04160D; flex-shrink:0; }
.ac-card-id{ flex:1; min-width:0; }
.ac-card-name{ font-weight:700; font-size:14.5px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.ac-card-handles{ font-family:var(--font-mono); font-size:11px; color:var(--text-faint); display:flex; gap:5px; }
.ac-sep{ opacity:.5; }
.ac-card-remove{ width:28px; height:28px; opacity:.55; }
.ac-card-remove:hover{ opacity:1; color:var(--wa); border-color:var(--wa); }

.ac-card-loading{ display:flex; align-items:center; gap:7px; color:var(--text-faint); font-family:var(--font-mono); font-size:12px; padding:6px 0; }

.ac-plat-row{ display:flex; align-items:center; gap:8px; font-family:var(--font-mono); font-size:12px; }
.ac-plat-tag{ background:var(--info); color:#04141C; font-weight:800; font-size:10px; padding:2px 6px; border-radius:4px; }
.ac-plat-tag-lc{ background:var(--warn); color:#241500; }
.ac-rating-pill{ border:1px solid; padding:2px 8px; border-radius:20px; font-weight:700; }
.ac-tier-name{ font-weight:500; opacity:.85; text-transform:capitalize; }
.ac-plat-metric{ margin-left:auto; color:var(--text-muted); }
.ac-lc-counts{ display:flex; gap:8px; font-weight:700; }

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
.ac-form-err{ display:flex; align-items:center; gap:6px; color:var(--wa); font-size:12.5px; }
.ac-modal-actions{ display:flex; justify-content:flex-end; gap:8px; margin-top:4px; }

@media (max-width:640px){
  .ac-root{ padding:14px; }
  .ac-header{ flex-direction:column; }
  .ac-podium{ grid-template-columns:1fr; }
}
`;
