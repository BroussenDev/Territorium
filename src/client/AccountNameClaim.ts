import type { UserMeResponse } from "../core/ApiSchemas";
import { AccountUsernameSchema } from "../core/validations/username";
import { responseHasLinkedIdentity } from "./AccountIdentity";
import { updateUsername } from "./Api";

let attempted = false;

// Territorium accounts start without a username, so clan rosters and
// leaderboards showed the player's public id. The first time a signed-in
// player without one is seen, give the account the name they play under.
// Tried once per page load; renaming afterwards goes through the account
// modal. Resolves true when the account got the name.
export async function claimAccountNameIfMissing(
  userMe: UserMeResponse | false,
  storedName: string | null,
): Promise<boolean> {
  if (attempted || !responseHasLinkedIdentity(userMe)) return false;
  if (userMe === false || userMe.player.username) return false;
  const name = storedName?.trim() ?? "";
  if (!AccountUsernameSchema.safeParse(name).success) return false;
  attempted = true;
  const result = await updateUsername(name);
  return result.ok;
}

export function resetAccountNameClaimForTests(): void {
  attempted = false;
}
