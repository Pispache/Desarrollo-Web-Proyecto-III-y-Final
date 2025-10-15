const express = require('express');
const puppeteer = require('puppeteer');

const app = express();
app.use(express.json({limit: '2mb'}));

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
    await page.setContent(html, { waitUntil: 'networkidle0' });

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
