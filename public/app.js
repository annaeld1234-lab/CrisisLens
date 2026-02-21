/* ===================================================
   DisasterAI — Auto-stream SPA
   Messages arrive automatically from social media,
   AI triages them, dispatchers just monitor & act.
   + Location tracking & duplication detection
   =================================================== */

// ── Constants ────────────────────────────────────────────
const TYPE_LABELS = { medical: 'MEDICAL SUPPLIES', rescue: 'RESCUE TEAM', shelter: 'SHELTER', food_water: 'FOOD & WATER', transport: 'TRANSPORT', clothing: 'CLOTHING & BLANKETS' };
const SOURCE_NAMES = { sms: 'SMS', whatsapp: 'WHATSAPP', email: 'EMAIL', radio: 'RADIO DISPATCH', twitter: 'TWITTER/X', helpline: 'HELPLINE', telegram: 'TELEGRAM' };
const SOURCE_COLORS = { sms: '#FAFAFA', whatsapp: '#DFE104', email: '#A1A1AA', twitter: '#FAFAFA', helpline: '#DFE104', telegram: '#FAFAFA', radio: '#A1A1AA' };
const URG_COLORS = { critical: '#DFE104', high: '#FAFAFA', medium: '#A1A1AA', low: '#27272A' };
const DUPLICATE_THRESHOLD = 0.65; // Jaccard similarity threshold
let duplicatesBlocked = 0;
let showDuplicates = false;

// ── Dispatcher Location (real GPS) ───────────────────────
let dispatcherLocation = null;
function initDispatcherLocation() {
    if ('geolocation' in navigator) {
        navigator.geolocation.getCurrentPosition(
            pos => {
                dispatcherLocation = { lat: pos.coords.latitude, lng: pos.coords.longitude };
                console.log('📍 Dispatcher location acquired:', dispatcherLocation);
            },
            err => console.warn('⚠️ Geolocation denied:', err.message),
            { enableHighAccuracy: true, timeout: 10000 }
        );
    }
}

// ── Simulated Sender GPS Coordinates (disaster zone) ─────
const SENDER_LOCATIONS = [
    { lat: 28.6139, lng: 77.2090, area: 'Central Delhi' },
    { lat: 28.6508, lng: 77.2316, area: 'Civil Lines' },
    { lat: 28.5355, lng: 77.3910, area: 'Noida Sector 18' },
    { lat: 28.4595, lng: 77.0266, area: 'Gurgaon' },
    { lat: 28.7041, lng: 77.1025, area: 'Rohini' },
    { lat: 28.5672, lng: 77.2100, area: 'Hauz Khas' },
    { lat: 28.6315, lng: 77.2167, area: 'Connaught Place' },
    { lat: 28.6280, lng: 77.3649, area: 'Vasundhara' },
    { lat: 28.6862, lng: 77.2217, area: 'Model Town' },
    { lat: 28.5245, lng: 77.1855, area: 'Saket' },
    { lat: 28.5921, lng: 77.0460, area: 'Dwarka' },
    { lat: 28.6692, lng: 77.4538, area: 'Ghaziabad' },
    { lat: 28.4089, lng: 77.3178, area: 'Faridabad' },
    { lat: 28.7495, lng: 77.1180, area: 'Narela' },
    { lat: 28.5506, lng: 77.2689, area: 'Nehru Place' },
    { lat: 28.6353, lng: 77.2250, area: 'Rajiv Chowk' },
    { lat: 28.6129, lng: 77.2295, area: 'India Gate' },
    { lat: 28.5562, lng: 77.1000, area: 'Janakpuri' },
    { lat: 28.6437, lng: 77.0838, area: 'Punjabi Bagh' },
    { lat: 28.7277, lng: 77.0688, area: 'Pitampura' }
];

function getRandomOffset() {
    return (Math.random() - 0.5) * 0.01; // ~±500m jitter
}

function haversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Earth radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── Duplication Detection (Jaccard Similarity) ───────────
function tokenize(text) {
    return new Set(text.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(w => w.length > 2));
}

function jaccardSimilarity(setA, setB) {
    let intersection = 0;
    for (const w of setA) { if (setB.has(w)) intersection++; }
    const union = setA.size + setB.size - intersection;
    return union === 0 ? 0 : intersection / union;
}

function isDuplicate(newMsg, existingMessages) {
    const newTokens = tokenize(newMsg);
    for (const existing of existingMessages) {
        const existingTokens = tokenize(existing.fullText);
        const similarity = jaccardSimilarity(newTokens, existingTokens);
        if (similarity >= DUPLICATE_THRESHOLD) {
            return { isDup: true, similarity: Math.round(similarity * 100), matchId: existing.id };
        }
    }
    return { isDup: false, similarity: 0, matchId: null };
}

// ── Simulated incoming messages from real users ──────────
const INCOMING_MESSAGES = [
    { source: 'whatsapp', sender: 'Maria Garcia', msg: "Please help! Our building has collapsed in the earthquake on Main Street. There are at least 12 of us trapped including 3 children. We can hear the rescue sirens but nobody has reached us. HURRY" },
    { source: 'twitter', sender: '@DisasterWatch', msg: "BREAKING: Multiple reports of severe flooding in the River Road area. Eyewitness says 8+ people stranded on rooftops. Water level rising rapidly. Emergency services appear overwhelmed #CityFlood #Emergency" },
    { source: 'sms', sender: '+1-555-0198', msg: "we r at lincoln high school shelter. 200 families here n food almost gone. kids r hungry. pls send food and water urgently. been 2 days with barely any supply" },
    { source: 'helpline', sender: 'Caller #4812', msg: "This is an emergency. My elderly mother is having difficulty breathing and is showing signs of cardiac distress. We are at 45 Oak Avenue, apartment 3B. She is diabetic and needs her insulin too. Ambulance needed immediately." },
    { source: 'telegram', sender: 'Volunteer_Team_4', msg: "Report from field: Convention Center on East Side has capacity for 500 more evacuees. Currently only 120 inside. Clean water supply available. Requesting more blankets — temperatures dropping below freezing tonight." },
    { source: 'whatsapp', sender: 'Ahmed Khalil', msg: "3 people badly injured at the parking lot near Oak Street Hospital from the flooding. One person is unconscious and bleeding from head wound. We need an ambulance right now please! We've been waiting 40 minutes" },
    { source: 'twitter', sender: '@CityReporter', msg: "UPDATE: Warehouse fire on Industrial Avenue now spreading to adjacent buildings. Fire department says they are overwhelmed and need backup. Reports of people still trapped inside. Smoke visible from miles away." },
    { source: 'email', sender: 'shelter.coordinator@relief.org', msg: "Subject: URGENT Shelter Supply Request\n\nThe downtown community shelter is running critically low on medical supplies. We have 15 people with minor injuries who need first aid kits and bandages. Also requesting additional cots — we've exceeded capacity by 30%." },
    { source: 'sms', sender: '+1-555-0342', msg: "my neighbor is trapped under debris from the wall collapse on 5th Avenue. Shes 8 months pregnant please send someone! we tried to move the rubble but its too heavy" },
    { source: 'helpline', sender: 'Caller #5201', msg: "I'm calling about the bridge on Highway 9. It has major cracks and is swaying. There are still cars driving over it. Someone needs to close it before it collapses. There's a school bus route that uses this bridge." },
    { source: 'telegram', sender: 'RedCross_Unit7', msg: "Status update: Our mobile medical unit at the Downtown Hub is operational. We have capacity for 30 more patients. Currently treating 18 people with minor to moderate injuries. Could use additional trauma kits and O-negative blood supplies." },
    { source: 'whatsapp', sender: 'Local Resident', msg: "There's a gas leak smell near the collapsed building on Park Street. people are still living in the nearby houses. can someone please evacuate this area? we're scared of an explosion" },
    { source: 'twitter', sender: '@WeatherAlert', msg: "ADVISORY: Second wave of heavy rainfall expected in the next 3 hours. Areas already impacted by flooding should prepare for water levels to rise another 2-3 feet. Evacuation strongly recommended for low-lying zones." },
    { source: 'sms', sender: '+1-555-0876', msg: "at east community center. things are mostly ok here. we have about 60 people. could use some more sleeping bags and blankets when possible, not super urgent but it's getting cold at night" },
    { source: 'email', sender: 'transport@emergency.gov', msg: "Subject: Road Status Update\n\nMultiple roads now impassable due to flooding and debris. Route 7, River Road, and Industrial Ave are all blocked. Suggesting airlift or boat rescue for stranded individuals in the flood zone. 3 city buses available for evacuation if routes can be cleared." },
    { source: 'helpline', sender: 'Caller #5890', msg: "My daughter has asthma and she's having a severe attack. We ran out of her inhaler 2 days ago. We're stuck at the temporary camp on West End road, there's no pharmacy open anywhere. She's 6 years old and really struggling to breathe." },
    { source: 'whatsapp', sender: 'Priya Sharma', msg: "water contamination alert!! people at our shelter got sick after drinking from the supply tank. at least 20 people vomiting and having diarrhea. we think the tank got contaminated from flood water. need clean water and medical help" },
    { source: 'telegram', sender: 'SAR_Team_Alpha', msg: "Search and rescue update: We located 5 survivors in the rubble at 3rd Street shopping complex. Two have serious leg injuries and cannot walk. Need stretchers and a medical evacuation vehicle dispatched to our location ASAP." },
    { source: 'twitter', sender: '@LocalNews9', msg: "Just spoke to residents near Industrial Ave. They say the fire is completely out of control. At least 3 buildings fully engulfed. Firefighters requesting backup from neighboring counties. Several families reportedly still unaccounted for." },
    { source: 'sms', sender: '+1-555-0445', msg: "pls help my grandmother she fell and broke her hip. we r at 78 maple street. she is 82 years old and in so much pain. she also needs her blood pressure medicine. cant move her ourselves" },
    // ── Intentional near-duplicates for testing dedup ──
    { source: 'whatsapp', sender: 'Maria Garcia', msg: "HELP! Building collapsed on Main Street in earthquake! 12 people trapped here including 3 small children. Rescue sirens nearby but no one has come yet. PLEASE HURRY" },
    { source: 'sms', sender: '+1-555-0199', msg: "we are at lincoln high school shelter. 200 families and food is almost gone. children are hungry. please send food and water urgently. it has been 2 days" },
];

// ── NLP Dictionaries ─────────────────────────────────────
const NEED_KEYWORDS = {
    medical: ['medical', 'medicine', 'ambulance', 'doctor', 'nurse', 'hospital', 'injured', 'injury', 'injuries', 'wound', 'wounded', 'bleeding', 'first aid', 'paramedic', 'emt', 'health', 'clinic', 'surgery', 'medication', 'oxygen', 'trauma', 'burn', 'cardiac', 'insulin', 'inhaler', 'asthma', 'blood', 'antibiotics', 'stretcher', 'bandage'],
    rescue: ['rescue', 'trapped', 'stuck', 'collapsed', 'collapse', 'buried', 'rubble', 'debris', 'pinned', 'stranded', 'missing', 'search', 'save', "can't get out", 'cave-in', 'landslide', 'sinking', 'drowning', 'flood', 'fire', 'explosion', 'engulfed', 'unaccounted'],
    shelter: ['shelter', 'housing', 'homeless', 'displaced', 'evacuate', 'evacuation', 'roof', 'tent', 'tents', 'camp', 'refuge', 'accommodation', 'safe place', 'house destroyed', 'building destroyed', 'exposed', 'cots', 'capacity'],
    food_water: ['food', 'water', 'hungry', 'thirsty', 'starving', 'dehydrated', 'meals', 'rations', 'supplies', 'provisions', 'clean water', 'drinking water', 'baby formula', 'infant', 'nutrition', 'contaminated', 'vomiting', 'diarrhea'],
    transport: ['transport', 'transportation', 'vehicle', 'bus', 'truck', 'helicopter', 'airlift', 'evacuate', 'evacuation', 'ride', 'move', 'relocate', 'road blocked', 'bridge', 'boat', 'impassable', 'route'],
    clothing: ['blanket', 'blankets', 'clothing', 'clothes', 'coat', 'coats', 'warm', 'freezing', 'cold', 'hypothermia', 'sleeping bag']
};

const URGENCY_SIGNALS = {
    critical: { keywords: ['dying', 'death', 'dead', 'life-threatening', 'critical', 'trapped', 'collapse', 'drowning', 'bleeding out', "can't breathe", 'cardiac', 'unconscious', 'explosion', 'fire', 'sinking', 'buried', 'infant', 'newborn', 'immediately', 'now', 'asap', 'right now', 'hurry', 'engulfed', 'out of control', 'struggling to breathe'], weight: 4 },
    high: { keywords: ['urgent', 'emergency', 'severe', 'serious', 'badly', 'injured', 'injuries', 'wound', 'wounded', 'broken', 'stranded', 'isolated', 'elderly', 'disabled', 'pregnant', 'running out', 'almost gone', 'desperate', 'overwhelmed', 'contaminated', 'vomiting', 'spreading'], weight: 3 },
    medium: { keywords: ['need', 'require', 'request', 'shortage', 'low', 'running low', 'soon', 'within hours', 'by tomorrow', 'limited', 'insufficient', 'supplies needed', 'help needed', 'exceeded capacity', 'requesting'], weight: 2 },
    low: { keywords: ['when possible', 'non-urgent', 'minor', 'slight', 'eventually', 'if available', 'no rush', 'whenever', 'stable', 'manageable', 'mostly ok', 'not super urgent', 'coping'], weight: 1 }
};

const QTY_PAT = [/(?:about|approximately|around|nearly|over|at least|more than)\s*(\d+)/i, /(\d+)\s*(?:people|persons|individuals|families|survivors|victims|residents|patients|children|elderly|blankets|meals|bottles|kits|units|injured|buildings|cars)/i, /(\d+)/];
const LOC_PAT = [/(?:at|in|on|near|by|around)\s+(?:the\s+)?([A-Z][a-zA-Z\s]+(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Way|Place|Highway|Hwy|Bridge|Park|Center|Centre|School|Hospital|Station|Building|Tower|Mall|District|Shelter|Camp|Hub|Block|Zone|Area))/gi, /(?:at|in|on|near)\s+(?:the\s+)?([A-Z][a-zA-Z\s]{3,30})/gi];

// ── NLP Engine ───────────────────────────────────────────
function extractEntities(text) {
    const lower = text.toLowerCase();
    const e = { needs: [], quantity: null, location: null, urgency: 'low', urgencyScore: 0, factors: [] };

    for (const [type, kws] of Object.entries(NEED_KEYWORDS))
        for (const k of kws) if (lower.includes(k)) { e.needs.push(type); break; }

    for (const p of QTY_PAT) { const m = text.match(p); if (m) { const n = parseInt(m[1], 10); if (n > 0 && n < 100000) { e.quantity = n; break; } } }

    for (const p of LOC_PAT) { for (const m of text.matchAll(p)) { const l = (m[1] || m[0]).trim(); if (l.length > 2 && l.length < 60) { e.location = l; break; } } if (e.location) break; }

    let score = 0;
    for (const [level, cfg] of Object.entries(URGENCY_SIGNALS)) {
        let hits = 0; for (const k of cfg.keywords) if (lower.includes(k)) hits++;
        if (hits) { score += hits * cfg.weight; e.factors.push({ level, hits, weight: cfg.weight }); }
    }
    if (score >= 10) e.urgency = 'critical'; else if (score >= 6) e.urgency = 'high'; else if (score >= 3) e.urgency = 'medium';
    if (e.needs.includes('rescue') && lower.match(/trapped|collapse|drowning|fire|engulfed/)) { e.urgency = 'critical'; score = Math.max(score, 10); }
    e.urgencyScore = score;
    return e;
}

function buildExplanation(ent) {
    const desc = { critical: 'Immediate life-threatening situation detected', high: 'Severe emergency requiring rapid response', medium: 'Significant need requiring timely action', low: 'Non-urgent, can be addressed when resources allow' };
    const recs = { critical: 'Immediate dispatch recommended. Activate mutual aid.', high: 'Priority dispatch within 30 minutes.', medium: 'Scheduled response within 2–4 hours.', low: 'Queue for next available resource.' };
    return {
        urgencyLevel: ent.urgency.toUpperCase(), urgencyDescription: desc[ent.urgency],
        scoringFactors: (ent.factors || []).sort((a, b) => (b.hits * b.weight) - (a.hits * a.weight)).map(f => ({ level: f.level.toUpperCase(), hits: f.hits, weight: f.weight, points: f.hits * f.weight })),
        totalScore: ent.urgencyScore, identifiedNeeds: ent.needs.map(n => TYPE_LABELS[n] || n),
        scale: ent.quantity, recommendation: recs[ent.urgency]
    };
}

// ── App State ────────────────────────────────────────────
let allMessages = [];
let blockedDuplicates = [];
let msgId = 0;
let streamInterval = null;
let msgIndex = 0;
let sourceCounts = {};

// ── Navigation ───────────────────────────────────────────
function navTo(pageId) {
    document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.target === pageId));
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    const t = document.getElementById(pageId);
    if (t) { t.classList.add('active'); t.querySelector('.page-body')?.scrollTo(0, 0); }
}

// ── Splash ───────────────────────────────────────────────
function runSplash() {
    const steps = document.querySelectorAll('.splash-step');
    [400, 900, 1400, 2000].forEach((d, i) => {
        setTimeout(() => { if (i > 0) { steps[i - 1].classList.remove('active'); steps[i - 1].classList.add('done'); } steps[i].classList.add('active'); }, d);
    });
    setTimeout(() => { steps[3].classList.remove('active'); steps[3].classList.add('done'); }, 2400);
    setTimeout(() => { document.getElementById('splash').classList.add('fade-out'); document.getElementById('appWrapper').classList.remove('hidden'); }, 2700);
}

// ── Auto-stream: simulate incoming messages ──────────────
function receiveMessage() {
    if (msgIndex >= INCOMING_MESSAGES.length) msgIndex = 0; // loop
    const raw = INCOMING_MESSAGES[msgIndex++];
    const entities = extractEntities(raw.msg);
    const explanation = buildExplanation(entities);

    // ── Assign sender GPS location ──
    const locIdx = (msgIndex - 1) % SENDER_LOCATIONS.length;
    const baseLoc = SENDER_LOCATIONS[locIdx];
    const senderGPS = {
        lat: baseLoc.lat + getRandomOffset(),
        lng: baseLoc.lng + getRandomOffset(),
        area: baseLoc.area
    };
    // Calculate distance from dispatcher if available
    let distanceKm = null;
    if (dispatcherLocation) {
        distanceKm = haversineDistance(dispatcherLocation.lat, dispatcherLocation.lng, senderGPS.lat, senderGPS.lng);
    }

    // ── Duplication detection ──
    const dupResult = isDuplicate(raw.msg, allMessages);

    msgId++;
    const entry = {
        id: msgId, source: raw.source, sender: raw.sender, fullText: raw.msg,
        preview: raw.msg.length > 200 ? raw.msg.slice(0, 200) + '…' : raw.msg,
        urgency: entities.urgency,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        entities, explanation,
        location: senderGPS,
        distanceKm: distanceKm,
        isDuplicate: dupResult.isDup,
        dupSimilarity: dupResult.similarity,
        dupMatchId: dupResult.matchId
    };

    if (dupResult.isDup) {
        blockedDuplicates.push(entry);
        duplicatesBlocked++;
    } else {
        allMessages.push(entry);
    }
    sourceCounts[raw.source] = (sourceCounts[raw.source] || 0) + 1;

    updateAll();
}

function startStream() {
    if (streamInterval) return;
    // Send first one immediately
    receiveMessage();
    // Then every 3-5 seconds
    streamInterval = setInterval(receiveMessage, 3000 + Math.random() * 2000);

    document.getElementById('btnStartStream').classList.add('hidden');
    document.getElementById('btnStopStream').classList.remove('hidden');
    document.getElementById('streamStatus').textContent = 'Receiving messages from connected sources…';
}

function stopStream() {
    clearInterval(streamInterval);
    streamInterval = null;
    document.getElementById('btnStartStream').classList.remove('hidden');
    document.getElementById('btnStopStream').classList.add('hidden');
    document.getElementById('streamStatus').textContent = 'Stream paused.';
}

// ── Update everything ────────────────────────────────────
function updateAll() {
    updateStats();
    renderFeed();
    renderSourceBars();
    renderRecentAlerts();
    renderSourcesPage();
}

function updateStats() {
    const totalProcessed = allMessages.length + duplicatesBlocked;
    document.getElementById('statTotal').textContent = totalProcessed;
    document.getElementById('statCritical').textContent = allMessages.filter(m => m.urgency === 'critical').length;
    document.getElementById('statHigh').textContent = allMessages.filter(m => m.urgency === 'high').length;
    document.getElementById('statMedium').textContent = allMessages.filter(m => m.urgency === 'medium').length;
    document.getElementById('statDuplicates').textContent = duplicatesBlocked;
    document.getElementById('statLocated').textContent = allMessages.filter(m => m.location).length;
    document.getElementById('navBadge').textContent = allMessages.length;
}

function renderFeed() {
    const el = document.getElementById('messageFeed');
    const urgFilter = document.getElementById('filterUrgency')?.value || 'all';
    const srcFilter = document.getElementById('filterSource')?.value || 'all';

    // Include duplicates if toggle is on
    let msgs = showDuplicates ? [...allMessages, ...blockedDuplicates] : [...allMessages];

    // Apply filters
    if (urgFilter !== 'all') {
        const levels = { critical: ['critical'], high: ['critical', 'high'], medium: ['critical', 'high', 'medium'] };
        msgs = msgs.filter(m => levels[urgFilter]?.includes(m.urgency));
    }
    if (srcFilter !== 'all') msgs = msgs.filter(m => m.source === srcFilter);

    // Sort by urgency
    const order = { critical: 0, high: 1, medium: 2, low: 3 };
    msgs.sort((a, b) => order[a.urgency] - order[b.urgency] || b.id - a.id);

    if (!msgs.length) {
        el.innerHTML = `<div class="empty-state"><p>${allMessages.length ? 'No messages match the current filters.' : 'Waiting for incoming messages…'}</p></div>`;
        return;
    }

    el.innerHTML = msgs.map(m => {
        const needTags = m.entities.needs.slice(0, 3).map(n => `<span class="fc-need-tag">${TYPE_LABELS[n] || n}</span>`).join('');
        const locTag = m.location ? `<span class="fc-location-tag" title="${m.location.lat.toFixed(4)}, ${m.location.lng.toFixed(4)}">GEO: ${esc(m.location.area)}${m.distanceKm !== null ? ' // ' + m.distanceKm.toFixed(1) + 'KM' : ''}</span>` : '';
        const dupTag = m.isDuplicate ? `<span class="fc-dup-tag">DUPLICATE IDENTIFIED (${m.dupSimilarity}% MATCH -> REF #${m.dupMatchId})</span>` : '';
        return `
    <div class="feed-card ${m.urgency} ${m.isDuplicate ? 'is-duplicate' : ''} ${m.id === msgId ? 'new-pulse' : ''}" data-id="${m.id}" onclick="openDetail(${m.id})">
      ${dupTag}
      <div class="fc-top">
        <div class="fc-source">${SOURCE_NAMES[m.source] || m.source} // ${esc(m.sender)}</div>
        <div style="display:flex;align-items:center;gap:1rem">
          ${locTag}
          <span class="fc-badge ${m.urgency}">${m.urgency}</span>
          <span class="fc-time">${m.time}</span>
        </div>
      </div>
      <div class="fc-preview">${esc(m.preview)}</div>
      <div class="fc-needs">${needTags}</div>
      <div class="fc-ai">SYSTEM ANALYSIS: ${m.explanation.urgencyDescription} // CONFIDENCE: ${m.entities.urgencyScore}</div>
    </div>`;
    }).join('');
}

function renderSourceBars() {
    const el = document.getElementById('sourceBars');
    const total = allMessages.length || 1;
    const sources = ['whatsapp', 'twitter', 'sms', 'helpline', 'email', 'telegram'];
    el.innerHTML = sources.map(s => {
        const count = sourceCounts[s] || 0;
        const pct = (count / total) * 100;
        return `<div class="src-bar">
      <div class="src-bar-label">${SOURCE_NAMES[s]}</div>
      <div class="src-bar-track"><div class="src-bar-fill" style="width:${pct}%;background:${SOURCE_COLORS[s]}"></div></div>
      <div class="src-bar-count">${count}</div>
    </div>`;
    }).join('');
}

function renderRecentAlerts() {
    const el = document.getElementById('recentAlerts');
    const crits = allMessages.filter(m => m.urgency === 'critical').slice(-5).reverse();
    if (!crits.length) { el.innerHTML = '<p class="empty-mini">awaiting data</p>'; return; }
    el.innerHTML = crits.map(m => `
    <div class="alert-item" onclick="openDetail(${m.id})">
      <div class="alert-meta">[ERR] ${SOURCE_NAMES[m.source]} // ${m.sender} // ${m.time}</div>
      ${esc(m.preview.slice(0, 100))}…
    </div>
  `).join('');
}

function renderSourcesPage() {
    const el = document.getElementById('sourcesGrid');
    const sources = [
        { id: 'whatsapp', name: 'WhatsApp', desc: 'Monitoring emergency messages from WhatsApp groups and direct messages from affected users.' },
        { id: 'twitter', name: 'Twitter / X', desc: 'Tracking disaster-related hashtags and emergency mentions from public posts.' },
        { id: 'sms', name: 'SMS Gateway', desc: 'Receiving text messages from emergency hotline numbers and local users.' },
        { id: 'email', name: 'Email', desc: 'Processing emergency reports from government agencies and relief coordinators.' },
        { id: 'helpline', name: 'Emergency Helpline', desc: 'Transcribed voice calls from the disaster relief helpline number.' },
        { id: 'telegram', name: 'Telegram', desc: 'Connected to volunteer coordination channels and field team reports.' },
    ];

    const order = { critical: 0, high: 1, medium: 2, low: 3 };

    el.innerHTML = sources.map(s => {
        const count = sourceCounts[s.id] || 0;
        // Get messages for this source, sorted by urgency
        const srcMsgs = allMessages
            .filter(m => m.source === s.id)
            .sort((a, b) => order[a.urgency] - order[b.urgency] || b.id - a.id);

        let msgListHtml = '';
        if (srcMsgs.length) {
            msgListHtml = `<div class="source-msg-list">${srcMsgs.map(m => {
                const locArea = m.location ? `<span class="fc-location-tag" title="${m.location.lat.toFixed(4)}, ${m.location.lng.toFixed(4)}">GEO: ${esc(m.location.area)}</span>` : '';
                return `
                <div class="source-msg-item ${m.urgency}" onclick="openDetail(${m.id})">
                    <div class="source-msg-top">
                        <span class="fc-badge ${m.urgency}">${m.urgency}</span>
                        <span class="source-msg-sender">${esc(m.sender)}</span>
                        ${locArea}
                        <span class="fc-time">${m.time}</span>
                    </div>
                    <div class="source-msg-preview">${esc(m.preview.slice(0, 120))}${m.preview.length > 120 ? '…' : ''}</div>
                </div>`;
            }).join('')}</div>`;
        } else {
            msgListHtml = `<div class="source-msg-empty">EMPTY QUEUE</div>`;
        }

        const critCount = srcMsgs.filter(m => m.urgency === 'critical').length;
        const highCount = srcMsgs.filter(m => m.urgency === 'high').length;
        const medCount = srcMsgs.filter(m => m.urgency === 'medium').length;
        const lowCount = srcMsgs.filter(m => m.urgency === 'low').length;

        const breakdownHtml = count > 0 ? `
            <div class="source-urgency-breakdown">
                ${critCount ? `<span class="sub-count critical">CRIT: ${critCount}</span>` : ''}
                ${highCount ? `<span class="sub-count high">HIGH: ${highCount}</span>` : ''}
                ${medCount ? `<span class="sub-count medium">MED: ${medCount}</span>` : ''}
                ${lowCount ? `<span class="sub-count low">LOW: ${lowCount}</span>` : ''}
            </div>` : '';

        return `
    <div class="source-card source-card--expanded">
      <div class="source-card-header">
        <div class="source-card-info">
          <div class="source-card-name">${s.name}</div>
          <div class="source-card-desc">${s.desc}</div>
          <div class="source-card-stats">
            <span class="source-stat">MESSAGES <strong>${count}</strong></span>
            <span class="status-dot connected">ONLINE</span>
          </div>
          ${breakdownHtml}
        </div>
      </div>
      ${msgListHtml}
    </div>`;
    }).join('');
}

// ── Detail View ──────────────────────────────────────────
window.openDetail = function (id) {
    const msg = allMessages.find(m => m.id === id) || blockedDuplicates.find(m => m.id === id);
    if (!msg) return;
    const e = msg.entities, ex = msg.explanation;

    let chips = '';
    if (e.needs.length) chips += mkChip('IDENTIFIED NEEDS', e.needs.map(n => TYPE_LABELS[n] || n).join(', '));
    if (e.quantity) chips += mkChip('EST SCALE', '~' + e.quantity.toLocaleString() + ' AFFECTED');
    if (e.location) chips += mkChip('NLP LOCATION', e.location);
    chips += mkChip('URGENCY RATING', e.urgencyScore + ' PTS');

    // GPS location chip
    if (msg.location) {
        chips += mkChip('SENDER GPS', `${msg.location.lat.toFixed(4)}, ${msg.location.lng.toFixed(4)}`);
        chips += mkChip('AREA', msg.location.area);
        if (msg.distanceKm !== null) {
            chips += mkChip('DISTANCE', msg.distanceKm.toFixed(1) + ' KM AWAY');
        }
    }

    let exHtml = `<strong>${ex.urgencyLevel}</strong> — ${esc(ex.urgencyDescription)}<br/><br/>`;
    if (ex.scoringFactors.length) {
        exHtml += '<strong>AI SCORING BREAKDOWN:</strong>';
        ex.scoringFactors.forEach(f => { exHtml += `<div class="expl-row"><span class="expl-dot" style="background:${URG_COLORS[f.level.toLowerCase()]}"></span>${f.level}: ${f.hits} HITS (×${f.weight}) = +${f.points}</div>`; });
        exHtml += `<div class="expl-row" style="margin-top:.3rem"><strong>TOTAL: ${ex.totalScore} PTS</strong></div><br/>`;
    }
    if (ex.identifiedNeeds.length) exHtml += `<strong>NEEDS:</strong> ${esc(ex.identifiedNeeds.join(', '))}<br/>`;
    if (ex.scale) exHtml += `<strong>SCALE:</strong> ~${ex.scale} AFFECTED<br/>`;
    exHtml += `<br/><strong>AI RECOMMENDATION:</strong> ${esc(ex.recommendation)}`;

    // Duplication info
    let dupHtml = '';
    if (msg.isDuplicate) {
        dupHtml = `
        <div class="dl-section">
            <div class="dl-title">DUPLICATE DETECTION</div>
            <div class="dup-alert-box">
                <div class="dup-alert-info">
                    <strong>${msg.dupSimilarity}% SIMILAR TO RECORD #${msg.dupMatchId}</strong>
                    <p>AUTO-BLOCKED. ORIGINAL MESSAGE HAS ALREADY BEEN TRIAGED.</p>
                </div>
            </div>
        </div>`;
    }

    // Location map section
    let locHtml = '';
    if (msg.location) {
        const mapUrl = `https://www.openstreetmap.org/?mlat=${msg.location.lat}&mlon=${msg.location.lng}#map=15/${msg.location.lat}/${msg.location.lng}`;
        locHtml = `
        <div class="dl-section">
            <div class="dl-title">GEOSPATIAL DATA</div>
            <div class="location-detail-box">
                <div class="loc-map-placeholder">
                    <div class="loc-coords">${msg.location.lat.toFixed(4)}°N, ${msg.location.lng.toFixed(4)}°E</div>
                    <div class="loc-area">${esc(msg.location.area)}</div>
                    ${msg.distanceKm !== null ? `<div class="loc-distance">${msg.distanceKm.toFixed(1)} KM FROM YOU</div>` : ''}
                    <a href="${mapUrl}" target="_blank" class="btn btn--outline btn--sm loc-map-btn">OPEN RAW COORDINATES</a>
                </div>
            </div>
        </div>`;
    }

    document.getElementById('detailPanel').innerHTML = `
    <div class="dl-hero">
      <div class="dl-top">
        <div class="fc-badge ${msg.urgency}" style="font-size:1rem;padding:.2rem .65rem">${msg.urgency.toUpperCase()}</div>
        <div class="dl-source">${SOURCE_NAMES[msg.source] || msg.source} // ${esc(msg.sender)} // ${msg.time}</div>
      </div>
      <div class="dl-msg">${esc(msg.fullText)}</div>
    </div>
    ${dupHtml}
    <div class="dl-section"><div class="dl-title">NLP ENTITY EXTRACTION</div><div class="chip-grid">${chips}</div></div>
    ${locHtml}
    <div class="dl-section"><div class="dl-title">PRIORITIZATION LOGIC</div><div class="dl-expl">${exHtml}</div></div>
    <div class="dl-section">
      <div class="dl-title">DISPATCHER ACTION REQUIRED</div>
      <div class="dispatch-box">
        <p>EXECUTE TRIAGED WORKFLOW</p>
        <div class="dispatch-actions flex gap-4 mt-4">
          <button class="btn btn--outline btn--sm" onclick="markMsg(${msg.id},'acknowledged')">ACKNOWLEDGE</button>
          <button class="btn btn--primary btn--sm" onclick="markMsg(${msg.id},'dispatched')">DISPATCH UNIT</button>
        </div>
      </div>
    </div>`;
    navTo('page-detail');
};

window.markMsg = function (id, action) {
    alert(`Message #${id} marked as "${action}". In production this would update the dispatch system.`);
};

function mkChip(label, val) { return `<div class="chip"><div class="chip-label">${label}</div><div class="chip-val">${esc(val)}</div></div>`; }
function esc(s) { if (!s) return ''; const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

// ── Toggle duplicates visibility ─────────────────────────
window.toggleDuplicates = function () {
    showDuplicates = !showDuplicates;
    const btn = document.getElementById('btnToggleDups');
    if (btn) {
        btn.textContent = showDuplicates ? 'HIDE DUPLICATES' : 'SHOW DUPLICATES';
        btn.classList.toggle('active', showDuplicates);
    }
    renderFeed();
};

// ── Init ─────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    initDispatcherLocation();
    runSplash();
    updateAll();

    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.addEventListener('click', () => { if (btn.dataset.target) navTo(btn.dataset.target); });
    });

    document.getElementById('btnStartStream').addEventListener('click', startStream);
    document.getElementById('btnStopStream').addEventListener('click', stopStream);

    // Filters
    document.getElementById('filterUrgency').addEventListener('change', renderFeed);
    document.getElementById('filterSource').addEventListener('change', renderFeed);
});
