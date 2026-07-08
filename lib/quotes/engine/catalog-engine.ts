import * as XLSX from "xlsx";
import { normalizeText } from "./normalize";

type ImportCatalogInput = {
  companyId: string;
  fileBuffer: Buffer;
};

type ParsedCatalogProduct = {
  companyId: string;
  code: string;
  descriptionOriginal: string;
  product: string;
  brand?: string;
  category?: string;
  family?: string;
  subtype?: string;
  line?: string;
  flavor?: string;
  package?: string;
  soldBy?: string;
  weight?: number;
  pieceWeight?: number;
  packageWeight?: number;
  boxWeight?: number;
  piecesPerBox?: number;
  packagesPerBox?: number;
  aliases: string[];
  keywords: string[];
  searchText: string;
  active: boolean;
};

type DetectedWeights = {
  weight?: number;
};

type CommercialData = {
  soldBy?: string;
  pieceWeight?: number;
  packageWeight?: number;
  boxWeight?: number;
  piecesPerBox?: number;
  packagesPerBox?: number;
};

type InterpretedDescription = {
  product: string;
  brand?: string;
  category?: string;
  family?: string;
  subtype?: string;
  line?: string;
  flavor?: string;
  package?: string;
  soldBy?: string;
  weight?: number;
  pieceWeight?: number;
  packageWeight?: number;
  boxWeight?: number;
  piecesPerBox?: number;
  packagesPerBox?: number;
  aliases: string[];
  keywords: string[];
  searchText: string;
};

export class CatalogEngine {
  static parseExcel(input: ImportCatalogInput): ParsedCatalogProduct[] {
    const workbook = XLSX.read(input.fileBuffer, { type: "buffer" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, {
      defval: "",
    });

    return rows
      .map((row) => this.parseRow(input.companyId, row))
      .filter(Boolean) as ParsedCatalogProduct[];
  }

  private static parseRow(
    companyId: string,
    row: Record<string, any>
  ): ParsedCatalogProduct | null {
    const code = String(
      row.codigo ||
        row.CODIGO ||
        row.Código ||
        row.COD ||
        row.cod ||
        row.SKU ||
        ""
    ).trim();

    const descriptionOriginal = String(
      row.descricao ||
        row.DESCRICAO ||
        row.Descrição ||
        row.DESCRIÇÃO ||
        row.description ||
        row.PRODUTO ||
        row.Produto ||
        ""
    ).trim();

    if (!code || !descriptionOriginal) return null;

    const parsed = this.interpretDescription(descriptionOriginal);

    return {
      companyId,
      code,
      descriptionOriginal,
      product: parsed.product,
      brand: parsed.brand,
      category: parsed.category,
      family: parsed.family,
      subtype: parsed.subtype,
      line: parsed.line,
      flavor: parsed.flavor,
      package: parsed.package,
      soldBy: parsed.soldBy,
      weight: parsed.weight,
      pieceWeight: parsed.pieceWeight,
      packageWeight: parsed.packageWeight,
      boxWeight: parsed.boxWeight,
      piecesPerBox: parsed.piecesPerBox,
      packagesPerBox: parsed.packagesPerBox,
      aliases: parsed.aliases,
      keywords: parsed.keywords,
      searchText: parsed.searchText,
      active: true,
    };
  }

  private static interpretDescription(description: string): InterpretedDescription {
    const text = normalizeText(description);
    const tokens = text.split(" ").filter(Boolean);

    const product = this.detectProduct(text, tokens);
    const brand = this.detectBrand(text, tokens);
    const category = this.detectCategory(text);
    const family = this.detectFamily(text);
    const subtype = this.detectSubtype(text);
    const line = this.detectLine(text);
    const flavor = this.detectFlavor(text);
    const packageType = this.detectPackage(text);
    const weights = this.detectWeights(text);
    const commercial = this.detectCommercialData(text, product, packageType);

    const aliases = this.buildAliases(product, brand, subtype, line);
    const keywords = this.buildKeywords(
      tokens,
      product,
      brand,
      category,
      family,
      subtype,
      line,
      flavor
    );

    const searchText = normalizeText(
      [
        description,
        product,
        brand,
        category,
        family,
        subtype,
        line,
        flavor,
        packageType,
        ...aliases,
        ...keywords,
      ]
        .filter(Boolean)
        .join(" ")
    );

    return {
      product,
      brand,
      category,
      family,
      subtype,
      line,
      flavor,
      package: packageType,
      ...weights,
      ...commercial,
      aliases,
      keywords,
      searchText,
    };
  }

  private static detectProduct(text: string, tokens: string[]): string {
    const rules: Array<[string, string]> = [
      ["apresuntado", "APRESUNTADO"],
      ["presunto", "PRESUNTO"],
      ["parma", "PARMA"],
      ["mucarela", "MUÇARELA"],
      ["mussarela", "MUÇARELA"],
      ["mozarela", "MUÇARELA"],
      ["requeijao", "REQUEIJÃO"],
      ["farinha", "FARINHA"],
      ["calabresa", "CALABRESA"],
      ["linguica", "LINGUIÇA"],
      ["frango", "FRANGO"],
      ["azeitona", "AZEITONA"],
      ["chocolate", "CHOCOLATE"],
      ["bis", "BIS"],
      ["coca", "COCA COLA"],
      ["cola", "COCA COLA"],
    ];

    for (const [key, value] of rules) {
      if (text.includes(key)) return value;
    }

    return tokens.slice(0, 2).join(" ").toUpperCase();
  }

  private static detectBrand(text: string, tokens: string[]): string | undefined {
    const brands: Array<[string, string]> = [
      ["imperador", "IMPERADOR"],
      ["anaconda", "ANACONDA"],
      ["coronata", "CORONATA"],
      ["scala", "SCALA"],
      ["aurora", "AURORA"],
      ["peperi", "PEPERI"],
      ["tiroles", "TIROLÊS"],
      ["catupiry", "CATUPIRY"],
      ["coca cola", "COCA COLA"],
    ];

    for (const [key, value] of brands) {
      if (text.includes(key)) return value;
    }

    return undefined;
  }

  private static detectCategory(text: string): string | undefined {
    if (text.includes("farinha")) return "MERCEARIA";
    if (text.includes("mucarela") || text.includes("requeijao")) return "LATICÍNIOS";
    if (text.includes("presunto") || text.includes("apresuntado") || text.includes("calabresa")) return "FRIOS";
    if (text.includes("frango")) return "AVES";
    if (text.includes("chocolate") || text.includes("bis")) return "CONFEITARIA";
    if (text.includes("azeitona")) return "CONSERVAS";
    if (text.includes("coca")) return "BEBIDAS";

    return undefined;
  }

  private static detectFamily(text: string): string | undefined {
    if (text.includes("pizza")) return "PIZZA";
    if (text.includes("forneavel")) return "FORNEÁVEL";
    if (text.includes("sem amido")) return "SEM AMIDO";
    if (text.includes("com amido")) return "COM AMIDO";

    return undefined;
  }

  private static detectSubtype(text: string): string | undefined {
    if (text.includes("ralada")) return "RALADA";
    if (text.includes("bufala")) return "BÚFALA";
    if (text.includes("bolinha")) return "BOLINHA";
    if (text.includes("cobertura")) return "COBERTURA";
    if (text.includes("topping")) return "PIZZA TOPPING";
    if (text.includes("cheddar")) return "CHEDDAR";
    if (text.includes("zero")) return "ZERO";
    if (text.includes("diet")) return "DIET";

    return undefined;
  }

  private static detectLine(text: string): string | undefined {
    if (text.includes("premium")) return "PREMIUM";
    if (text.includes("tradicional")) return "TRADICIONAL";
    if (text.includes("pizza")) return "PIZZA";
    return undefined;
  }

  private static detectFlavor(text: string): string | undefined {
    if (text.includes("morango")) return "MORANGO";
    if (text.includes("chocolate")) return "CHOCOLATE";
    if (text.includes("baunilha")) return "BAUNILHA";
    if (text.includes("cheddar")) return "CHEDDAR";
    return undefined;
  }

  private static detectPackage(text: string): string | undefined {
    const packageMatch = text.match(/\b(cx|fdo|fd|pct|bd|barr|barrica)\b/i);
    if (packageMatch) return this.normalizeUnit(packageMatch[1]);

    if (text.includes("balde")) return "BD";
    if (text.includes("caixa")) return "CX";
    if (text.includes("fardo")) return "FD";
    if (text.includes("pacote")) return "PCT";
    if (text.includes("peca")) return "PÇ";
    if (text.includes("copo")) return "COPO";

    return undefined;
  }

  private static detectWeights(text: string): DetectedWeights {
    const kgMatch = text.match(/(\d+[,.]?\d*)\s*kg/);
    const gMatch = text.match(/(\d+[,.]?\d*)\s*g/);
    const lMatch = text.match(/(\d+[,.]?\d*)\s*l/);
    const mlMatch = text.match(/(\d+[,.]?\d*)\s*ml/);

    if (kgMatch) return { weight: Number(kgMatch[1].replace(",", ".")) };
    if (gMatch) return { weight: Number(gMatch[1].replace(",", ".")) / 1000 };
    if (lMatch) return { weight: Number(lMatch[1].replace(",", ".")) };
    if (mlMatch) return { weight: Number(mlMatch[1].replace(",", ".")) / 1000 };

    return {};
  }

  private static detectCommercialData(
    text: string,
    product: string,
    packageType?: string
  ): CommercialData {
    const commercialFromDescription = this.detectPackageComposition(text);

    if (commercialFromDescription) {
      return {
        ...commercialFromDescription,
        soldBy: this.detectSoldByFromComposition(commercialFromDescription, product, packageType),
      };
    }

    if (product === "FARINHA") {
      return {
        soldBy: "FD",
        packageWeight: 25,
      };
    }

    if (product === "MUÇARELA") {
      return {
        soldBy: "PÇ",
        pieceWeight: 4,
        piecesPerBox: 6,
      };
    }

    if (product === "CALABRESA" || product === "LINGUIÇA") {
      return {
        soldBy: "PCT",
        packageWeight: 5,
      };
    }

    if (product === "FRANGO") {
      return {
        soldBy: "CX",
        boxWeight: 20,
      };
    }

    if (product === "BIS" || text.includes(" bis")) {
      return {
        soldBy: "CX",
        piecesPerBox: 8,
      };
    }

    if (product === "AZEITONA" && packageType === "BD") {
      return {
        soldBy: "BD",
      };
    }

    return {
      soldBy: packageType || "UN",
    };
  }

  private static detectPackageComposition(text: string): CommercialData | null {
    const match = text.match(
      /\b(cx|fdo|fd|pct|bd|barr|barrica)\s+(\d+(?:[,.]\d+)?)\s*(bis|pct|pc|pç|un|kg|lt|l|vd|fr|bd|cx)\b/i
    );

    if (!match) return null;

    const container = this.normalizeUnit(match[1]);
    const quantity = Number(match[2].replace(",", "."));
    const unit = this.normalizeUnit(match[3]);

    if (!quantity || quantity <= 0) return null;

    if (container === "CX" && unit === "PÇ") {
      return { piecesPerBox: quantity };
    }

    if (container === "CX" && unit === "PCT") {
      return { packagesPerBox: quantity };
    }

    if (container === "CX" && unit === "BIS") {
      return { piecesPerBox: quantity };
    }

    if ((container === "FD" || container === "FDO") && unit === "PCT") {
      return { packagesPerBox: quantity };
    }

    if (container === "CX" && unit === "KG") {
      return { boxWeight: quantity };
    }

    return {};
  }

  private static detectSoldByFromComposition(
    commercial: CommercialData,
    product: string,
    packageType?: string
  ): string {
    if (commercial.packagesPerBox) return "PCT";
    if (commercial.piecesPerBox && product === "REQUEIJÃO") return "BIS";
    if (commercial.piecesPerBox) return "PÇ";
    if (commercial.boxWeight) return "KG";

    return packageType || "UN";
  }

  private static normalizeUnit(unit: string): string {
    const normalized = normalizeText(unit).toUpperCase();

    const map: Record<string, string> = {
      FDO: "FD",
      FD: "FD",
      CX: "CX",
      PCT: "PCT",
      PC: "PÇ",
      PÇ: "PÇ",
      PECA: "PÇ",
      BIS: "BIS",
      UN: "UN",
      KG: "KG",
      LT: "LT",
      L: "LT",
      VD: "VD",
      FR: "FR",
      BD: "BD",
      BARR: "BARR",
      BARRICA: "BARR",
    };

    return map[normalized] || normalized;
  }

  private static buildAliases(
    product: string,
    brand?: string,
    subtype?: string,
    line?: string
  ): string[] {
    const aliases = new Set<string>();

    if (product === "MUÇARELA") {
      aliases.add("mussarela");
      aliases.add("mozarela");
      aliases.add("mucarela");
      aliases.add("muçarela");
    }

    if (product === "REQUEIJÃO") {
      aliases.add("requeijao");
      aliases.add("requeijão");
    }

    if (brand === "TIROLÊS") {
      aliases.add("tiroles");
      aliases.add("tirolês");
    }

    if (brand === "PEPERI") {
      aliases.add("peperi");
      aliases.add("pepperi");
    }

    if (brand) aliases.add(brand);
    if (subtype) aliases.add(subtype);
    if (line) aliases.add(line);

    return Array.from(aliases).map(normalizeText);
  }

  private static buildKeywords(...values: any[]): string[] {
    const set = new Set<string>();

    values
      .flat()
      .filter(Boolean)
      .join(" ")
      .split(" ")
      .map(normalizeText)
      .filter(Boolean)
      .forEach((word) => set.add(word));

    return Array.from(set);
  }
}
