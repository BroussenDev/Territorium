// Longest name a player may join with. The form enforces the same limit
// (MAX_USERNAME_LENGTH in src/core/validations/username.ts); this copy exists
// because the server must not pull in client modules. Keep the two equal.
// UsernameSchema stays wider so archived records still parse.
export const MAX_JOIN_USERNAME_LENGTH = 20;

export function isJoinUsernameTooLong(username: string): boolean {
  return username.length > MAX_JOIN_USERNAME_LENGTH;
}
