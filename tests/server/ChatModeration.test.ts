import { describe, expect, it } from "vitest";
import {
  calmShouting,
  ChatModerator,
  collapseRuns,
  hasLink,
  isHateSpeech,
  severeChat,
} from "../../src/server/ChatModeration";
import { cid } from "../util/GameServerHarness";

const ALICE = cid("alice");
const BOB = cid("bob");

describe("ChatModerator", () => {
  it("lets ordinary lines through untouched", () => {
    const mod = new ChatModerator();
    for (const [i, line] of [
      "gg well played",
      "con los aliados",
      "spicy strategy",
      "négociation ?",
      "je suis crevé",
      "classic dickens",
      "à pute... non",
    ].entries()) {
      const verdict = mod.moderate(ALICE, line, i * 5_000);
      if (line === "à pute... non") {
        expect(verdict.text).toBe("à ****... non");
      } else {
        expect(verdict).toEqual({ text: line, notice: null });
      }
    }
  });

  it("masks insults, even disguised, and warns their sender", () => {
    const mod = new ChatModerator();
    expect(mod.moderate(ALICE, "t'es un C0NN.A.RD", 0)).toEqual({
      text: "t'es un *********",
      notice: "warned",
    });
    expect(mod.moderate(BOB, "fuuuuck you", 0)).toEqual({
      text: "******* ***",
      notice: "warned",
    });
  });

  it("masks swearing without a strike", () => {
    const mod = new ChatModerator();
    for (let i = 0; i < 5; i++) {
      expect(mod.moderate(ALICE, `putain ${i}`, i * 5_000)).toEqual({
        text: `****** ${i}`,
        notice: null,
      });
    }
  });

  it("blocks hate speech", () => {
    const mod = new ChatModerator();
    expect(mod.moderate(ALICE, "heil", 0)).toEqual({
      text: null,
      notice: "blocked",
    });
    expect(isHateSpeech("heil")).toBe(true);
    expect(isHateSpeech("a nice game")).toBe(false);
  });

  it("mutes after three strikes, longer each time", () => {
    const mod = new ChatModerator();
    mod.moderate(ALICE, "connard", 0);
    mod.moderate(ALICE, "salope", 1_000);
    expect(mod.moderate(ALICE, "abruti", 2_000)).toEqual({
      text: "******",
      notice: "muted",
      seconds: 120,
    });
    expect(mod.moderate(ALICE, "sorry", 62_000)).toEqual({
      text: null,
      notice: "muted",
      seconds: 60,
    });
    expect(mod.moderate(ALICE, "sorry", 122_000).text).toBe("sorry");

    // Hate is two strikes: one more insult earns the second, longer mute.
    expect(mod.moderate(ALICE, "heil", 130_000).notice).toBe("blocked");
    expect(mod.moderate(ALICE, "bitch", 140_000)).toEqual({
      text: "*****",
      notice: "muted",
      seconds: 300,
    });
    // Others are not affected.
    expect(mod.moderate(BOB, "hi", 141_000).text).toBe("hi");
  });

  it("blocks links", () => {
    const mod = new ChatModerator();
    for (const line of [
      "join discord.gg/abc",
      "https://example.org",
      "go to www.site",
      "free-gold.xyz now",
    ]) {
      expect(mod.moderate(ALICE, line, 0)).toEqual({
        text: null,
        notice: "link",
      });
    }
    expect(hasLink("gg. next game")).toBe(false);
    expect(hasLink("1.5 troops")).toBe(false);
  });

  it("blocks a line repeated within 30 seconds", () => {
    const mod = new ChatModerator();
    expect(mod.moderate(ALICE, "help me", 0).text).toBe("help me");
    expect(mod.moderate(ALICE, "HELP  me", 10_000)).toEqual({
      text: null,
      notice: "repeated",
    });
    expect(mod.moderate(BOB, "help me", 10_000).text).toBe("help me");
    expect(mod.moderate(ALICE, "help me", 45_000).text).toBe("help me");
  });

  it("calms shouting and long runs of one character", () => {
    const mod = new ChatModerator();
    expect(mod.moderate(ALICE, "NOOOOOOOOON", 0).text).toBe("NOOOON");
    expect(mod.moderate(ALICE, "ATTACK THE NORTH NOW", 5_000).text).toBe(
      "attack the north now",
    );
    expect(collapseRuns("!!!!!!!! gg")).toBe("!!!! gg");
    expect(calmShouting("GG WP")).toBe("GG WP");
    expect(calmShouting("OK je Viens")).toBe("OK je Viens");
  });

  it("leaves hate aimed at a group and threats to TGS: muted for the game", () => {
    const mod = new ChatModerator();
    for (const line of [
      "NIKE LE NOIRS",
      "sale arabe",
      "mort aux juifs",
      "heil hitler",
      "1488",
    ]) {
      expect(severeChat(line)).toBe("hate");
    }
    for (const line of ["kys", "je vais te tuer", "va crever"]) {
      expect(severeChat(line)).toBe("threat");
    }
    for (const line of [
      "connard",
      "gg wp",
      "les noirs ont gagné",
      "nikel",
      "je suis noir",
      "sale partie des blancs",
    ]) {
      expect(severeChat(line)).toBeNull();
    }
    expect(mod.moderate(ALICE, "nique les arabes", 0)).toEqual({
      text: null,
      notice: "tgs_muted",
      severe: "hate",
    });
    // Muted for the rest of the game, whatever comes next.
    expect(mod.moderate(ALICE, "sorry", 3_600_000)).toEqual({
      text: null,
      notice: "tgs_muted",
    });
    expect(mod.moderate(BOB, "gg", 10).text).toBe("gg");
  });
});

describe("severe chat tier", () => {
  it("catches sexual violence and harassment, in several languages", () => {
    for (const line of [
      "je te viol",
      "je vais te violer",
      "je te viole",
      "je te violeeeee",
      "je t'viole",
      "je T'VIOLE",
      "v i o l",
      "tu vas te faire v1ol3r",
      "je vais te baiser",
      "je vais te b@iser",
      "baise ta mère",
      "suce",
      "suuuce moi",
      "i will rape you",
      "gonna get raped",
      "suck my dick",
      "te voy a violar",
      "ich werde dich vergewaltigen",
      "ti stupro",
      "vou te estuprar",
    ]) {
      expect(severeChat(line), line).toBe("sexual");
    }
  });

  it("catches threats and pushes to suicide", () => {
    for (const line of [
      "je vais te tuer",
      "je te tuerai",
      "crève",
      "CRÈVE !!",
      "creve sale con",
      "k y s",
      "suicide-toi",
      "tue-toi",
      "hang yourself",
      "i hope you die",
      "ti ammazzo",
    ]) {
      expect(severeChat(line), line).toBe("threat");
    }
  });

  it("catches slurs and Nazi references, even disguised", () => {
    for (const line of [
      "n*gre",
      "sale n3gre",
      "bougnoule",
      "sale arabe",
      "dirty arabs",
      "t'es un pd",
      "pdd",
      "nigger",
      "n1gg3r",
      "faggot",
      "nazi",
      "sale nazi",
      "heil hitler",
      "1488",
    ]) {
      expect(severeChat(line), line).toBe("hate");
    }
  });

  it("leaves ordinary words and ordinary insults alone", () => {
    for (const line of [
      "violet",
      "mon violon",
      "c'est violent",
      "il est violent",
      "un baiser",
      "gros baiser",
      "pdf",
      "PD: gg",
      "spicy",
      "je suis crevé",
      "je meurs de faim",
      "tu est nul",
      "ez",
      "fdp",
      "connard",
      "ta gueule",
      "fils de pute",
      "grape",
      "drape",
      "sucette",
      "sucre",
      "rapeseed",
      "a b c",
      "les noirs ont gagné",
      "gg wp",
    ]) {
      expect(severeChat(line), line).toBeNull();
    }
  });

  it("removes a severe line, mutes at once for the game and flags it", () => {
    const mod = new ChatModerator();
    expect(mod.moderate(ALICE, "je vais te baiser", 0)).toEqual({
      text: null,
      notice: "tgs_muted",
      severe: "sexual",
    });
    expect(mod.moderate(ALICE, "pardon", 5_000)).toEqual({
      text: null,
      notice: "tgs_muted",
    });
    expect(mod.moderate(BOB, "gg", 5_000).text).toBe("gg");
  });

  it("keeps the ordinary insult ladder: mask, warn, short mute", () => {
    const mod = new ChatModerator();
    expect(mod.moderate(ALICE, "fdp", 0)).toEqual({
      text: "***",
      notice: "warned",
    });
    expect(mod.moderate(ALICE, "connard", 1_000).severe).toBeUndefined();
    const third = mod.moderate(ALICE, "ta gueule", 2_000);
    expect(third.notice).toBe("muted");
    expect(third.seconds).toBe(120);
    expect(third.severe).toBeUndefined();
  });
});

// One severe line, one ordinary insult (masked, no TGS) and one harmless line
// that looks like a bad word, per language.
const LANGUAGES: Record<
  string,
  { severe: string; kind: string; insult: string; fine: string }
> = {
  ru: {
    severe: "я тебя убью",
    kind: "threat",
    insult: "ты мудак",
    fine: "сукно и привет",
  },
  "ru (Latin lookalikes)": {
    severe: "я тeбя yбью",
    kind: "threat",
    insult: "ты мyдак",
    fine: "привет",
  },
  uk: {
    severe: "здохни",
    kind: "threat",
    insult: "ти падла",
    fine: "нова сукня",
  },
  pl: {
    severe: "zabiję cię",
    kind: "threat",
    insult: "ty dupek",
    fine: "wielki sukces",
  },
  nl: {
    severe: "ik verkracht je",
    kind: "sexual",
    insult: "klootzak",
    fine: "ik ga doodlopen",
  },
  tr: {
    severe: "seni öldüreceğim",
    kind: "threat",
    insult: "pezevenk",
    fine: "bir sikke",
  },
  ar: {
    severe: "سأقتلك",
    kind: "threat",
    insult: "يا ابن الكلب",
    fine: "كلبه الصغير",
  },
  "ar (marks)": {
    severe: "سَأَقْتُلُكَ",
    kind: "threat",
    insult: "ابن الكَلْب",
    fine: "مرحبا",
  },
  "pt-BR": {
    severe: "vou te estuprar",
    kind: "sexual",
    insult: "seu babaca",
    fine: "um viaduto",
  },
  cs: {
    severe: "zabiju tě",
    kind: "threat",
    insult: "ty kokot",
    fine: "kokosový dort",
  },
  ro: {
    severe: "te omor",
    kind: "threat",
    insult: "ești cretin",
    fine: "un pulover",
  },
  sv: {
    severe: "jag ska våldta dig",
    kind: "sexual",
    insult: "din hora",
    fine: "en horisont",
  },
  ja: {
    severe: "お前を殺してやる",
    kind: "threat",
    insult: "このクズ",
    fine: "バカンスに行く",
  },
  zh: {
    severe: "我要杀了你",
    kind: "threat",
    insult: "你这个傻逼",
    fine: "你好，傻瓜",
  },
  ko: {
    severe: "죽여버린다",
    kind: "threat",
    insult: "이 병신아",
    fine: "시발점은 여기",
  },
};

describe("chat moderation in other languages", () => {
  for (const [lang, c] of Object.entries(LANGUAGES)) {
    it(`${lang}: severe, ordinary and harmless lines`, () => {
      expect(severeChat(c.severe)).toBe(c.kind);
      expect(severeChat(c.insult)).toBeNull();
      expect(severeChat(c.fine)).toBeNull();

      const mod = new ChatModerator();
      const insulted = mod.moderate(ALICE, c.insult, 0);
      expect(insulted.notice).toBe("warned");
      expect(insulted.text).toContain("*");
      expect(insulted.severe).toBeUndefined();
      expect(mod.moderate(BOB, c.fine, 0)).toEqual({
        text: c.fine,
        notice: null,
      });
      expect(mod.moderate(BOB, c.severe, 1_000)).toMatchObject({
        text: null,
        notice: "tgs_muted",
        severe: c.kind,
      });
    });
  }

  it("catches slurs in other scripts", () => {
    for (const line of [
      "хайль гитлер",
      "ты пидор",
      "kısa ibne",
      "你是黑鬼",
      "ナチス",
      "나치",
    ]) {
      expect(severeChat(line), line).toBe("hate");
    }
  });
});
