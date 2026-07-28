import { NextRequest, NextResponse } from "next/server";

import { requireCompanyAccess } from "@/lib/server-company";
import {
  normalizeQuoteCommercialUnit,
  resolveTypedLinesWithQuoteEngine,
} from "@/lib/products/quote-commercial-engine";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type AnyItem = Record<string, any>;

function toNumber(value: unknown): number {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  let text = String(value || "")
    .trim()
    .replace(/[R$\s]/gi, "");

  if (/^-?\d{1,3}(\.\d{3})+,\d+$/.test(text)) {
    text = text.replace(/\./g, "").replace(",", ".");
  } else if (text.includes(",") && text.includes(".")) {
    text = text.replace(/\./g, "").replace(",", ".");
  } else if (text.includes(",")) {
    text = text.replace(",", ".");
  }

  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeCode(value: unknown): string {
  return String(value || "")
    .replace(/[^0-9A-Za-z]/g, "")
    .toUpperCase();
}

function mirrorProductName(item: AnyItem) {
  return String(
    item?.catalog_name ||
      item?.product_name ||
      item?.official_name ||
      item?.name ||
      "Produto não identificado"
  );
}

function mirrorProductCode(item: AnyItem) {
  return normalizeCode(
    item?.catalog_code ||
      item?.official_code ||
      item?.code
  );
}

function mirrorProductUnit(item: AnyItem) {
  return normalizeQuoteCommercialUnit(
    item?.catalog_match?.sell_unit ||
      item?.sell_unit ||
      item?.unit ||
      item?.catalog_match?.default_sell_unit ||
      ""
  );
}

function formatQuantity(quantity: number, unit: string | null) {
  const formatted = Number.isInteger(quantity)
    ? String(quantity)
    : quantity.toLocaleString("pt-BR", {
        minimumFractionDigits: 0,
        maximumFractionDigits: 3,
      });

  return unit ? `${formatted} ${unit}` : formatted;
}

export async function POST(req: NextRequest) {
  try {
    const access = await requireCompanyAccess(req);
    const body = await req.json();

    const typedOrder = String(body?.typedOrder || "").trim();
    const mirrorItems: AnyItem[] = Array.isArray(body?.extracted?.items)
      ? body.extracted.items
      : [];

    if (!typedOrder) {
      return NextResponse.json(
        { error: "Cole o pedido digitado para fazer a conferência." },
        { status: 400 }
      );
    }

    if (!mirrorItems.length) {
      return NextResponse.json(
        { error: "Leia o espelho com IA antes de comparar." },
        { status: 400 }
      );
    }

    const mirrorCodes = mirrorItems
      .map((item) => mirrorProductCode(item))
      .filter(Boolean);

    const mirrorQuantitiesByCode = Object.fromEntries(
      mirrorItems
        .map((item) => [
          mirrorProductCode(item),
          toNumber(item?.quantity),
        ])
        .filter(([code]) => Boolean(code))
    );

    const typedItems = await resolveTypedLinesWithQuoteEngine({
      companyId: access.companyId,
      rawText: typedOrder,
      mirrorCodes,
      mirrorQuantitiesByCode,
    });

    const mirrorByCode = new Map<string, AnyItem[]>();

    for (const item of mirrorItems) {
      const code = mirrorProductCode(item);
      if (!code) continue;

      const current = mirrorByCode.get(code) || [];
      current.push(item);
      mirrorByCode.set(code, current);
    }

    const usedMirrorItems = new Set<AnyItem>();
    const checklist: AnyItem[] = [];
    const okItems: AnyItem[] = [];
    const quantityDivergences: AnyItem[] = [];
    const missingInMirror: AnyItem[] = [];
    const extraInMirror: AnyItem[] = [];
    const reviewItems: AnyItem[] = [];

    for (const typed of typedItems) {
      if (typed.needsReview || !typed.code) {
        const possibleMirrorCodes = new Set(
          (typed.alternatives || [])
            .map((option: any) => normalizeCode(option?.code))
            .filter(Boolean)
        );

        const possibleMirrorItems = mirrorItems.filter(
          (item) =>
            !usedMirrorItems.has(item) &&
            possibleMirrorCodes.has(mirrorProductCode(item))
        );

        if (possibleMirrorItems.length === 1) {
          usedMirrorItems.add(possibleMirrorItems[0]);
        }

        const row = {
          product: typed.productName,
          productName: typed.productName,
          quantity: formatQuantity(
            typed.inputQuantity,
            typed.inputUnit
          ),
          typedQuantity: formatQuantity(
            typed.inputQuantity,
            typed.inputUnit
          ),
          mirrorQuantity: "-",
          status: "REVIEW",
          message:
            typed.reason ||
            "Produto digitado não foi identificado com segurança.",
          confidence: typed.confidence,
          alternatives: typed.alternatives,
        };

        checklist.push(row);
        reviewItems.push(row);
        continue;
      }

      const candidates = mirrorByCode.get(
        normalizeCode(typed.code)
      ) || [];

      const mirror = candidates.find(
        (item) => !usedMirrorItems.has(item)
      );

      if (!mirror) {
        const row = {
          product: typed.productName,
          productName: typed.productName,
          quantity: formatQuantity(
            typed.inputQuantity,
            typed.inputUnit
          ),
          typedQuantity: formatQuantity(
            typed.inputQuantity,
            typed.inputUnit
          ),
          mirrorQuantity: "-",
          status: "MISSING_IN_MIRROR",
          message:
            "O SKU resolvido pelo motor da cotação não apareceu no espelho.",
          code: typed.code,
        };

        checklist.push(row);
        missingInMirror.push(row);
        continue;
      }

      usedMirrorItems.add(mirror);

      const mirrorQuantity = toNumber(mirror?.quantity);
      const mirrorUnit =
        mirrorProductUnit(mirror) ||
        typed.mirrorUnit ||
        null;

      const convertedQuantity = toNumber(
        typed.convertedQuantity
      );

      const difference =
        Math.round(
          (convertedQuantity - mirrorQuantity) * 1000
        ) / 1000;

      const tolerance =
        mirrorUnit === "KG" ? 0.3 : 0.001;

      const isOk = Math.abs(difference) <= tolerance;

      const row = {
        product: mirrorProductName(mirror),
        productName: mirrorProductName(mirror),
        code: mirrorProductCode(mirror),
        quantity: formatQuantity(
          mirrorQuantity,
          mirrorUnit
        ),
        typedQuantity:
          (typed as any).unitInterpretation ===
          "box_written_as_piece_by_mirror"
            ? `${typed.inputQuantity} CX informadas → interpretadas como ${typed.inputQuantity} PÇ → ${formatQuantity(
                convertedQuantity,
                mirrorUnit
              )}`
            : typed.equivalentText
              ? `${formatQuantity(
                  typed.inputQuantity,
                  typed.inputUnit
                )} → ${formatQuantity(
                  convertedQuantity,
                  mirrorUnit
                )}`
              : formatQuantity(
                  convertedQuantity,
                  mirrorUnit
                ),
        mirrorQuantity: formatQuantity(
          mirrorQuantity,
          mirrorUnit
        ),
        unit: mirrorUnit,
        difference,
        status: isOk ? "OK" : "QUANTITY_DIVERGENT",
        message: isOk
          ? "OK"
          : "Quantidade divergente após aplicar a mesma conversão comercial da cotação.",
        equivalentText: typed.equivalentText,
      };

      checklist.push(row);

      if (isOk) {
        okItems.push(row);
      } else {
        quantityDivergences.push(row);
      }
    }

    for (const mirror of mirrorItems) {
      if (usedMirrorItems.has(mirror)) continue;

      const row = {
        product: mirrorProductName(mirror),
        productName: mirrorProductName(mirror),
        code: mirrorProductCode(mirror),
        quantity: formatQuantity(
          toNumber(mirror?.quantity),
          mirrorProductUnit(mirror)
        ),
        typedQuantity: "-",
        mirrorQuantity: formatQuantity(
          toNumber(mirror?.quantity),
          mirrorProductUnit(mirror)
        ),
        status: "EXTRA_IN_MIRROR",
        message:
          "O produto está no espelho, mas não foi localizado no pedido digitado.",
      };

      checklist.push(row);
      extraInMirror.push(row);
    }

    const checked = typedItems.length;
    const ok = okItems.length;
    const blocking =
      quantityDivergences.length +
      missingInMirror.length +
      extraInMirror.length;
    const warnings = reviewItems.length;

    const status =
      blocking > 0
        ? "bloqueado"
        : warnings > 0
          ? "atencao"
          : "aprovado";

    const score = checked
      ? Math.round((ok / checked) * 100)
      : 0;

    const comparison = {
      engine: "quote-commercial-engine-shared-v1",
      status,
      score,
      summary:
        status === "aprovado"
          ? "Pedido conferido sem divergências."
          : status === "atencao"
            ? "Pedido exige revisão em alguns itens."
            : "Pedido possui divergências que bloqueiam a conferência.",
      recommendation:
        status === "aprovado"
          ? "O pedido pode seguir para a próxima etapa."
          : reviewItems.length > 0
            ? "Revise apenas os itens ambíguos. Os demais foram comparados pelo mesmo motor da cotação."
            : "Corrija os produtos ou quantidades divergentes e confira novamente.",
      totals: {
        checked,
        ok,
        divergences: blocking + warnings,
        blockingDivergences: blocking,
        warnings,
        missing: missingInMirror.length,
        extra: extraInMirror.length,
        review: reviewItems.length,
      },
      checklist,
      okItems,
      quantityDivergences,
      missingInMirror,
      extraInMirror,
      reviewItems,
      typedItems,
      mirrorItems,
    };

    return NextResponse.json({
      ok: true,
      comparison,
    });
  } catch (error: unknown) {
    console.error(
      "[POST /api/crm/orders/compare]",
      error
    );

    const message =
      error instanceof Error
        ? error.message
        : "Erro ao conferir pedido.";

    const status =
      message.includes("não identificado") ||
      message.includes("sem acesso")
        ? 401
        : 500;

    return NextResponse.json(
      { error: message },
      { status }
    );
  }
}
