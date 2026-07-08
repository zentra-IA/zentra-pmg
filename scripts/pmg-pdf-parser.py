#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Parser oficial da tabela PMG em PDF.

Objetivo:
- Ler PDFs com produtos quebrados em várias linhas.
- Identificar produtos pelo padrão:
  COD + PRODUTO + VEND. POR + R$ PREÇO
- Retornar JSON limpo para o Next.js.

Uso:
  py scripts/pmg-pdf-parser.py caminho/do/arquivo.pdf
"""

import json
import re
import sys
from pathlib import Path

try:
    import pdfplumber
except Exception as exc:
    print(json.dumps({
        "success": False,
        "error": "Biblioteca pdfplumber não instalada. Rode: py -m pip install -r requirements-quotes.txt",
        "detail": str(exc),
    }, ensure_ascii=False))
    sys.exit(1)


SELL_UNITS = {
    "KG", "CX", "PCT", "UN", "BD", "BARR", "BAG", "LT", "VD", "GL",
    "FD", "FDO", "FR", "PÇ", "PC", "PCA", "BIS", "SC", "PT", "RL"
}

HEADER_RE = re.compile(
    r"^(COD|PRODUTOS|VEND\.?\s*POR|PRE[ÇC]O|TABELA|ENVIE|MAIS DE|PMG|R\$|P[ÁA]GINA)\b",
    re.IGNORECASE,
)

CODE_RE = re.compile(r"^\s*(\d{1,6})(?:\s+|$)(.*)$")

# pdfplumber às vezes extrai "R$ 1 4,46" em vez de "R$ 14,46".
END_RE = re.compile(
    r"\b([A-ZÇÃÕÁÉÍÓÚ]{1,5})\s+R\$\s*([0-9][0-9\.\s]*,[0-9]{2})\s*$",
    re.IGNORECASE,
)


def clean_spaces(value: str) -> str:
    return re.sub(r"\s+", " ", str(value or "").strip())


def parse_price(value: str) -> float:
    raw = re.sub(r"\s+", "", str(value or ""))
    return float(raw.replace(".", "").replace(",", "."))


def is_header_or_noise(line: str) -> bool:
    if not line:
        return True

    upper = line.upper().strip()

    if HEADER_RE.search(upper):
        return True

    # Linhas comuns do topo/capa
    noise_terms = [
        "TABELA DE PRODUTOS",
        "FRETE GRÁTIS",
        "FRETE GRATIS",
        "ENTREGAMOS",
        "VARIEDADE",
        "PROMO",
        "ENVIE SUA LISTA",
        "MAIS DE 1.",
        "MAIS DE 2.",
    ]

    return any(term in upper for term in noise_terms)


def normalize_sell_unit(unit: str) -> str:
    unit = clean_spaces(unit).upper().replace("Ç", "Ç")
    # Corrige OCR comum
    aliases = {
        "PC": "PÇ",
        "PCA": "PÇ",
        "PÇ": "PÇ",
        "FD": "FD",
        "FDO": "FD",
    }
    return aliases.get(unit, unit)


def parse_pdf(pdf_path: str):
    path = Path(pdf_path)
    if not path.exists():
        raise FileNotFoundError(f"PDF não encontrado: {pdf_path}")

    items = []
    ignored = []

    current_code = None
    current_parts = []
    current_page = None

    def flush_incomplete(reason: str):
        nonlocal current_code, current_parts, current_page
        if current_code or current_parts:
            raw = clean_spaces(" ".join(current_parts))
            if raw:
                ignored.append({
                    "page": current_page,
                    "code": current_code,
                    "raw": raw[:500],
                    "reason": reason,
                })
        current_code = None
        current_parts = []
        current_page = None

    with pdfplumber.open(str(path)) as pdf:
        for page_number, page in enumerate(pdf.pages, start=1):
            text = page.extract_text(x_tolerance=1, y_tolerance=3) or ""

            for raw_line in text.splitlines():
                line = clean_spaces(raw_line)

                if is_header_or_noise(line):
                    continue

                code_match = CODE_RE.match(line)

                if code_match:
                    # Se chegou um novo código e o anterior não fechou com unidade/preço,
                    # guardamos debug e iniciamos novo produto.
                    if current_code is not None:
                        flush_incomplete("Novo código encontrado antes de unidade/preço.")

                    current_code = code_match.group(1)
                    current_parts = [clean_spaces(code_match.group(2))]
                    current_page = page_number
                else:
                    if current_code is None:
                        continue
                    current_parts.append(line)

                joined = clean_spaces(" ".join(current_parts))
                end_match = END_RE.search(joined)

                if not end_match:
                    continue

                sell_unit = normalize_sell_unit(end_match.group(1))
                price = parse_price(end_match.group(2))

                product_name = clean_spaces(END_RE.sub("", joined))
                product_name = re.sub(r"\bVEND\.?\s*POR:?\b", "", product_name, flags=re.IGNORECASE)
                product_name = clean_spaces(product_name)

                if not product_name:
                    ignored.append({
                        "page": current_page,
                        "code": current_code,
                        "raw": joined[:500],
                        "reason": "Produto sem nome depois da extração.",
                    })
                    current_code = None
                    current_parts = []
                    current_page = None
                    continue

                if sell_unit not in SELL_UNITS:
                    # Mesmo se a unidade for nova, não quebramos a importação.
                    # Ela pode existir na tabela real e depois entramos no dicionário.
                    pass

                items.append({
                    "code": str(current_code),
                    "name": product_name,
                    "sellUnit": sell_unit,
                    "price": price,
                    "page": current_page,
                    "raw": clean_spaces(f"{current_code} {joined}"),
                })

                current_code = None
                current_parts = []
                current_page = None

    if current_code is not None:
        flush_incomplete("Fim do PDF antes de unidade/preço.")

    return {
        "success": True,
        "engine": "python-pdfplumber-pmg-v1",
        "items": items,
        "count": len(items),
        "ignoredCount": len(ignored),
        "ignoredSample": ignored[:30],
    }


def main():
    if len(sys.argv) < 2:
        print(json.dumps({
            "success": False,
            "error": "Informe o caminho do PDF. Ex: py scripts/pmg-pdf-parser.py tabela.pdf"
        }, ensure_ascii=False))
        sys.exit(1)

    try:
        data = parse_pdf(sys.argv[1])
        print(json.dumps(data, ensure_ascii=False))
    except Exception as exc:
        print(json.dumps({
            "success": False,
            "error": str(exc),
        }, ensure_ascii=False))
        sys.exit(1)


if __name__ == "__main__":
    main()
