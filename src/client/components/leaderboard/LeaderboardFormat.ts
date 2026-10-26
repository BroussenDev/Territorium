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

// The rank badge's colours: gold, silver and bronze for the podium places.
export function rankStyle(rank: number): { color: string; icon: string } {
  if (rank === 1) {
    return {
      color: "text-amber-200 bg-amber-400/15 ring-1 ring-amber-300/50",
      icon: "1",
    };
  }
  if (rank === 2) {
    return {
      color: "text-slate-200 bg-slate-300/10 ring-1 ring-slate-300/40",
      icon: "2",
    };
  }
  if (rank === 3) {
    return {
      color: "text-orange-200 bg-orange-400/10 ring-1 ring-orange-300/40",
      icon: "3",
    };
  }
  return { color: "text-white/40 bg-white/5", icon: String(rank) };
}
