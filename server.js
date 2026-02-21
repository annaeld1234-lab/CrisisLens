/* ===================================================
   DisasterAI — Express API Server
   =================================================== */

const express = require('express');
const path = require('path');
const { extractEntities, matchResources, buildExplanation } = require('./nlp/engine');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── In-memory data ────────────────────────────────────────
let messageQueue = [];
let msgId = 0;

// ── POST /api/triage ──────────────────────────────────────
app.post('/api/triage', (req, res) => {
    const { message, source, sender } = req.body;
    if (!message || !message.trim()) {
        return res.status(400).json({ error: 'Message is required' });
    }

    const entities = extractEntities(message.trim());
    const matched = matchResources(entities.needs);
    const explanation = buildExplanation(entities, matched);

    msgId++;
    const entry = {
        id: msgId,
        source: source || 'sms',
        sender: sender || null,
        preview: message.length > 200 ? message.slice(0, 200) + '…' : message,
        urgency: entities.urgency,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        entities,
        matched,
        explanation
    };
    messageQueue.push(entry);

    res.json({ entities, matched, explanation, queueEntry: entry });
});

// ── GET /api/queue ────────────────────────────────────────
app.get('/api/queue', (req, res) => {
    const order = { critical: 0, high: 1, medium: 2, low: 3 };
    const sorted = [...messageQueue].sort((a, b) => order[a.urgency] - order[b.urgency]);
    res.json(sorted);
});

// ── DELETE /api/queue ─────────────────────────────────────
app.delete('/api/queue', (req, res) => {
    messageQueue = [];
    msgId = 0;
    res.json({ success: true });
});

// ── GET /api/stats ────────────────────────────────────────
app.get('/api/stats', (req, res) => {
    res.json({
        processed: messageQueue.length,
        critical: messageQueue.filter(m => m.urgency === 'critical').length
    });
});

// ── Fallback ──────────────────────────────────────────────
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`\n  ⚡ DisasterAI server running at http://localhost:${PORT}\n`);
});
