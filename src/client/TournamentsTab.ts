import { fetchTournaments } from "./Api";

// The Tournaments tab only shows while a tournament takes entries or is being
// played: an empty page is a dead end. Hidden until the list says otherwise.
const HIDDEN_CLASS = "no-tournaments";

/** Whether any tournament is open for entries or running. */
export function hasLiveTournament(tournaments: { status: string }[]): boolean {
  return tournaments.some((t) => t.status === "open" || t.status === "running");
}

export function setTournamentsTabVisible(visible: boolean): void {
  document.documentElement.classList.toggle(HIDDEN_CLASS, !visible);
}

export async function refreshTournamentsTab(): Promise<void> {
  setTournamentsTabVisible(false);
  const list = await fetchTournaments().catch(() => false as const);
  setTournamentsTabVisible(list !== false && hasLiveTournament(list));
}
