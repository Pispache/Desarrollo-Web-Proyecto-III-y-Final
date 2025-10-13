const express = require('express');
const app = express();
app.use(express.json({limit: '2mb'}));

app.get('/health', (_, res) => res.json({status: 'ok'}));

// Placeholder: implement Puppeteer rendering in Fase 2/3
app.post('/render', async (req, res) => {
  res.status(501).json({error: 'Not Implemented'});
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`pdf-renderer listening on ${port}`));
