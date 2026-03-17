const express = require('express');
const cors = require('cors');
const db = require('./db');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

app.post('/api/connect', async (req, res) => {
  try {
    const { type, config } = req.body;
    const result = await db.connect(type, config);
    res.json(result);
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

app.post('/api/disconnect', async (req, res) => {
  try {
    const { connectionId } = req.body;
    await db.disconnect(connectionId);
    res.json({ success: true });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

app.post('/api/databases', async (req, res) => {
  try {
    const { connectionId } = req.body;
    const databases = await db.getDatabases(connectionId);
    res.json({ success: true, databases });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

app.post('/api/tables', async (req, res) => {
  try {
    const { connectionId, database } = req.body;
    const tables = await db.getTables(connectionId, database);
    res.json({ success: true, tables });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

app.post('/api/analyze', async (req, res) => {
  try {
    const { connectionId, database, sql } = req.body;
    const result = await db.analyzeSQL(connectionId, database, sql);
    res.json(result);
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

app.post('/api/indexes', async (req, res) => {
  try {
    const { connectionId, database, table } = req.body;
    const indexes = await db.getIndexes(connectionId, database, table);
    res.json({ success: true, indexes });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
