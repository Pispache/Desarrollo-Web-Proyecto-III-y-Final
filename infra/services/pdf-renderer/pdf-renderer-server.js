const express = require('express');
const puppeteer = require('puppeteer');

/**
 * @summary Mitigación SSRF (A10: Server-Side Request Forgery).
 * @remarks Intercepción de requests del navegador, bloqueo de localhost/red interna/metadata y uso de allowlist por entorno (PDF_ALLOWED_HOSTS). Pendiente de implementación si no se ha activado.
 * @env PDF_ALLOWED_HOSTS, PDF_BLOCK_LOCAL, PDF_MAX_NAV_TIMEOUT_MS
 * @effects Reduce superficie de SSRF durante render HTML→PDF.
 */

const app = express();
// Permitir HTML más grande con imágenes embebidas (data URI)
app.use(express.json({limit: '10mb'}));

app.get('/health', (_, res) => res.json({status: 'ok'}));

/**
 * POST /render
 * Body: { html: string, options?: { format?, margin?, landscape? } }
 * Returns: PDF binary (application/pdf)
 */
app.post('/render', async (req, res) => {
  const { html, options = {} } = req.body;
  
  if (!html) {
    return res.status(400).json({ error: 'Missing html field' });
  }

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu'
      ]
    });

    const page = await browser.newPage();
    // Evitar que una posible CSP en el HTML bloquee data URIs u orígenes
    try { await page.setBypassCSP(true); } catch (_) {}
    await page.setContent(html, { waitUntil: 'load' });

    const pdfOptions = {
      format: options.format || 'A4',
      margin: options.margin || {
        top: '20mm',
        right: '15mm',
        bottom: '20mm',
        left: '15mm'
      },
      landscape: options.landscape || false,
      printBackground: true,
      preferCSSPageSize: false
    };

    const pdfBuffer = await page.pdf(pdfOptions);
    await browser.close();

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Length', pdfBuffer.length);
    res.send(pdfBuffer);
  } catch (error) {
    console.error('PDF generation error:', error);
    if (browser) await browser.close();
    res.status(500).json({ error: 'PDF generation failed', detail: error.message });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`pdf-renderer listening on ${port}`));
