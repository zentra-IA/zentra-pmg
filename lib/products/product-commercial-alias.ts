import { normalizeCommercialText } from "./text-normalizer";

export type CommercialAliasRule = {
  aliases: string[];
  requiredAny?: string[][];
  forbidden?: string[];
};

export const PRODUCT_COMMERCIAL_ALIASES: Record<string, CommercialAliasRule> = {
  FARINHA_TRIGO: {
    aliases: [
      "farinha farina",
      "farina",
      "farinha trigo farina",
      "farinha de trigo tipo 1 farina",
    ],
    requiredAny: [["farinha"], ["farina"]],
  },
  CALABRESA_AURORA: {
    aliases: [
      "calabresa aurora",
      "linguica calabresa aurora",
      "calabreza aurora",
    ],
    requiredAny: [["calabresa", "aurora"], ["calabreza", "aurora"]],
    forbidden: ["fatiada", "molho", "tempero"],
  },
  MUCARELA_CLASSICA: {
    aliases: [
      "mussarela classica",
      "mucarela classica",
      "mozarela classica",
      "mussarela 4kg classica",
    ],
    requiredAny: [
      ["mucarela", "classica"],
      ["mussarela", "classica"],
      ["mozarela", "classica"],
    ],
    forbidden: ["fatiada", "ralada", "bolinha", "bufala", "topping", "cobertura"],
  },
  REQUEIJAO_TIROLEZ: {
    aliases: [
      "requeijao tirolez",
      "requeijao tiroles",
      "requela tirolez",
      "requelija tirolez",
      "tirolez sem amido",
    ],
    requiredAny: [["tirolez"], ["tiroles"]],
    forbidden: ["cheddar"],
  },
  CHEDDAR_SCALON: {
    aliases: [
      "cheddar scalon",
      "requeijao cheddar scalon",
      "coro cheddar",
      "scalon coro cheddar",
    ],
    requiredAny: [["cheddar", "scalon"]],
  },
  BACON_BRASA: {
    aliases: ["bacon cubos brasa", "bacon em cubos brasa", "bacon brasa"],
    requiredAny: [["bacon", "brasa"]],
  },
  CHOCOLATE_DOCEIRO: {
    aliases: [
      "chocolate forneavel doceiro",
      "chocolate forneavel",
      "chocolate doceiro",
      "forneavel ao leite doceiro",
    ],
    requiredAny: [["chocolate", "forneavel"], ["chocolate", "doceiro"]],
  },
  FRANGO_PIONEIRO: {
    aliases: [
      "frango pioneiro sem sassami",
      "file de peito pioneiro",
      "file peito sem sassami",
      "frango sem pele sem osso",
      "peito frango pioneiro",
    ],
    requiredAny: [
      ["frango", "pioneiro"],
      ["peito", "pioneiro"],
      ["sem", "sassami", "pioneiro"],
    ],
    forbidden: ["peito de peru"],
  },
  ATUM_88: {
    aliases: [
      "atum 88",
      "atum pouch 88",
      "atum ralado 88 500g",
      "atum 88 500 g",
    ],
    requiredAny: [["atum", "88"]],
  },
  AZEITONA_ARCO_BELLO: {
    aliases: [
      "azeitona arco bello",
      "balde arco bello",
      "arco bello",
      "azeitona verde arco bello",
    ],
    requiredAny: [["arco", "bello"]],
    forbidden: ["ervilha"],
  },
  APRESUNTADO_FRIMESA: {
    aliases: [
      "apresuntado frimesa",
      "frimesa apresuntado",
      "apresuntado peperi frimesa",
    ],
    requiredAny: [["apresuntado", "frimesa"]],
    forbidden: ["perdigao", "presunto"],
  },
};

function hasAll(text: string, tokens: string[]) {
  return tokens.every((token) =>
    text.includes(normalizeCommercialText(token))
  );
}

export function aliasBoost(query: string, target: string): {
  score: number;
  family: string | null;
  reasons: string[];
} {
  const q = normalizeCommercialText(query);
  const t = normalizeCommercialText(target);

  let best = { score: 0, family: null as string | null, reasons: [] as string[] };

  for (const [family, rule] of Object.entries(PRODUCT_COMMERCIAL_ALIASES)) {
    const aliasHit = rule.aliases.some((alias) => {
      const normalizedAlias = normalizeCommercialText(alias);
      return q.includes(normalizedAlias) || normalizedAlias.includes(q);
    });

    const familyHit =
      !rule.requiredAny?.length ||
      rule.requiredAny.some(
        (tokens) => hasAll(q, tokens) && hasAll(t, tokens)
      );

    const forbiddenHit = (rule.forbidden || []).some((token) => {
      const normalized = normalizeCommercialText(token);
      return q.includes(normalized) || t.includes(normalized);
    });

    if (forbiddenHit || !familyHit) continue;

    const score = aliasHit ? 34 : 22;

    if (score > best.score) {
      best = {
        score,
        family,
        reasons: [
          aliasHit
            ? `alias comercial reconhecido: ${family}`
            : `família comercial reconhecida: ${family}`,
        ],
      };
    }
  }

  return best;
}
