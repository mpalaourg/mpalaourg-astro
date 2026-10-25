"""Prepare page-aware text from reviewed public PDFs, without remote inference.

Install scripts/requirements-chat-pdf.txt in a Python 3.11+ virtual environment.
Run from the repository root; optional arguments are allowlisted document URLs.
Model weights download on first use. Documents are processed on this machine.
"""

import argparse
import hashlib
import importlib.metadata
import json
import logging
import os
import re
from pathlib import Path
import pypdfium2 as pdfium
from lib.chat_pdf_review import REVIEW_POLICY, apply_review, review_digest

from docling.datamodel.accelerator_options import AcceleratorOptions
from docling.datamodel.base_models import ConversionStatus, InputFormat
from docling.datamodel.pipeline_options import PdfPipelineOptions
from docling.datamodel.vlm_engine_options import TransformersVlmEngineOptions
from docling.document_converter import DocumentConverter, PdfFormatOption

ROOT = Path(__file__).resolve().parent.parent
DEST = ROOT / "scripts/data/chat-pdf"


def reviewed_markdown(body):
    """Do not expose ambiguous wide, merged-header tables as numeric evidence.

    Docling can over-segment dense academic tables into dozens of columns.
    Preserve the caption and refer to the PDF instead of guessing cell labels.
    """
    blocks = re.compile(r"(?m)^\|[^\n]+\|[ \t]*\n\|[-: |]+\|[ \t]*\n(?:\|[^\n]*\|[ \t]*(?:\n|$))+")
    warnings = []

    def table(match):
        value = match.group(0)
        if len(re.split(r"(?<!\\)\|", value.splitlines()[0])) - 2 <= 20:
            return value
        warnings.append("complex_table")
        return "[Extraction note: a complex table on this page could not be aligned reliably. Consult the original PDF for its exact values.]\n"

    return blocks.sub(table, body).strip(), warnings


def main():
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("urls", nargs="*")
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()
    reviewed = json.loads((ROOT / "src/lib/chat/documents.json").read_text(encoding="utf-8"))
    pdfs = [entry for entry in reviewed if entry["url"].endswith(".pdf")]
    if any(not re.fullmatch(r"/(?:el/)?media/files/[a-z0-9_-]+\.pdf", entry["url"]) for entry in pdfs):
        parser.error("Invalid reviewed PDF path")
    if set(args.urls) - {entry["url"] for entry in pdfs}:
        parser.error("Only PDF URLs from the reviewed document allowlist are accepted")
    options = PdfPipelineOptions()
    options.enable_remote_services = False
    options.allow_external_plugins = False
    options.document_timeout = 1800
    # These documents have embedded text, including Greek. Avoid replacing it
    # with English OCR. Layout, table structure and formula recognition stay on.
    options.do_ocr = False
    options.do_formula_enrichment = True
    # Float32 avoids slow emulated bfloat16 arithmetic on older ARM CPUs.
    # Do not execute custom model-repository code during local inference.
    options.code_formula_options.engine_options = TransformersVlmEngineOptions(
        torch_dtype="float32", load_in_8bit=False, trust_remote_code=False
    )
    options.accelerator_options = AcceleratorOptions(device="cpu", num_threads=4)
    converter = DocumentConverter(allowed_formats=[InputFormat.PDF], format_options={
        InputFormat.PDF: PdfFormatOption(pipeline_options=options)
    })
    DEST.mkdir(parents=True, exist_ok=True)
    for entry in pdfs:
        url = entry["url"]
        if args.urls and url not in args.urls:
            continue
        path = ROOT / "public" / url.lstrip("/")
        digest = hashlib.sha256(path.read_bytes()).hexdigest()
        output = DEST / (path.stem + ".json")
        if output.exists() and not args.force:
            previous = json.loads(output.read_text(encoding="utf-8"))
            if (previous.get("sourceSha256") == digest and previous.get("url") == url
                    and previous.get("version") == importlib.metadata.version("docling")
                    and previous.get("options", {}).get("formulaEnrichment") is True
                    and previous.get("reviewPolicy") == REVIEW_POLICY
                    and previous.get("reviewSha256") == review_digest()):
                print(f"Unchanged: {url}", flush=True)
                continue
        print(f"Extracting locally: {url}", flush=True)
        result = converter.convert(path, raises_on_error=True)
        if result.status != ConversionStatus.SUCCESS:
            raise RuntimeError(f"Incomplete PDF conversion: {url} ({result.status})")
        sections, warnings, blank_pages = [], [], []
        source_pdf = pdfium.PdfDocument(path)
        for page_no in sorted(result.document.pages):
            body, page_warnings = reviewed_markdown(result.document.export_to_markdown(
                page_no=page_no, image_placeholder="", compact_tables=True
            ))
            warnings.extend({"page": page_no, "reason": reason} for reason in page_warnings)
            if not body:
                page = source_pdf[page_no - 1]
                image = page.render(scale=0.5).to_pil().convert("L")
                page.close()
                if image.getextrema() != (255, 255):
                    raise RuntimeError(f"Missing page text: {url} page {page_no}; review before indexing")
                blank_pages.append(page_no)
            sections.append({"label": f"Page {page_no}", "body": body})
        source_pdf.close()
        artifact = {
            "schema": 1, "url": url, "sourceSha256": digest,
            "extractor": "docling", "version": importlib.metadata.version("docling"),
            "options": {"ocr": False, "formulaEnrichment": True, "remoteServices": False},
            "reviewPolicy": 1, "warnings": warnings, "blankPages": blank_pages,
            "pageCount": len(result.document.pages), "sections": sections,
        }
        artifact = apply_review(artifact)
        temporary = output.with_suffix(".json.tmp")
        temporary.write_text(json.dumps(artifact, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        os.replace(temporary, output)
        print(f"Saved {len(sections)} pages: {output.relative_to(ROOT)}", flush=True)


if __name__ == "__main__":
    main()
