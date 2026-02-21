/* ===================================================
   DisasterAI — NLP Engine Module
   Entity extraction, urgency classification,
   prioritization explanation
   =================================================== */

const TYPE_LABELS = {
    medical: 'Medical Supplies', rescue: 'Rescue Team', shelter: 'Shelter',
    food_water: 'Food & Water', transport: 'Transport', clothing: 'Clothing & Blankets'
};

// ── Keyword Dictionaries ──────────────────────────────────
const NEED_KEYWORDS = {
    medical: [
        'medical', 'medicine', 'ambulance', 'doctor', 'nurse', 'hospital', 'injured', 'injury', 'injuries',
        'wound', 'wounded', 'bleeding', 'first aid', 'paramedic', 'emt', 'health', 'clinic', 'surgery',
        'medication', 'prescription', 'oxygen', 'ventilator', 'trauma', 'fracture', 'burn', 'burns',
        'cardiac', 'stroke', 'insulin', 'epipen', 'bandage', 'bandages', 'stretcher'
    ],
    rescue: [
        'rescue', 'trapped', 'stuck', 'collapsed', 'collapse', 'buried', 'rubble', 'debris', 'pinned',
        'stranded', 'missing', 'search', 'save', 'help us', "can't get out", 'blocked', 'cave-in',
        'landslide', 'avalanche', 'sinking', 'drowning', 'flood', 'fire', 'burning', 'smoke', 'explosion'
    ],
    shelter: [
        'shelter', 'housing', 'homeless', 'displaced', 'evacuate', 'evacuation', 'roof', 'tent', 'tents',
        'camp', 'refuge', 'accommodation', 'safe place', 'safe zone', 'no home', 'house destroyed',
        'building destroyed', 'nowhere to go', 'sleeping outside', 'exposed'
    ],
    food_water: [
        'food', 'water', 'hungry', 'thirsty', 'starving', 'dehydrated', 'meals', 'rations', 'supplies',
        'provisions', 'clean water', 'drinking water', 'baby formula', 'infant', 'nutrition',
        'canned food', 'bottled water', 'mre'
    ],
    transport: [
        'transport', 'transportation', 'vehicle', 'bus', 'truck', 'helicopter', 'airlift', 'evacuate',
        'evacuation', 'ride', 'move', 'relocate', 'road blocked', 'bridge out', 'boat'
    ],
    clothing: [
        'blanket', 'blankets', 'clothing', 'clothes', 'coat', 'coats', 'jacket', 'jackets', 'warm',
        'freezing', 'cold', 'hypothermia', 'sleeping bag', 'shoes', 'boots', 'gloves', 'socks'
    ]
};

const URGENCY_SIGNALS = {
    critical: {
        keywords: ['dying', 'death', 'dead', 'life-threatening', 'critical', 'trapped', 'collapse',
            'collapsed', 'drowning', 'bleeding out', "can't breathe", 'cardiac arrest', 'no pulse',
            'unconscious', 'explosion', 'active fire', 'sinking', 'buried alive', 'children trapped',
            'babies', 'infant', 'newborn', 'immediately', 'now', 'asap', 'right now', 'hurry'],
        weight: 4
    },
    high: {
        keywords: ['urgent', 'emergency', 'severe', 'serious', 'badly', 'injured', 'injuries', 'wound',
            'wounded', 'broken', 'stranded', 'no access', 'cut off', 'isolated', 'elderly', 'disabled',
            'pregnant', 'chronic illness', 'running out', 'almost gone', 'last', 'desperate'],
        weight: 3
    },
    medium: {
        keywords: ['need', 'require', 'request', 'shortage', 'low', 'running low', 'soon', 'within hours',
            'by tomorrow', 'limited', 'insufficient', 'not enough', 'dwindling', 'supplies needed',
            'assistance required', 'help needed'],
        weight: 2
    },
    low: {
        keywords: ['when possible', 'non-urgent', 'minor', 'slight', 'eventually', 'if available',
            'no rush', 'whenever', 'stable', 'manageable', 'coping', 'getting by'],
        weight: 1
    }
};

const QUANTITY_PATTERNS = [
    /(\d+)\s*(?:hundred|thousand)?\s*(?:people|persons|individuals|families|survivors|victims|residents|patients|children|elderly)/i,
    /(?:about|approximately|around|nearly|over|more than|at least|roughly)\s*(\d+)/i,
    /(\d+)\s*(?:blankets|meals|bottles|kits|units|boxes|cases|bags|tents|cots)/i,
    /(\d+)\s*(?:injured|hurt|wounded|trapped|missing|stranded|displaced)/i,
    /(\d+)/
];

const LOCATION_PATTERNS = [
    /(?:at|in|on|near|by|around|outside|inside)\s+(?:the\s+)?([A-Z][a-zA-Z\s]+(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Lane|Ln|Way|Place|Pl|Court|Ct|Highway|Hwy|Bridge|Park|Center|Centre|School|Hospital|Church|Station|Building|Tower|Mall|Market|Square|Plaza|District|Shelter|Camp|Hub|Block|Zone|Area))/gi,
    /(?:at|in|on|near)\s+(?:the\s+)?([A-Z][a-zA-Z\s]{3,30})/gi,
    /(?:downtown|uptown|midtown|east side|west side|north side|south side|city center)/gi,
    /(\d+(?:st|nd|rd|th)\s+(?:Street|Avenue|Floor|Block))/gi
];

// ── Entity Extraction ─────────────────────────────────────
function extractEntities(text) {
    const lower = text.toLowerCase();
    const entities = { needs: [], quantity: null, location: null, urgency: null, urgencyScore: 0, factors: [], rawText: text };

    // Needs
    for (const [type, keywords] of Object.entries(NEED_KEYWORDS)) {
        for (const kw of keywords) { if (lower.includes(kw)) { entities.needs.push(type); break; } }
    }

    // Quantity
    for (const p of QUANTITY_PATTERNS) {
        const m = text.match(p);
        if (m) { const n = parseInt(m[1], 10); if (n > 0 && n < 100000) { entities.quantity = n; break; } }
    }

    // Location
    for (const p of LOCATION_PATTERNS) {
        for (const m of text.matchAll(p)) {
            const loc = (m[1] || m[0]).trim();
            if (loc.length > 2 && loc.length < 60) { entities.location = loc; break; }
        }
        if (entities.location) break;
    }

    // Urgency scoring
    let score = 0;
    for (const [level, cfg] of Object.entries(URGENCY_SIGNALS)) {
        let hits = 0;
        for (const kw of cfg.keywords) { if (lower.includes(kw)) hits++; }
        if (hits) { score += hits * cfg.weight; entities.factors.push({ level, hits, weight: cfg.weight }); }
    }

    let urgency = 'low';
    if (score >= 10) urgency = 'critical';
    else if (score >= 6) urgency = 'high';
    else if (score >= 3) urgency = 'medium';

    if (entities.needs.includes('rescue') && lower.match(/trapped|collapse|drowning|fire/)) {
        urgency = 'critical'; score = Math.max(score, 10);
    }

    entities.urgency = urgency;
    entities.urgencyScore = score;
    return entities;
}

// ── Resource Matching (simplified — no registry now) ──────
function matchResources(needs) {
    return []; // registry removed per user request
}

// ── Prioritization Explainer ──────────────────────────────
function buildExplanation(entities, matched) {
    const desc = { critical: 'Immediate life-threatening situation detected', high: 'Severe emergency requiring rapid response', medium: 'Significant need requiring timely action', low: 'Non-urgent, can be addressed when resources allow' };
    const recs = { critical: 'Immediate dispatch recommended. Activate mutual aid if needed.', high: 'Priority dispatch within 30 minutes. Prepare backup.', medium: 'Scheduled response within 2–4 hours. Monitor for escalation.', low: 'Queued response when available. No immediate action required.' };

    return {
        urgencyLevel: entities.urgency.toUpperCase(),
        urgencyDescription: desc[entities.urgency],
        scoringFactors: (entities.factors || []).sort((a, b) => (b.hits * b.weight) - (a.hits * a.weight)).map(f => ({ level: f.level.toUpperCase(), hits: f.hits, weight: f.weight, points: f.hits * f.weight })),
        totalScore: entities.urgencyScore,
        identifiedNeeds: entities.needs.map(n => TYPE_LABELS[n] || n),
        scale: entities.quantity,
        recommendation: recs[entities.urgency]
    };
}

module.exports = { extractEntities, matchResources, buildExplanation, TYPE_LABELS };
