#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Parser oficial da tabela PMG em PDF.

Objetivos:
- Preservar tudo o que já funcionava no parser anterior.
- Ler corretamente produtos cujo nome ocupa várias linhas.
- Priorizar a leitura estrutural da tabela do PDF.
- Usar o parser textual antigo como fallback de segurança.
- Retornar o mesmo formato JSON esperado pelo Next.js.

Uso:
  py scripts/pmg-pdf-parser.py caminho/do/arquivo.pdf
"""

import json
import re
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional, Set, Tuple

try:
    import pdfplumber
except Exception as exc:
    print(json.dumps({
        "success": False,
        "error": (
            "Biblioteca pdfplumber não instalada. "
            "Rode: py -m pip install -r requirements-quotes.txt"
        ),
        "detail": str(exc),
    }, ensure_ascii=False))
    sys.exit(1)


SELL_UNITS = {
    "KG", "CX", "PCT", "UN", "BD", "BARR", "BAG", "LT", "VD", "GL",
    "FD", "FDO", "FR", "PÇ", "PC", "PCA", "BIS", "SC", "PT", "RL",
}

HEADER_RE = re.compile(
    r"^(COD|PRODUTOS|VEND\.?\s*POR|PRE[ÇC]O|TABELA|ENVIE|MAIS DE|PMG|R\$|P[ÁA]GINA)\b",
    re.IGNORECASE,
)

CODE_RE = re.compile(r"^\s*(\d{1,6})(?:\s+|$)(.*)$")

# Compatibilidade com o parser textual anterior.
END_RE = re.compile(
    r"\b([A-ZÇÃÕÁÉÍÓÚ]{1,6})\s+R\$\s*([0-9][0-9\.\s]*,[0-9]{2})\s*$",
    re.IGNORECASE,
)

CODE_ONLY_RE = re.compile(r"^\d{1,6}$")
PRICE_RE = re.compile(
    r"(?:R\$\s*)?([0-9][0-9\.\s]*,[0-9]{2})",
    re.IGNORECASE,
)


def clean_spaces(value: Any) -> str:
    return re.sub(r"\s+", " ", str(value or "").strip())


def parse_price(value: Any) -> float:
    """
    Aceita formatos extraídos pelo pdfplumber como:
    - R$ 14,22
    - R$ 1 35,13
    - R$ 3 10,67
    - 310,67
    """
    raw = clean_spaces(value).upper().replace("R$", "")
    raw = re.sub(r"\s+", "", raw)
    raw = re.sub(r"[^0-9,.-]", "", raw)

    if not raw or "," not in raw:
        raise ValueError(f"Preço inválido: {value!r}")

    return float(raw.replace(".", "").replace(",", "."))


def is_header_or_noise(line: str) -> bool:
    if not line:
        return True

    upper = line.upper().strip()

    if HEADER_RE.search(upper):
        return True

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


def normalize_sell_unit(unit: Any) -> str:
    normalized = clean_spaces(unit).upper()

    aliases = {
        "PC": "PÇ",
        "PCA": "PÇ",
        "PÇ": "PÇ",
        "FDO": "FD",
        "FD": "FD",
    }

    return aliases.get(normalized, normalized)


def normalize_product_name(value: Any) -> str:
    name = clean_spaces(value)
    name = re.sub(
        r"\bVEND\.?\s*POR:?\b",
        "",
        name,
        flags=re.IGNORECASE,
    )
    return clean_spaces(name)


def make_item(
    code: Any,
    name: Any,
    sell_unit: Any,
    price: Any,
    page_number: int,
    raw: Optional[str] = None,
) -> Dict[str, Any]:
    normalized_code = clean_spaces(code)
    normalized_name = normalize_product_name(name)
    normalized_unit = normalize_sell_unit(sell_unit)
    normalized_price = parse_price(price)

    if not CODE_ONLY_RE.fullmatch(normalized_code):
        raise ValueError(f"Código inválido: {code!r}")

    if not normalized_name:
        raise ValueError("Produto sem nome.")

    if not normalized_unit:
        raise ValueError("Produto sem unidade de venda.")

    return {
        "code": normalized_code,
        "name": normalized_name,
        "sellUnit": normalized_unit,
        "price": normalized_price,
        "page": page_number,
        "raw": clean_spaces(
            raw
            or f"{normalized_code} {normalized_name} "
               f"{normalized_unit} R$ {normalized_price:.2f}"
        ),
    }


def parse_table_row(
    row: List[Any],
    page_number: int,
) -> Optional[Dict[str, Any]]:
    """
    O pdfplumber reconhece as linhas da tabela mesmo quando o nome
    aparece visualmente em duas ou mais linhas.

    Exemplo retornado pelo extract_table:
      [
        "5386",
        "BATATA ... SURECRISP EXTRA\\nCROCANTE MCCAIN ...",
        "CX",
        "R$ 3 10,67"
      ]
    """
    cells = [clean_spaces(cell) for cell in (row or [])]

    if len(cells) < 4:
        return None

    code = cells[0]

    if not CODE_ONLY_RE.fullmatch(code):
        return None

    # A tabela oficial possui quatro colunas:
    # código, produto, unidade de venda e preço.
    # Usamos as posições finais para continuar funcionando caso
    # o pdfplumber acrescente uma coluna intermediária.
    name = cells[1]
    sell_unit = cells[-2]
    price_cell = cells[-1]

    if not name or not sell_unit or not price_cell:
        return None

    price_match = PRICE_RE.search(price_cell)

    if not price_match:
        return None

    return make_item(
        code=code,
        name=name,
        sell_unit=sell_unit,
        price=price_match.group(1),
        page_number=page_number,
        raw=" ".join(cells),
    )


def parse_page_tables(
    page: Any,
    page_number: int,
) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    """
    Parser principal.

    Lê a estrutura real da tabela, não a ordem visual das linhas.
    Isso resolve de forma geral qualquer produto com nome grande,
    independentemente de ter 1, 2, 3 ou mais linhas.
    """
    items: List[Dict[str, Any]] = []
    ignored: List[Dict[str, Any]] = []

    try:
        tables = page.extract_tables() or []
    except Exception as exc:
        return [], [{
            "page": page_number,
            "code": None,
            "raw": "",
            "reason": f"Falha ao extrair tabela: {exc}",
        }]

    for table in tables:
        for row in table or []:
            cells = [clean_spaces(cell) for cell in (row or [])]

            # Cabeçalho ou linha vazia.
            if not cells or not any(cells):
                continue

            if cells and clean_spaces(cells[0]).upper() == "COD":
                continue

            try:
                item = parse_table_row(row, page_number)

                if item:
                    items.append(item)
                    continue

                # Só registra como ignorada uma linha que parece produto.
                first = cells[0] if cells else ""
                if CODE_ONLY_RE.fullmatch(first):
                    ignored.append({
                        "page": page_number,
                        "code": first,
                        "raw": clean_spaces(" ".join(cells))[:500],
                        "reason": "Linha da tabela não pôde ser interpretada.",
                    })
            except Exception as exc:
                ignored.append({
                    "page": page_number,
                    "code": cells[0] if cells else None,
                    "raw": clean_spaces(" ".join(cells))[:500],
                    "reason": str(exc),
                })

    return items, ignored


def parse_text_fallback(
    page: Any,
    page_number: int,
) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    """
    Fallback compatível com o parser antigo.

    Ele só é usado para recuperar algum produto que eventualmente
    não tenha sido reconhecido pela estrutura da tabela.
    """
    items: List[Dict[str, Any]] = []
    ignored: List[Dict[str, Any]] = []

    text = page.extract_text(x_tolerance=1, y_tolerance=3) or ""

    current_code: Optional[str] = None
    current_parts: List[str] = []

    def reset() -> None:
        nonlocal current_code, current_parts
        current_code = None
        current_parts = []

    def flush_incomplete(reason: str) -> None:
        nonlocal current_code, current_parts

        raw = clean_spaces(" ".join(current_parts))

        if current_code or raw:
            ignored.append({
                "page": page_number,
                "code": current_code,
                "raw": raw[:500],
                "reason": reason,
            })

        reset()

    for raw_line in text.splitlines():
        line = clean_spaces(raw_line)

        if is_header_or_noise(line):
            continue

        code_match = CODE_RE.match(line)

        if code_match:
            if current_code is not None:
                flush_incomplete(
                    "Novo código encontrado antes de unidade/preço."
                )

            current_code = code_match.group(1)
            current_parts = [clean_spaces(code_match.group(2))]
        elif current_code is not None:
            current_parts.append(line)
        else:
            continue

        joined = clean_spaces(" ".join(current_parts))
        end_match = END_RE.search(joined)

        if not end_match or current_code is None:
            continue

        try:
            item = make_item(
                code=current_code,
                name=END_RE.sub("", joined),
                sell_unit=end_match.group(1),
                price=end_match.group(2),
                page_number=page_number,
                raw=f"{current_code} {joined}",
            )
            items.append(item)
        except Exception as exc:
            ignored.append({
                "page": page_number,
                "code": current_code,
                "raw": joined[:500],
                "reason": str(exc),
            })

        reset()

    if current_code is not None:
        flush_incomplete("Fim da página antes de unidade/preço.")

    return items, ignored


def parse_pdf(pdf_path: str) -> Dict[str, Any]:
    path = Path(pdf_path)

    if not path.exists():
        raise FileNotFoundError(f"PDF não encontrado: {pdf_path}")

    items_by_code: Dict[str, Dict[str, Any]] = {}
    ignored: List[Dict[str, Any]] = []

    table_items_count = 0
    fallback_items_count = 0
    pages_with_table = 0
    pages_using_fallback = 0

    with pdfplumber.open(str(path)) as pdf:
        for page_number, page in enumerate(pdf.pages, start=1):
            table_items, table_ignored = parse_page_tables(
                page,
                page_number,
            )

            ignored.extend(table_ignored)

            if table_items:
                pages_with_table += 1

            for item in table_items:
                code = item["code"]

                # A tabela é a fonte principal. Não sobrescrevemos
                # um item já válido pelo fallback textual.
                if code not in items_by_code:
                    items_by_code[code] = item
                    table_items_count += 1

            # Fallback sempre disponível, mas só acrescenta códigos
            # ainda não encontrados pelo parser estrutural.
            fallback_items, fallback_ignored = parse_text_fallback(
                page,
                page_number,
            )

            recovered_on_page = 0

            for item in fallback_items:
                code = item["code"]

                if code not in items_by_code:
                    items_by_code[code] = item
                    fallback_items_count += 1
                    recovered_on_page += 1

            if recovered_on_page:
                pages_using_fallback += 1

            # Evita poluir o diagnóstico com falhas textuais de itens
            # que já foram recuperados corretamente pela tabela.
            for entry in fallback_ignored:
                code = clean_spaces(entry.get("code"))

                if code and code in items_by_code:
                    continue

                ignored.append(entry)

    items = list(items_by_code.values())

    # Mantém a ordem natural do PDF.
    items.sort(
        key=lambda item: (
            int(item.get("page") or 0),
            int(item.get("code") or 0),
        )
    )

    return {
        "success": True,
        "engine": "python-pdfplumber-pmg-v2-table-safe-fallback",
        "items": items,
        "count": len(items),
        "ignoredCount": len(ignored),
        "ignoredSample": ignored[:30],
        "parserStats": {
            "tableItems": table_items_count,
            "fallbackItems": fallback_items_count,
            "pagesWithTable": pages_with_table,
            "pagesUsingFallback": pages_using_fallback,
        },
    }


def main() -> None:
    if len(sys.argv) < 2:
        print(json.dumps({
            "success": False,
            "error": (
                "Informe o caminho do PDF. "
                "Ex: py scripts/pmg-pdf-parser.py tabela.pdf"
            ),
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
