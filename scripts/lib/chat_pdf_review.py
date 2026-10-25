"""Source-bound, reproducible corrections to locally extracted public PDF text."""

import hashlib
import html
import json
import re
from pathlib import Path

REVIEW_PATH = Path(__file__).resolve().parents[1] / "data/chat-pdf-review.json"
REVIEW_POLICY = 2


def review_digest():
    return hashlib.sha256(REVIEW_PATH.read_bytes()).hexdigest()


def normalize_text(body, url):
    # Docling escapes ampersands for Markdown; the search corpus needs text.
    body = html.unescape(body)
    if "resume_" in url:
        # The CV's custom font maps its dash and bullet glyphs incorrectly.
        body = body.replace("Ð", "-")
        body = re.sub(r"(?m)^- ∞ ", "- ", body)
        body = re.sub(r"(?m)^- o ", "  - ", body)
        # Micro-sign in Greek words is a font mapping, not a unit symbol.
        body = re.sub(r"(?<=[Α-ω])µ|µ(?=[Α-ω])", "μ", body)
    return body


def apply_review(artifact):
    manifest = json.loads(REVIEW_PATH.read_text(encoding="utf-8"))
    review = manifest["documents"].get(artifact["url"])
    corrections = []
    if review:
        if review["sourceSha256"] != artifact["sourceSha256"]:
            raise ValueError(f"PDF changed; review its corrections first: {artifact['url']}")
        for edit in review["pages"]:
            page = edit["page"]
            section = artifact["sections"][page - 1]
            if hashlib.sha256(section["body"].encode()).hexdigest() != edit["extractedSha256"]:
                raise ValueError(f"Extraction changed; review {artifact['url']} page {page}")
            section["body"] = edit["body"]
            corrections.append({"page": page, "reason": edit["reason"]})
            artifact["warnings"] = [w for w in artifact["warnings"]
                                    if not (w["page"] == page and w["reason"] in edit.get("resolves", []))]
    for section in artifact["sections"]:
        section["body"] = normalize_text(section["body"], artifact["url"])
    artifact.update(reviewPolicy=REVIEW_POLICY, reviewSha256=review_digest(), corrections=corrections)
    return artifact
