from typing import List, Dict

# Phase 2 stub: provide a placeholder render function to be replaced in Phase 3

def render_pdf(title: str, rows: List[Dict]) -> bytes:
    # TODO: implement real PDF rendering in Phase 3
    content = f"PDF Stub - {title} - rows: {len(rows)}\n".encode("utf-8")
    return content
