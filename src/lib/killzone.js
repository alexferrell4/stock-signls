// ─── ICT Kill Zones & market sessions ───────────────────────────
// All windows in US-Eastern (New York) time, the reference for ICT concepts.
// A "kill zone" is a high-probability window ICT traders focus on.

const H = (h, m = 0) => h * 60 + m;

export const KILLZONES = [
  { name: "Asian Range", start: H(20), end: H(24), color: "#5AD1C0" },
  { name: "London Open", start: H(2), end: H(5), color: "#4F8EF7" },
  { name: "New York AM", start: H(7), end: H(10), color: "#00D4A0" },
  { name: "London Close", start: H(10), end: H(12), color: "#A78BFA" },
  { name: "New York PM", start: H(13, 30), end: H(16), color: "#F5A623" },
];

// Returns the current session + active kill zone in ET.
export function marketSession(now = new Date()) {
  const et = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
  const day = et.getDay();
  const mins = et.getHours() * 60 + et.getMinutes();
  const weekday = day >= 1 && day <= 5;
  const weekend = !weekday;

  const regularOpen = weekday && mins >= H(9, 30) && mins < H(16);
  const premarket = weekday && mins >= H(4) && mins < H(9, 30);
  const afterHours = weekday && mins >= H(16) && mins < H(20);

  const kz = weekend ? null : KILLZONES.find((z) => mins >= z.start && mins < z.end) ?? null;
  const session = weekend ? "Weekend"
    : regularOpen ? "Regular Hours"
    : premarket ? "Premarket"
    : afterHours ? "After Hours"
    : "Overnight";

  // Minutes until this kill zone ends, or until the next one starts.
  let next = null;
  if (!weekend) {
    if (kz) next = { label: `${kz.name} ends`, mins: kz.end - mins };
    else {
      const upcoming = KILLZONES.map((z) => ({ z, in: (z.start - mins + 1440) % 1440 })).sort((a, b) => a.in - b.in)[0];
      if (upcoming) next = { label: `${upcoming.z.name} in`, mins: upcoming.in };
    }
  }

  return {
    session, regularOpen, premarket, afterHours,
    killzone: kz?.name ?? null, killzoneColor: kz?.color ?? null, inKillzone: !!kz,
    etTime: et.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }),
    minsNow: mins, next,
  };
}

export function fmtMins(m) {
  if (m == null) return "";
  const h = Math.floor(m / 60), mm = m % 60;
  return h > 0 ? `${h}h ${mm}m` : `${mm}m`;
}
