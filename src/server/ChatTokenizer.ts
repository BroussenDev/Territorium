// The chat-toxicity model's tokenizer. It must stay IDENTICAL to the account
// API's one (the weights it ships are keyed by these tokens), so a change here
// without the same change there silently breaks the scores.
// tests/server/ChatTokenizer.test.ts checks it against a fixture produced by
// the API's own functions.

const LEET: Record<string, string> = {
  "0": "o",
  "1": "i",
  "3": "e",
  "4": "a",
  "5": "s",
  "7": "t",
  "@": "a",
  $: "s",
};

/** "V.i.0.l" / "FUUUCK" / "séxe" -> "viol" / "fuuck" / "sexe". */
export function normalize(input: unknown): string {
  const text = String(input ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}+/gu, "");
  const words = text
    .split(/\s+/)
    .filter(Boolean)
    .map((chunk) => {
      // Separators inside a word spelled letter by letter: "v.i.o.l".
      if (/^(?:[a-z0-9@$][.\-_*]+){2,}[a-z0-9@$]?$/.test(chunk)) {
        chunk = chunk.replace(/[.\-_*]+/g, "");
      }
      // Leetspeak only in chunks that hold a letter ("100" stays 100).
      if (/\p{L}/u.test(chunk)) {
        chunk = chunk.replace(/[013457@$]/g, (c) => LEET[c]);
      }
      return chunk;
    });
  return words
    .join(" ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/(.)\1{2,}/gu, "$1$1")
    .trim();
}

/** Word unigrams ("w:"), bigrams ("b:") and character 3-4-grams ("c:"). */
export function tokenize(input: unknown): string[] {
  const words = normalize(input).split(" ").filter(Boolean);
  const out = new Set<string>();
  for (const w of words) {
    out.add(`w:${w}`);
    if (w.length >= 3) {
      const padded = `_${w}_`;
      for (const n of [3, 4]) {
        for (let i = 0; i + n <= padded.length; i++) {
          out.add(`c:${padded.slice(i, i + n)}`);
        }
      }
    }
  }
  for (let i = 0; i + 1 < words.length; i++) {
    out.add(`b:${words[i]} ${words[i + 1]}`);
  }
  return [...out];
}
