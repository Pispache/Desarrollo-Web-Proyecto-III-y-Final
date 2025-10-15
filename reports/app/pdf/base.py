import os
import httpx
from typing import List, Dict, Optional

PDF_RENDERER_URL = os.getenv("PDF_RENDERER_URL", "http://pdf-renderer:3000")

async def render_html_to_pdf(html: str, options: Optional[Dict] = None) -> bytes:
    """
    Envía HTML al servicio pdf-renderer y retorna el PDF generado.
    
    Args:
        html: Contenido HTML a convertir
        options: Opciones de renderizado (format, margin, landscape)
    
    Returns:
        bytes: Contenido del PDF
    
    Raises:
        Exception: Si falla la generación del PDF
    """
    if options is None:
        options = {}
    
    payload = {
        "html": html,
        "options": options
    }
    
    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.post(
            f"{PDF_RENDERER_URL}/render",
            json=payload
        )
        
        if response.status_code != 200:
            error_detail = response.text
            raise Exception(f"PDF generation failed: {error_detail}")
        
        return response.content
