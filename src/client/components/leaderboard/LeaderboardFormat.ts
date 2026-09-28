// "2026-06-27" → "Jun 27". Date-only strings parse as UTC midnight, so
// formatting one straight through toLocaleDateString shifts the day back for
// browsers west of UTC; build the Date from the parts so it stays local.
// Returns null when the API serves something this can't read, letting the
// caller drop the caption rather than render "Invalid Date".
export function formatWindowDate(value: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (match === null) return null;
  const [year, month, day] = [match[1], match[2], match[3]].map(Number);
  const date = new Date(year, month - 1, day);
  // Out-of-range parts roll over silently (month 13 becomes next January), so
  // check the parts survived rather than just that the date is not NaN.
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// The rank badge's colours: crown and medals for the podium.
export function rankStyle(rank: number): { color: string; icon: string } {
  if (rank === 1) {
    return {
      color: "text-yellow-400 bg-yellow-400/10 ring-1 ring-yellow-400/20",
      icon: "👑",
    };
  }
  if (rank === 2) {
    return {
      color: "text-slate-300 bg-slate-400/10 ring-1 ring-slate-400/20",
      icon: "🥈",
    };
  }
  if (rank === 3) {
    return {
      color: "text-amber-600 bg-amber-600/10 ring-1 ring-amber-600/20",
      icon: "🥉",
    };
  }
  return { color: "text-white/40 bg-white/5", icon: String(rank) };
}
