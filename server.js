const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Serve the app and its assets (index.html, logo.jpg, etc.)
app.use(express.static(__dirname, { extensions: ['html'] }));

// Single-page app: any unknown route falls back to index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Metal Assault running on port ${PORT}`);
});
