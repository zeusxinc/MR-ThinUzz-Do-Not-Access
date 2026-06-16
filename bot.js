const express = require('express');
const fs = require('fs-extra');
const path = require('path');
const os = require('os');
const { exec } = require('child_process');
const router = express.Router();
const pino = require('pino');
const moment = require('moment-timezone');
const Jimp = require('jimp');
const crypto = require('crypto');
const axios = require('axios');
const { MongoClient } = require('mongodb');
const config = require('./settings');
const { connectdb, updb } = require('./lib/database');
const { sms, downloadMediaMessage } = require('./lib/msg');
const { activeSockets, socketCreationTime } = require('./lib/sessionStore');

// ========== SPEED OPTIMIZATIONS ==========
process.env.NODE_ENV = 'production';
const DEBUG = false;
if (!DEBUG) {
    console.log = function() {};
    console.info = function() {};
    console.debug = function() {};
}

const {
  default: makeWASocket,
  useMultiFileAuthState,
  delay,
  getContentType,
  makeCacheableSignalKeyStore,
  jidNormalizedUser,
  downloadContentFromMessage,
  DisconnectReason
} = require('baileyz');

const initNumberSystem = require('./lib/numberSystem'); 
const numberSystems = new Map();  

// ===== DATABASE =====
const MONGO_URI = config.MONGO_URI;
const MONGO_DB = config.MONGO_DB;

// ===== BASIC =====
const PREFIX = config.PREFIX;
const MAX_RETRIES = Number(config.MAX_RETRIES);

// ===== AUTO FEATURES =====
const AUTO_VIEW_STATUS = config.AUTO_VIEW_STATUS === 'true';
const AUTO_LIKE_STATUS = config.AUTO_LIKE_STATUS === 'true';
const AUTO_RECORDING = config.AUTO_RECORDING === 'true';
const AUTO_LIKE_EMOJI = config.AUTO_LIKE_EMOJI;
const WORK_TYPE = config.WORK_TYPE === 'private';

// ===== MEDIA / LINKS =====
const IMAGE_PATH = config.IMAGE_PATH;
const GROUP_INVITE_LINK = config.GROUP_INVITE_LINK;

// ===== NEWSLETTER =====
const NEWSLETTER_JID = config.NEWSLETTER_JID;

// ===== OTP =====
const OTP_EXPIRY = Number(config.OTP_EXPIRY);

// ===== BOT INFO =====
const BOT_NAME_FANCY = 'Ｚᴇᴜꜱ Ｘ Ｍᴅ ᴹᴵᴺᴵ';

// ===== CACHE =====
const userConfigCache = new Map();
const CACHE_TTL = 300000;
let OWNER_NUMBER_CACHE = null;

async function getCachedUserConfig(number) {
  const now = Date.now();
  const cached = userConfigCache.get(number);
  if (cached && (now - cached.timestamp) < CACHE_TTL) {
    return cached.data;
  }
  const data = await loadUserConfigFromMongo(number) || {};
  userConfigCache.set(number, { data, timestamp: now });
  return data;
}

// --------- LOAD PLUGINS ----------
const pluginsPath = path.join(__dirname, "plugins");
function loadPlugins() {
    if (!fs.existsSync(pluginsPath)) return;
    const files = fs.readdirSync(pluginsPath).filter(file => file.endsWith(".js"));
    for (const file of files) {
        try { 
            require(path.join(pluginsPath, file));
        } catch (err) {
            console.error("❌ Plugin error:", file, err);
        }
    }
}
loadPlugins();

// ---------------- MONGO SETUP ----------------
let mongoClient, mongoDB;
let sessionsCol, numbersCol, adminsCol, newsletterCol, configsCol, newsletterReactsCol;

async function initMongo() {
  try {
    if (mongoClient?.topology?.isConnected?.()) return;
  } catch(e){}
  
  mongoClient = new MongoClient(MONGO_URI, { 
    useNewUrlParser: true, 
    useUnifiedTopology: true, 
    maxPoolSize: 10,
    minPoolSize: 2,
    maxIdleTimeMS: 60000,
    connectTimeoutMS: 10000,
    socketTimeoutMS: 30000
  });
  
  await mongoClient.connect();
  mongoDB = mongoClient.db(MONGO_DB);

  sessionsCol = mongoDB.collection('sessions');
  numbersCol = mongoDB.collection('numbers');
  adminsCol = mongoDB.collection('admins');
  newsletterCol = mongoDB.collection('newsletter_list');
  configsCol = mongoDB.collection('configs');
  newsletterReactsCol = mongoDB.collection('newsletter_reacts');

  await Promise.all([
    sessionsCol.createIndex({ number: 1 }, { unique: true, background: true }),
    numbersCol.createIndex({ number: 1 }, { unique: true, background: true }),
    newsletterCol.createIndex({ jid: 1 }, { unique: true, background: true }),
    newsletterReactsCol.createIndex({ jid: 1 }, { unique: true, background: true }),
    configsCol.createIndex({ number: 1 }, { unique: true, background: true })
  ]);
  
  console.log('✅ MongoDB optimized');
}

// ---------------- Mongo helpers ----------------
async function saveCredsToMongo(number, creds, keys = null) {
  try {
    await initMongo();
    const sanitized = number.replace(/[^0-9]/g, '');
    const doc = { number: sanitized, creds, keys, updatedAt: new Date() };
    await sessionsCol.updateOne({ number: sanitized }, { $set: doc }, { upsert: true });
  } catch (e) { console.error('saveCredsToMongo error:', e); }
}

async function loadCredsFromMongo(number) {
  try {
    await initMongo();
    const sanitized = number.replace(/[^0-9]/g, '');
    const doc = await sessionsCol.findOne({ number: sanitized });
    return doc || null;
  } catch (e) { console.error('loadCredsFromMongo error:', e); return null; }
}

async function removeSessionFromMongo(number) {
  try {
    await initMongo();
    const sanitized = number.replace(/[^0-9]/g, '');
    await sessionsCol.deleteOne({ number: sanitized });
  } catch (e) { console.error('removeSessionToMongo error:', e); }
}

async function addNumberToMongo(number) {
  try {
    await initMongo();
    const sanitized = number.replace(/[^0-9]/g, '');
    await numbersCol.updateOne({ number: sanitized }, { $set: { number: sanitized } }, { upsert: true });
  } catch (e) { console.error('addNumberToMongo', e); }
}

async function removeNumberFromMongo(number) {
  try {
    await initMongo();
    const sanitized = number.replace(/[^0-9]/g, '');
    await numbersCol.deleteOne({ number: sanitized });
  } catch (e) { console.error('removeNumberFromMongo', e); }
}

async function getAllNumbersFromMongo() {
  try {
    await initMongo();
    const docs = await numbersCol.find({}).toArray();
    return docs.map(d => d.number);
  } catch (e) { console.error('getAllNumbersFromMongo', e); return []; }
}

async function loadAdminsFromMongo() {
  try {
    await initMongo();
    const docs = await adminsCol.find({}).toArray();
    return docs.map(d => d.jid || d.number).filter(Boolean);
  } catch (e) { console.error('loadAdminsFromMongo', e); return []; }
}

async function addAdminToMongo(jidOrNumber) {
  try {
    await initMongo();
    const doc = { jid: jidOrNumber };
    await adminsCol.updateOne({ jid: jidOrNumber }, { $set: doc }, { upsert: true });
  } catch (e) { console.error('addAdminToMongo', e); }
}

async function removeAdminFromMongo(jidOrNumber) {
  try {
    await initMongo();
    await adminsCol.deleteOne({ jid: jidOrNumber });
  } catch (e) { console.error('removeAdminFromMongo', e); }
}

async function addNewsletterToMongo(jid, emojis = []) {
  try {
    await initMongo();
    const doc = { jid, emojis: Array.isArray(emojis) ? emojis : [], addedAt: new Date() };
    await newsletterCol.updateOne({ jid }, { $set: doc }, { upsert: true });
  } catch (e) { console.error('addNewsletterToMongo', e); throw e; }
}

async function removeNewsletterFromMongo(jid) {
  try {
    await initMongo();
    await newsletterCol.deleteOne({ jid });
  } catch (e) { console.error('removeNewsletterFromMongo', e); throw e; }
}

async function listNewslettersFromMongo() {
  try {
    await initMongo();
    const docs = await newsletterCol.find({}).toArray();
    return docs.map(d => ({ jid: d.jid, emojis: Array.isArray(d.emojis) ? d.emojis : [] }));
  } catch (e) { console.error('listNewslettersFromMongo', e); return []; }
}

async function saveNewsletterReaction(jid, messageId, emoji, sessionNumber) {
  try {
    await initMongo();
    const doc = { jid, messageId, emoji, sessionNumber, ts: new Date() };
    if (!mongoDB) await initMongo();
    const col = mongoDB.collection('newsletter_reactions_log');
    await col.insertOne(doc);
  } catch (e) { console.error('saveNewsletterReaction', e); }
}

async function setUserConfigInMongo(number, conf) {
  try {
    await initMongo();
    const sanitized = number.replace(/[^0-9]/g, '');
    await configsCol.updateOne({ number: sanitized }, { $set: { number: sanitized, config: conf, updatedAt: new Date() } }, { upsert: true });
    userConfigCache.delete(sanitized);
  } catch (e) { console.error('setUserConfigInMongo', e); }
}

async function loadUserConfigFromMongo(number) {
  try {
    await initMongo();
    const sanitized = number.replace(/[^0-9]/g, '');
    const doc = await configsCol.findOne({ number: sanitized });
    return doc ? doc.config : null;
  } catch (e) { console.error('loadUserConfigFromMongo', e); return null; }
}

async function addNewsletterReactConfig(jid, emojis = []) {
  try {
    await initMongo();
    await newsletterReactsCol.updateOne({ jid }, { $set: { jid, emojis, addedAt: new Date() } }, { upsert: true });
  } catch (e) { console.error('addNewsletterReactConfig', e); throw e; }
}

async function removeNewsletterReactConfig(jid) {
  try {
    await initMongo();
    await newsletterReactsCol.deleteOne({ jid });
  } catch (e) { console.error('removeNewsletterReactConfig', e); throw e; }
}

async function listNewsletterReactsFromMongo() {
  try {
    await initMongo();
    const docs = await newsletterReactsCol.find({}).toArray();
    return docs.map(d => ({ jid: d.jid, emojis: Array.isArray(d.emojis) ? d.emojis : [] }));
  } catch (e) { console.error('listNewsletterReactsFromMongo', e); return []; }
}

async function getReactConfigForJid(jid) {
  try {
    await initMongo();
    const doc = await newsletterReactsCol.findOne({ jid });
    return doc ? (Array.isArray(doc.emojis) ? doc.emojis : []) : null;
  } catch (e) { console.error('getReactConfigForJid', e); return null; }
}

function formatMessage(title, content, footer) {
  return `${title}\n\n${content}\n\n${footer}`;
}
function generateOTP(){ return Math.floor(100000 + Math.random() * 900000).toString(); }
function getSriLankaTimestamp(){ return moment().tz('Asia/Colombo').format('YYYY-MM-DD HH:mm:ss'); }

const otpStore = new Map();

// ---------------- newsletter handlers ----------------
async function setupNewsletterHandlers(socket, sessionNumber) {
  const rrPointers = new Map();

  socket.ev.on('messages.upsert', async ({ messages }) => {
    const message = messages[0];
    if (!message?.key) return;
    const jid = message.key.remoteJid;

    try {
      const followedDocs = await listNewslettersFromMongo();
      const reactConfigs = await listNewsletterReactsFromMongo();
      const reactMap = new Map();
      for (const r of reactConfigs) reactMap.set(r.jid, r.emojis || []);

      const followedJids = followedDocs.map(d => d.jid);
      if (!followedJids.includes(jid) && !reactMap.has(jid)) return;

      let emojis = reactMap.get(jid) || null;
      if ((!emojis || emojis.length === 0) && followedDocs.find(d => d.jid === jid)) {
        emojis = (followedDocs.find(d => d.jid === jid).emojis || []);
      }
      if (!emojis || emojis.length === 0) emojis = config.AUTO_LIKE_EMOJI;

      let idx = rrPointers.get(jid) || 0;
      const emoji = emojis[idx % emojis.length];
      rrPointers.set(jid, (idx + 1) % emojis.length);

      const messageId = message.newsletterServerId || message.key.id;
      if (!messageId) return;

      let retries = 2;
      while (retries-- > 0) {
        try {
          if (typeof socket.newsletterReactMessage === 'function') {
            await socket.newsletterReactMessage(jid, messageId.toString(), emoji);
          } else {
            await socket.sendMessage(jid, { react: { text: emoji, key: message.key } });
          }
          await saveNewsletterReaction(jid, messageId.toString(), emoji, sessionNumber || null);
          break;
        } catch (err) {
          await delay(1200);
        }
      }
    } catch (error) {}
  });
}

// ---------------- status handlers ----------------
async function setupStatusHandlers(socket, sessionNumber) {
  socket.ev.on('messages.upsert', async ({ messages }) => {
    const message = messages[0];
    if (!message?.key || message.key.remoteJid !== 'status@broadcast' || !message.key.participant) return;
    
    try {
      let userEmojis = config.AUTO_LIKE_EMOJI;
      let autoViewStatus = config.AUTO_VIEW_STATUS;
      let autoLikeStatus = config.AUTO_LIKE_STATUS;
      let autoRecording = config.AUTO_RECORDING;
      
      if (sessionNumber) {
        const userConfig = await getCachedUserConfig(sessionNumber) || {};
        if (userConfig.AUTO_LIKE_EMOJI && Array.isArray(userConfig.AUTO_LIKE_EMOJI) && userConfig.AUTO_LIKE_EMOJI.length > 0) {
          userEmojis = userConfig.AUTO_LIKE_EMOJI;
        }
        if (userConfig.AUTO_VIEW_STATUS !== undefined) autoViewStatus = userConfig.AUTO_VIEW_STATUS;
        if (userConfig.AUTO_LIKE_STATUS !== undefined) autoLikeStatus = userConfig.AUTO_LIKE_STATUS;
        if (userConfig.AUTO_RECORDING !== undefined) autoRecording = userConfig.AUTO_RECORDING;
      }

      if (autoRecording === 'true') {
        await socket.sendPresenceUpdate("recording", message.key.remoteJid);
      }
      
      if (autoViewStatus === 'true') {
        let retries = config.MAX_RETRIES;
        while (retries > 0) {
          try { await socket.readMessages([message.key]); break; } 
          catch (error) { retries--; await delay(1000); if (retries===0) throw error; }
        }
      }
      
      if (autoLikeStatus === 'true') {
        const randomEmoji = userEmojis[Math.floor(Math.random() * userEmojis.length)];
        let retries = config.MAX_RETRIES;
        while (retries > 0) {
          try {
            await socket.sendMessage(message.key.remoteJid, { react: { text: randomEmoji, key: message.key } }, { statusJidList: [message.key.participant] });
            break;
          } catch (error) { retries--; await delay(1000); if (retries===0) throw error; }
        }
      }
    } catch (error) {}
  });
}

// ---------------- FAST message body extraction ----------------
async function extractMessageBodyFast(msg, sessionNumber) {
  if (!msg?.message) return '';
  
  try {
    let type = getContentType(msg.message);
    let body = '';
    
    switch (type) {
      case 'conversation': 
        body = msg.message.conversation; 
        break;
      case 'extendedTextMessage': 
        body = msg.message.extendedTextMessage?.text; 
        break;
      case 'imageMessage': 
      case 'videoMessage': 
        body = msg.message[type]?.caption; 
        break;
      case 'buttonsResponseMessage': 
        body = msg.message.buttonsResponseMessage?.selectedButtonId; 
        break;
      case 'listResponseMessage': 
        body = msg.message.listResponseMessage?.singleSelectReply?.selectedRowId; 
        break;
      default: 
        body = '';
    }
    
    return (typeof body === 'string' ? body : '').trim();
  } catch (err) {
    return '';
  }
}

// ---------------- OPTIMIZED command handler ----------------
const { findCommand } = require('./lib/commandMap');

function setupCommandHandlers(socket, number) {
  socket.ev.on('messages.upsert', async ({ messages }) => {
    try {
      const msg = messages[0];
      if (!msg?.message) return;
      
      const remoteJid = msg.key.remoteJid;
      if (remoteJid === 'status@broadcast' || remoteJid === config.NEWSLETTER_JID) return;

      if (msg.message.ephemeralMessage) {
        msg.message = msg.message.ephemeralMessage.message;
      }

      const from = remoteJid;
      const isGroup = from.endsWith('@g.us');
      const sender = msg.key.fromMe ? socket.user.id.split(':')[0] + '@s.whatsapp.net' : (msg.key.participant || from);
      const senderNumber = sender.split('@')[0];
      
      if (!OWNER_NUMBER_CACHE) {
        OWNER_NUMBER_CACHE = config.OWNER_NUMBER.replace(/[^0-9]/g, '');
      }
      const isOwner = senderNumber === OWNER_NUMBER_CACHE;

      const body = await extractMessageBodyFast(msg, number);
      if (!body) return;

      const prefix = config.PREFIX;
      if (!body.startsWith(prefix)) return;

      const args = body.slice(prefix.length).trim().split(/ +/);
      const command = args.shift()?.toLowerCase();
      if (!command) return;

      const cmdData = findCommand(command);
      if (!cmdData) return;

      if (cmdData.fromMe && !isOwner) return;

      const reply = (text, opt = {}) => socket.sendMessage(from, { text, ...opt }, { quoted: msg });

      cmdData.function(socket, msg, null, {
        from, prefix, body, command, args, q: args.join(' '),
        isGroup, isOwner, sender, senderNumber, 
        botNumber: socket.user.id.split(':')[0],
        pushname: msg.pushName || 'User', reply, config
      }).catch(err => {});

    } catch (err) {}
  });
}

// ---------------- call rejection ----------------
async function setupCallRejection(socket, sessionNumber) {
    socket.ev.on('call', async (calls) => {
        try {
            const sanitized = (sessionNumber || '').replace(/[^0-9]/g, '');
            const userConfig = await getCachedUserConfig(sanitized) || {};
            if (userConfig.ANTI_CALL !== 'on') return;
            for (const call of calls) {
                if (call.status !== 'offer') continue;
                await socket.rejectCall(call.id, call.from);
                await socket.sendMessage(call.from, { text: '*🔕 Auto call rejection is enabled*' });
            }
        } catch (err) {}
    });
}

// ---------------- cleanup ----------------
async function deleteSessionAndCleanup(number, socketInstance) {
  const sanitized = number.replace(/[^0-9]/g, '');
  try {
    const sessionPath = path.join(os.tmpdir(), `session_${sanitized}`);
    try { if (fs.existsSync(sessionPath)) fs.removeSync(sessionPath); } catch(e){}
    activeSockets.delete(sanitized); 
    socketCreationTime.delete(sanitized);
    try { await removeSessionFromMongo(sanitized); } catch(e){}
    try { await removeNumberFromMongo(sanitized); } catch(e){}
    userConfigCache.delete(sanitized);
  } catch (err) {}
}

// ---------------- auto-restart ----------------
function setupAutoRestart(socket, number) {
  socket.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect } = update;
    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode || lastDisconnect?.error?.statusCode;
      const isLoggedOut = statusCode === 401;
      if (isLoggedOut) {
        try { await deleteSessionAndCleanup(number, socket); } catch(e){}
      } else {
        try { 
          await delay(10000); 
          activeSockets.delete(number.replace(/[^0-9]/g,''));
          socketCreationTime.delete(number.replace(/[^0-9]/g,''));
          const mockRes = { headersSent:false, send:() => {}, status: () => mockRes };
          await EmpirePair(number, mockRes);
        } catch(e){}
      }
    }
  });
}

// ---------------- EmpirePair ----------------
async function EmpirePair(number, res) {
  const sanitizedNumber = number.replace(/[^0-9]/g, '');
  const sessionPath = path.join(os.tmpdir(), `session_${sanitizedNumber}`);
  await initMongo().catch(() => {});

  try {
    const mongoDoc = await loadCredsFromMongo(sanitizedNumber);
    if (mongoDoc && mongoDoc.creds) {
      fs.ensureDirSync(sessionPath);
      fs.writeFileSync(path.join(sessionPath, 'creds.json'), JSON.stringify(mongoDoc.creds, null, 2));
      if (mongoDoc.keys) fs.writeFileSync(path.join(sessionPath, 'keys.json'), JSON.stringify(mongoDoc.keys, null, 2));
    }
  } catch (e) {}

  const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
  const logger = pino({ level: 'fatal' });

  try {
    const socket = makeWASocket({
      auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, logger) },
      printQRInTerminal: false,
      logger,
      browser: ["Ubuntu", "Chrome", "20.0.04"],
      version: [2, 3000, 1015901307],
      defaultQueryTimeoutMs: 30000,
      keepAliveIntervalMs: 30000,
      retryRequestDelayMs: 200,
      generateHighQualityLinkPreview: false,
      syncFullHistory: false,
      markOnlineOnConnect: false,
    });

    const ns = initNumberSystem({ conn: socket, mongoDB, PREFIX: config.PREFIX });
    numberSystems.set(sanitizedNumber, ns);
    socketCreationTime.set(sanitizedNumber, Date.now());

    setupStatusHandlers(socket, sanitizedNumber);
    setupCommandHandlers(socket, sanitizedNumber);
    setupAutoRestart(socket, sanitizedNumber);
    setupNewsletterHandlers(socket, sanitizedNumber);
    setupCallRejection(socket, sanitizedNumber);

    if (!socket.authState.creds.registered) {
      let retries = config.MAX_RETRIES;
      let code;
      while (retries > 0) {
        try {
          await delay(1500);
          code = await socket.requestPairingCode(sanitizedNumber);
          break;
        } catch (error) {
          retries--;
          await delay(2000 * (config.MAX_RETRIES - retries));
        }
      }
      if (!res.headersSent) res.send({ code });
    }

    socket.ev.on('creds.update', async () => {
      try {
        await saveCreds();
        const credsPath = path.join(sessionPath, 'creds.json');
        if (!fs.existsSync(credsPath)) return;
        const fileStats = fs.statSync(credsPath);
        if (fileStats.size === 0) return;
        const fileContent = await fs.readFile(credsPath, 'utf8');
        const trimmedContent = fileContent.trim();
        if (!trimmedContent || trimmedContent === '{}' || trimmedContent === 'null') return;
        let credsObj;
        try { credsObj = JSON.parse(trimmedContent); } catch (e) { return; }
        if (!credsObj || typeof credsObj !== 'object') return;
        const keysObj = state.keys || null;
        await saveCredsToMongo(sanitizedNumber, credsObj, keysObj);
      } catch (err) {}
    });

    socket.ev.on('connection.update', async (update) => {
      const { connection } = update;
      if (connection === 'open') {
        try {
          await delay(3000);
          activeSockets.set(sanitizedNumber, socket);
          await addNumberToMongo(sanitizedNumber);
        } catch (e) {}
      }
      if (connection === 'close') {
        try { if (fs.existsSync(sessionPath)) fs.removeSync(sessionPath); } catch (e) {}
      }
    });
    activeSockets.set(sanitizedNumber, socket);
  } catch (error) {
    socketCreationTime.delete(sanitizedNumber);
    if (!res.headersSent) res.status(503).send({ error: 'Service Unavailable' });
  }
}

// ---------------- endpoints ----------------
router.post('/newsletter/add', async (req, res) => {
  const { jid, emojis } = req.body;
  if (!jid) return res.status(400).send({ error: 'jid required' });
  if (!jid.endsWith('@newsletter')) return res.status(400).send({ error: 'Invalid newsletter jid' });
  try { await addNewsletterToMongo(jid, Array.isArray(emojis) ? emojis : []); res.status(200).send({ status: 'ok', jid }); } 
  catch (e) { res.status(500).send({ error: e.message || e }); }
});

router.post('/newsletter/remove', async (req, res) => {
  const { jid } = req.body;
  if (!jid) return res.status(400).send({ error: 'jid required' });
  try { await removeNewsletterFromMongo(jid); res.status(200).send({ status: 'ok', jid }); } 
  catch (e) { res.status(500).send({ error: e.message || e }); }
});

router.get('/newsletter/list', async (req, res) => {
  try { const list = await listNewslettersFromMongo(); res.status(200).send({ status: 'ok', channels: list }); } 
  catch (e) { res.status(500).send({ error: e.message || e }); }
});

router.post('/admin/add', async (req, res) => {
  const { jid } = req.body;
  if (!jid) return res.status(400).send({ error: 'jid required' });
  try { await addAdminToMongo(jid); res.status(200).send({ status: 'ok', jid }); } 
  catch (e) { res.status(500).send({ error: e.message || e }); }
});

router.post('/admin/remove', async (req, res) => {
  const { jid } = req.body;
  if (!jid) return res.status(400).send({ error: 'jid required' });
  try { await removeAdminFromMongo(jid); res.status(200).send({ status: 'ok', jid }); } 
  catch (e) { res.status(500).send({ error: e.message || e }); }
});

router.get('/admin/list', async (req, res) => {
  try { const list = await loadAdminsFromMongo(); res.status(200).send({ status: 'ok', admins: list }); } 
  catch (e) { res.status(500).send({ error: e.message || e }); }
});

router.get('/', async (req, res) => {
  const { number } = req.query;
  if (!number) return res.status(400).send({ error: 'Number parameter is required' });
  if (activeSockets.has(number.replace(/[^0-9]/g, ''))) return res.status(200).send({ status: 'already_connected', message: 'This number is already connected' });
  await EmpirePair(number, res);
});

router.get('/active', (req, res) => {
  res.status(200).send({ botName: BOT_NAME_FANCY, count: activeSockets.size, numbers: Array.from(activeSockets.keys()), timestamp: getSriLankaTimestamp() });
});

router.get('/ping', (req, res) => {
  res.status(200).send({ status: 'active', botName: BOT_NAME_FANCY, activesession: activeSockets.size });
});

router.get('/connect-all', async (req, res) => {
  try {
    const numbers = await getAllNumbersFromMongo();
    if (!numbers || numbers.length === 0) return res.status(404).send({ error: 'No numbers found' });
    const results = [];
    for (const number of numbers) {
      if (activeSockets.has(number)) { results.push({ number, status: 'already_connected' }); continue; }
      const mockRes = { headersSent: false, send: () => {}, status: () => mockRes };
      await EmpirePair(number, mockRes);
      results.push({ number, status: 'connection_initiated' });
      await delay(500);
    }
    res.status(200).send({ status: 'success', connections: results });
  } catch (error) { res.status(500).send({ error: 'Failed to connect all bots' }); }
});

router.get('/update-config', async (req, res) => {
  const { number, config: configString } = req.query;
  if (!number || !configString) return res.status(400).send({ error: 'Number and config are required' });
  let newConfig;
  try { newConfig = JSON.parse(configString); } catch (error) { return res.status(400).send({ error: 'Invalid config format' }); }
  const sanitizedNumber = number.replace(/[^0-9]/g, '');
  const socket = activeSockets.get(sanitizedNumber);
  if (!socket) return res.status(404).send({ error: 'No active session found' });
  const otp = generateOTP();
  otpStore.set(sanitizedNumber, { otp, expiry: Date.now() + config.OTP_EXPIRY, newConfig });
  try { 
    await socket.sendMessage(jidNormalizedUser(socket.user.id), { text: formatMessage(`🔐 OTP`, `Your OTP is: *${otp}*`, BOT_NAME_FANCY) });
    res.status(200).send({ status: 'otp_sent', message: 'OTP sent' });
  } catch (error) { otpStore.delete(sanitizedNumber); res.status(500).send({ error: 'Failed to send OTP' }); }
});

router.get('/verify-otp', async (req, res) => {
  const { number, otp } = req.query;
  if (!number || !otp) return res.status(400).send({ error: 'Number and OTP are required' });
  const sanitizedNumber = number.replace(/[^0-9]/g, '');
  const storedData = otpStore.get(sanitizedNumber);
  if (!storedData) return res.status(400).send({ error: 'No OTP request found' });
  if (Date.now() >= storedData.expiry) { otpStore.delete(sanitizedNumber); return res.status(400).send({ error: 'OTP expired' }); }
  if (storedData.otp !== otp) return res.status(400).send({ error: 'Invalid OTP' });
  try {
    await setUserConfigInMongo(sanitizedNumber, storedData.newConfig);
    otpStore.delete(sanitizedNumber);
    res.status(200).send({ status: 'success', message: 'Config updated' });
  } catch (error) { res.status(500).send({ error: 'Failed to update config' }); }
});

// ---------------- cleanup ----------------
process.on('exit', () => {
  activeSockets.forEach((socket, number) => {
    try { socket.ws?.close(); } catch (e) {}
    activeSockets.delete(number);
    socketCreationTime.delete(number);
    try { fs.removeSync(path.join(os.tmpdir(), `session_${number}`)); } catch(e){}
  });
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
});

initMongo().catch(() => {});
(async()=>{ 
  try { 
    const nums = await getAllNumbersFromMongo(); 
    if (nums && nums.length) { 
      for (const n of nums) { 
        if (!activeSockets.has(n)) { 
          const mockRes = { headersSent:false, send:()=>{}, status:()=>mockRes }; 
          await EmpirePair(n, mockRes); 
          await delay(500); 
        } 
      } 
    } 
  } catch(e){} 
})();

(async () => {
  try {
    await connectdb();
    await updb();
    console.log("✅ Settings DB Synced");
  } catch (e) { console.error("Settings DB Error:", e); }
})();

module.exports = router;
