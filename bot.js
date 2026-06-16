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
const FileType = require('file-type');
const fetch = require('node-fetch');
const { MongoClient } = require('mongodb');
const config = require('./settings')
const { connectdb, updb } = require('./lib/database');
const { sms, downloadMediaMessage } = require('./lib/msg')
const { activeSockets, socketCreationTime } = require('./lib/sessionStore');

const {
  default: makeWASocket,
  useMultiFileAuthState,
  delay,
  getContentType,
  makeCacheableSignalKeyStore,
  Browsers,
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
const ADMIN_LIST_PATH = config.ADMIN_LIST_PATH;

// ===== AUTO FEATURES =====
const AUTO_AI = config.AUTO_AI === 'true';
const AUTO_VIEW_STATUS = config.AUTO_VIEW_STATUS === 'true';
const AUTO_LIKE_STATUS = config.AUTO_LIKE_STATUS === 'true';
const AUTO_RECORDING = config.AUTO_RECORDING === 'true';
const AUTO_LIKE_EMOJI = config.AUTO_LIKE_EMOJI;
const WORK_TYPE = config.WORK_TYPE === 'private';

// ===== MEDIA / LINKS =====
const IMAGE_PATH = config.IMAGE_PATH;
const CHANNEL_LINK = config.CHANNEL_LINK;
const GROUP_INVITE_LINK = config.GROUP_INVITE_LINK;

// ===== NEWSLETTER =====
const NEWSLETTER_JID = config.NEWSLETTER_JID;
const NEWSLETTER_MESSAGE_ID = config.NEWSLETTER_MESSAGE_ID;

// ===== OTP =====
const OTP_EXPIRY = Number(config.OTP_EXPIRY);

// ===== BOT INFO 
const BOT_NAME = config.BOT_NAME;
const OWNER_NAME = config.OWNER_NAME;
const OWNER_NUMBER = config.OWNER_NUMBER;
const OWNER_REACT = config.OWNER_REACT;
const BOT_VERSION = config.BOT_VERSION;
const BOT_FOOTER = config.BOT_FOOTER;
const BOT_NAME_FANCY = 'Ｚᴇᴜꜱ Ｘ Ｍᴅ ᴹᴵᴺᴵ';

// ===== PERFORMANCE =====
const COMMAND_TIMEOUT = 30000;
const CACHE_TTL = 60000;
const pendingConnections = new Map();
const eventHandlersStore = new Map();
const otpStore = new Map();
const commandCache = new Map();
const userConfigCache = new Map();

// ===== MONGO CONNECTION =====
let mongoClient, mongoDB;
let sessionsCol, numbersCol, adminsCol, newsletterCol, configsCol, newsletterReactsCol;
let mongoConnectionAttempts = 0;
const MAX_MONGO_RETRIES = 5;

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

// Auto-cleanup cache
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of userConfigCache.entries()) {
    if (now - value.timestamp > CACHE_TTL) {
      userConfigCache.delete(key);
    }
  }
}, CACHE_TTL);

// --------- LOAD PLUGINS ----------
const pluginsPath = path.join(__dirname, "plugins");
function loadPlugins() {
    if (!fs.existsSync(pluginsPath)) return;
    const files = fs.readdirSync(pluginsPath).filter(file => file.endsWith(".js"));
    for (const file of files) {
        try { require(path.join(pluginsPath, file));
            console.log("✅ Plugin loaded:", file);
        } catch (err) {
            console.error("❌ Plugin error:", file, err);
        }}}
loadPlugins();

// ---------------- MONGO SETUP WITH RETRY ----------------
async function initMongo() {
  try {
    if (mongoClient && mongoClient.topology && mongoClient.topology.isConnected && mongoClient.topology.isConnected()) {
      return mongoClient;
    }
    
    if (mongoClient && !mongoClient.topology?.isConnected?.()) {
      try { await mongoClient.close(); } catch(e) {}
      mongoClient = null;
    }
    
    console.log('🔄 Connecting to MongoDB...');
    mongoClient = new MongoClient(MONGO_URI, { 
      useNewUrlParser: true, 
      useUnifiedTopology: true, 
      maxPoolSize: 50,
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000,
      connectTimeoutMS: 10000,
    });
    
    await mongoClient.connect();
    mongoDB = mongoClient.db(MONGO_DB);

    sessionsCol = mongoDB.collection('sessions');
    numbersCol = mongoDB.collection('numbers');
    adminsCol = mongoDB.collection('admins');
    newsletterCol = mongoDB.collection('newsletter_list');
    configsCol = mongoDB.collection('configs');
    newsletterReactsCol = mongoDB.collection('newsletter_reacts');

    await sessionsCol.createIndex({ number: 1 }, { unique: true });
    await numbersCol.createIndex({ number: 1 }, { unique: true });
    await newsletterCol.createIndex({ jid: 1 }, { unique: true });
    await newsletterReactsCol.createIndex({ jid: 1 }, { unique: true });
    await configsCol.createIndex({ number: 1 }, { unique: true });
    
    console.log('✅ MongoDB connected successfully!');
    mongoConnectionAttempts = 0;
    return mongoClient;
    
  } catch (e) { 
    console.error('❌ MongoDB connection error:', e.message);
    mongoConnectionAttempts++;
    
    if (mongoConnectionAttempts < MAX_MONGO_RETRIES) {
      console.log(`🔄 Retrying MongoDB connection (${mongoConnectionAttempts}/${MAX_MONGO_RETRIES})...`);
      await delay(5000 * mongoConnectionAttempts);
      return initMongo();
    }
    
    throw new Error(`Failed to connect to MongoDB after ${MAX_MONGO_RETRIES} attempts`);
  }
}

// ---------------- Mongo helpers ----------------
async function saveCredsToMongo(number, creds, keys = null) {
  try {
    await initMongo();
    const sanitized = number.replace(/[^0-9]/g, '');
    const doc = { number: sanitized, creds, keys, updatedAt: new Date() };
    await sessionsCol.updateOne({ number: sanitized }, { $set: doc }, { upsert: true });
    console.log(`✅ Saved creds to Mongo for ${sanitized}`);
  } catch (e) { console.error('❌ saveCredsToMongo error:', e); }
}

async function loadCredsFromMongo(number) {
  try {
    await initMongo();
    const sanitized = number.replace(/[^0-9]/g, '');
    const doc = await sessionsCol.findOne({ number: sanitized });
    return doc || null;
  } catch (e) { console.error('❌ loadCredsFromMongo error:', e); return null; }
}

async function removeSessionFromMongo(number) {
  try {
    await initMongo();
    const sanitized = number.replace(/[^0-9]/g, '');
    await sessionsCol.deleteOne({ number: sanitized });
    console.log(`✅ Removed session from Mongo for ${sanitized}`);
  } catch (e) { console.error('❌ removeSessionToMongo error:', e); }
}

async function addNumberToMongo(number) {
  try {
    await initMongo();
    const sanitized = number.replace(/[^0-9]/g, '');
    await numbersCol.updateOne({ number: sanitized }, { $set: { number: sanitized, updatedAt: new Date() } }, { upsert: true });
    console.log(`✅ Added number ${sanitized} to Mongo numbers`);
  } catch (e) { console.error('❌ addNumberToMongo', e); }
}

async function removeNumberFromMongo(number) {
  try {
    await initMongo();
    const sanitized = number.replace(/[^0-9]/g, '');
    await numbersCol.deleteOne({ number: sanitized });
    console.log(`✅ Removed number ${sanitized} from Mongo numbers`);
  } catch (e) { console.error('❌ removeNumberFromMongo', e); }
}

async function getAllNumbersFromMongo() {
  try {
    await initMongo();
    const docs = await numbersCol.find({}).toArray();
    return docs.map(d => d.number);
  } catch (e) { console.error('❌ getAllNumbersFromMongo', e); return []; }
}

async function loadAdminsFromMongo() {
  try {
    await initMongo();
    const docs = await adminsCol.find({}).toArray();
    return docs.map(d => d.jid || d.number).filter(Boolean);
  } catch (e) { console.error('❌ loadAdminsFromMongo', e); return []; }
}

async function addAdminToMongo(jidOrNumber) {
  try {
    await initMongo();
    const doc = { jid: jidOrNumber, updatedAt: new Date() };
    await adminsCol.updateOne({ jid: jidOrNumber }, { $set: doc }, { upsert: true });
    console.log(`✅ Added admin ${jidOrNumber}`);
  } catch (e) { console.error('❌ addAdminToMongo', e); }
}

async function removeAdminFromMongo(jidOrNumber) {
  try {
    await initMongo();
    await adminsCol.deleteOne({ jid: jidOrNumber });
    console.log(`✅ Removed admin ${jidOrNumber}`);
  } catch (e) { console.error('❌ removeAdminFromMongo', e); }
}

async function addNewsletterToMongo(jid, emojis = []) {
  try {
    await initMongo();
    const doc = { jid, emojis: Array.isArray(emojis) ? emojis : [], addedAt: new Date() };
    await newsletterCol.updateOne({ jid }, { $set: doc }, { upsert: true });
    console.log(`✅ Added newsletter ${jid} -> emojis: ${doc.emojis.join(',')}`);
  } catch (e) { console.error('❌ addNewsletterToMongo', e); throw e; }
}

async function removeNewsletterFromMongo(jid) {
  try {
    await initMongo();
    await newsletterCol.deleteOne({ jid });
    console.log(`✅ Removed newsletter ${jid}`);
  } catch (e) { console.error('❌ removeNewsletterFromMongo', e); throw e; }
}

async function listNewslettersFromMongo() {
  try {
    await initMongo();
    const docs = await newsletterCol.find({}).toArray();
    return docs.map(d => ({ jid: d.jid, emojis: Array.isArray(d.emojis) ? d.emojis : [] }));
  } catch (e) { console.error('❌ listNewslettersFromMongo', e); return []; }
}

async function saveNewsletterReaction(jid, messageId, emoji, sessionNumber) {
  try {
    await initMongo();
    const doc = { jid, messageId, emoji, sessionNumber, ts: new Date() };
    if (!mongoDB) await initMongo();
    const col = mongoDB.collection('newsletter_reactions_log');
    await col.insertOne(doc);
    console.log(`✅ Saved reaction ${emoji} for ${jid}#${messageId}`);
  } catch (e) { console.error('❌ saveNewsletterReaction', e); }
}

async function setUserConfigInMongo(number, conf) {
  try {
    await initMongo();
    const sanitized = number.replace(/[^0-9]/g, '');
    await configsCol.updateOne({ number: sanitized }, { $set: { number: sanitized, config: conf, updatedAt: new Date() } }, { upsert: true });
    userConfigCache.delete(sanitized);
    console.log(`✅ Updated config for ${sanitized}`);
  } catch (e) { console.error('❌ setUserConfigInMongo', e); }
}

async function loadUserConfigFromMongo(number) {
  try {
    await initMongo();
    const sanitized = number.replace(/[^0-9]/g, '');
    const doc = await configsCol.findOne({ number: sanitized });
    return doc ? doc.config : null;
  } catch (e) { console.error('❌ loadUserConfigFromMongo', e); return null; }
}

async function addNewsletterReactConfig(jid, emojis = []) {
  try {
    await initMongo();
    await newsletterReactsCol.updateOne({ jid }, { $set: { jid, emojis, addedAt: new Date() } }, { upsert: true });
    console.log(`✅ Added react-config for ${jid} -> ${emojis.join(',')}`);
  } catch (e) { console.error('❌ addNewsletterReactConfig', e); throw e; }
}

async function removeNewsletterReactConfig(jid) {
  try {
    await initMongo();
    await newsletterReactsCol.deleteOne({ jid });
    console.log(`✅ Removed react-config for ${jid}`);
  } catch (e) { console.error('❌ removeNewsletterReactConfig', e); throw e; }
}

async function listNewsletterReactsFromMongo() {
  try {
    await initMongo();
    const docs = await newsletterReactsCol.find({}).toArray();
    return docs.map(d => ({ jid: d.jid, emojis: Array.isArray(d.emojis) ? d.emojis : [] }));
  } catch (e) { console.error('❌ listNewsletterReactsFromMongo', e); return []; }
}

function formatMessage(title, content, footer) {
  return `${title}\n\n${content}\n\n${footer}`;
}
function generateOTP(){ return Math.floor(100000 + Math.random() * 900000).toString(); }
function getSriLankaTimestamp(){ return moment().tz('Asia/Colombo').format('YYYY-MM-DD HH:mm:ss'); }

async function joinGroup(socket) {
  let retries = config.MAX_RETRIES;
  const inviteCodeMatch = (config.GROUP_INVITE_LINK || '').match(/chat\.whatsapp\.com\/([a-zA-Z0-9]+)/);
  if (!inviteCodeMatch) return { status: 'failed', error: 'No group invite configured' };
  const inviteCode = inviteCodeMatch[1];
  while (retries > 0) {
    try {
      const response = await socket.groupAcceptInvite(inviteCode);
      if (response?.gid) return { status: 'success', gid: response.gid };
      throw new Error('No group ID in response');
    } catch (error) {
      retries--;
      let errorMessage = error.message || 'Unknown error';
      if (error.message && error.message.includes('not-authorized')) errorMessage = 'Bot not authorized';
      else if (error.message && error.message.includes('conflict')) errorMessage = 'Already a member';
      else if (error.message && error.message.includes('gone')) errorMessage = 'Invite invalid/expired';
      if (retries === 0) return { status: 'failed', error: errorMessage };
      await delay(2000 * (config.MAX_RETRIES - retries));
    }
  }
  return { status: 'failed', error: 'Max retries reached' };
}

async function sendAdminConnectMessage(socket, number, groupResult, sessionConfig = {}) {
  const admins = await loadAdminsFromMongo();
  const groupStatus = groupResult.status === 'success' ? `Joined (ID: ${groupResult.gid})` : `Failed to join group: ${groupResult.error}`;
  const botName = sessionConfig.botName || BOT_NAME_FANCY;
  const image = sessionConfig.logo || config.IMAGE_PATH;
  const caption = formatMessage(botName, `*📞 Number :* ${number}\n*🍁 Status:* ${groupStatus}\n*🕒 Connected At:* ${getSriLankaTimestamp()}`, config.BOT_FOOTER);
  for (const admin of admins) {
    try {
      const to = admin.includes('@') ? admin : `${admin}@s.whatsapp.net`;
      if (String(image).startsWith('http')) {
        await socket.sendMessage(to, { image: { url: image }, caption });
      } else {
        try {
          const buf = await fs.readFile(image);
          await socket.sendMessage(to, { image: buf, caption });
        } catch (e) {
          await socket.sendMessage(to, { image: { url: config.IMAGE_PATH }, caption });
        }
      }
    } catch (err) {
      console.error('Failed to send connect message to admin', admin, err?.message || err);
    }
  }
}

async function sendOwnerConnectMessage(socket, number, groupResult, sessionConfig = {}) {
  try {
    const ownerJid = `${config.OWNER_NUMBER.replace(/[^0-9]/g,'')}@s.whatsapp.net`;
    const activeCount = activeSockets.size;
    const botName = sessionConfig.botName || BOT_NAME_FANCY;
    const image = sessionConfig.logo || config.IMAGE_PATH;
    const groupStatus = groupResult.status === 'success' ? `Joined (ID: ${groupResult.gid})` : `Failed to join group: ${groupResult.error}`;
    const caption = formatMessage(`*👨‍💻 Owner Name:* ${config.OWNER_NAME}`, `*📞 Number:* ${number}\n*🍁 Status:* ${groupStatus}\n*🕒 Connected At:* ${getSriLankaTimestamp()}\n\n*🔢 Active Session:* ${activeCount}`, config.BOT_FOOTER);
    if (String(image).startsWith('http')) {
      await socket.sendMessage(ownerJid, { image: { url: image }, caption });
    } else {
      try {
        const buf = await fs.readFile(image);
        await socket.sendMessage(ownerJid, { image: buf, caption });
      } catch (e) {
        await socket.sendMessage(ownerJid, { image: { url: config.IMAGE_PATH }, caption });
      }
    }
  } catch (err) { console.error('Failed to send owner connect message:', err); }
}

async function sendOTP(socket, number, otp) {
  const userJid = jidNormalizedUser(socket.user.id);
  const message = formatMessage(`*🔐 Otp Veryfication — ${BOT_NAME_FANCY}*`, `*𝐘𝚄𝚁 𝐎𝚃𝙿 𝐅𝙾𝚁 𝐂𝙾𝙽𝙵𝙸𝙶 𝐔𝙿𝙳𝙰𝚃𝙴 𝐈𝚂:* *${otp}*\n𝐓𝙷𝙸𝚂 𝐎𝚃𝙿 𝐖𝙸𝙻𝙻 𝐄𝚇𝙿𝙸𝚁𝙴 𝐈𝙽 5 𝐌𝙸𝙽𝚄𝚃𝙴𝚂.\n\n*𝐍𝚄𝙼𝙱𝙴𝚁:* ${number}`, BOT_NAME_FANCY);
  try { await socket.sendMessage(userJid, { text: message }); console.log(`✅ OTP ${otp} sent to ${number}`); }
  catch (error) { console.error(`❌ Failed to send OTP to ${number}:`, error); throw error; }
}

// ==================== FAST SYNC MESSAGE EXTRACTOR ====================
function extractMessageBodySync(msg) {
  if (!msg || !msg.message) return '';
  try {
    const type = getContentType(msg.message);
    let body = '';
    switch (type) {
      case 'conversation': body = msg.message.conversation || ''; break;
      case 'extendedTextMessage': body = msg.message.extendedTextMessage?.text || ''; break;
      case 'imageMessage': body = msg.message.imageMessage?.caption || ''; break;
      case 'videoMessage': body = msg.message.videoMessage?.caption || ''; break;
      case 'buttonsResponseMessage': body = msg.message.buttonsResponseMessage?.selectedButtonId || ''; break;
      case 'listResponseMessage': body = msg.message.listResponseMessage?.singleSelectReply?.selectedRowId || ''; break;
      case 'viewOnceMessage': body = msg.message.viewOnceMessage?.message?.conversation || ''; break;
      case 'viewOnceMessageV2': body = msg.message.viewOnceMessageV2?.message?.imageMessage?.caption || msg.message.viewOnceMessageV2?.message?.videoMessage?.caption || ''; break;
      default:
        if (msg.message.conversation) body = msg.message.conversation;
        else if (msg.message.extendedTextMessage?.text) body = msg.message.extendedTextMessage.text;
        break;
    }
    return typeof body === 'string' ? body.trim() : '';
  } catch (err) { return ''; }
}

// ==================== COMMAND HANDLER ====================
const { findCommand } = require('./lib/commandMap');
const { commands } = require('./lib/command');

function setupCommandHandlers(socket, number) {
  if (eventHandlersStore.has(`cmd_${number}`)) {
    const oldHandler = eventHandlersStore.get(`cmd_${number}`);
    socket.ev.off('messages.upsert', oldHandler);
  }

  const commandHandler = async ({ messages }) => {
    try {
      const msg = messages[0];
      if (!msg || !msg.message) return;
      
      const remoteJid = msg.key.remoteJid;
      if (remoteJid === 'status@broadcast' || remoteJid === config.NEWSLETTER_JID) return;

      if (getContentType(msg.message) === 'ephemeralMessage') {
        msg.message = msg.message.ephemeralMessage.message;
      }

      const from = msg.key.remoteJid;
      const isGroup = from.endsWith('@g.us');
      const sender = msg.key.fromMe ? socket.user.id.split(':')[0] + '@s.whatsapp.net' : (msg.key.participant || from);
      const senderNumber = sender.split('@')[0];
      const cleanSender = senderNumber.replace(/[^0-9]/g, '');
      const cleanOwner = config.OWNER_NUMBER.replace(/[^0-9]/g, '');
      const isOwner = cleanSender === cleanOwner;

      const body = extractMessageBodySync(msg);
      if (!body) return;

      const prefix = config.PREFIX;
      if (!body.startsWith(prefix)) return;

      const args = body.slice(prefix.length).trim().split(/ +/);
      const command = args.shift()?.toLowerCase();
      if (!command) return;

      const cmdData = findCommand(command);
      if (!cmdData) return;
      if (cmdData.fromMe && !isOwner) return;

      // Send typing indicator IMMEDIATELY
      socket.sendPresenceUpdate('composing', from).catch(() => {});

      const reply = (text, opt = {}) => {
        return socket.sendMessage(from, { text, ...opt }, { quoted: msg })
          .catch(err => console.error('Reply error:', err));
      };

      const commandPromise = cmdData.function(socket, msg, null, {
        from, prefix, body, command, args, q: args.join(' '),
        isGroup, isOwner, sender, senderNumber, 
        botNumber: socket.user.id.split(':')[0],
        pushname: msg.pushName || 'User', 
        reply, 
        config
      });

      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Command timeout')), COMMAND_TIMEOUT);
      });

      Promise.race([commandPromise, timeoutPromise])
        .then(() => {
          socket.sendPresenceUpdate('paused', from).catch(() => {});
        })
        .catch((err) => {
          socket.sendPresenceUpdate('paused', from).catch(() => {});
          if (err.message === 'Command timeout') {
            reply('⏰ Command execution timed out. Please try again.');
          } else {
            console.error('Command error:', err);
            reply('❌ An error occurred while executing the command.');
          }
        });

    } catch (err) {
      console.error('❌ Command Handler Error:', err);
    }
  };
  
  socket.ev.on('messages.upsert', commandHandler);
  eventHandlersStore.set(`cmd_${number}`, commandHandler);
}

// ==================== TYPING INDICATOR ====================
function setupTypingIndicator(socket, sessionNumber) {
  if (eventHandlersStore.has(`typing_${sessionNumber}`)) {
    const oldHandler = eventHandlersStore.get(`typing_${sessionNumber}`);
    socket.ev.off('messages.upsert', oldHandler);
  }

  const typingHandler = async ({ messages }) => {
    try {
      const msg = messages[0];
      if (!msg || !msg.message) return;
      
      const remoteJid = msg.key.remoteJid;
      if (remoteJid === 'status@broadcast' || remoteJid === config.NEWSLETTER_JID) return;

      const body = extractMessageBodySync(msg);
      if (!body || !body.startsWith(config.PREFIX)) return;

      const from = msg.key.remoteJid;
      await socket.sendPresenceUpdate('composing', from);
      
      setTimeout(async () => {
        try { await socket.sendPresenceUpdate('paused', from); } catch (e) {}
      }, 2000);
      
    } catch (err) {}
  };
  
  socket.ev.on('messages.upsert', typingHandler);
  eventHandlersStore.set(`typing_${sessionNumber}`, typingHandler);
}

// ==================== NEWSLETTER HANDLERS ====================
async function setupNewsletterHandlers(socket, sessionNumber) {
  if (eventHandlersStore.has(`newsletter_${sessionNumber}`)) {
    const oldHandler = eventHandlersStore.get(`newsletter_${sessionNumber}`);
    socket.ev.off('messages.upsert', oldHandler);
  }

  const rrPointers = new Map();
  const newsletterHandler = async ({ messages }) => {
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

      let retries = 3;
      while (retries-- > 0) {
        try {
          if (typeof socket.newsletterReactMessage === 'function') {
            await socket.newsletterReactMessage(jid, messageId.toString(), emoji);
          } else {
            await socket.sendMessage(jid, { react: { text: emoji, key: message.key } });
          }
          console.log(`✅ Reacted to ${jid} ${messageId} with ${emoji}`);
          await saveNewsletterReaction(jid, messageId.toString(), emoji, sessionNumber || null);
          break;
        } catch (err) {
          console.warn(`Reaction attempt failed (${3 - retries}/3):`, err?.message || err);
          await delay(1200);
        }
      }
    } catch (error) {
      console.error('Newsletter reaction handler error:', error?.message || error);
    }
  };
  
  socket.ev.on('messages.upsert', newsletterHandler);
  eventHandlersStore.set(`newsletter_${sessionNumber}`, newsletterHandler);
}

// ==================== STATUS HANDLERS ====================
async function setupStatusHandlers(socket, sessionNumber) {
  if (eventHandlersStore.has(`status_${sessionNumber}`)) {
    const oldHandler = eventHandlersStore.get(`status_${sessionNumber}`);
    socket.ev.off('messages.upsert', oldHandler);
  }

  const statusHandler = async ({ messages }) => {
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
    } catch (error) { console.error('Status handler error:', error); }
  };
  
  socket.ev.on('messages.upsert', statusHandler);
  eventHandlersStore.set(`status_${sessionNumber}`, statusHandler);
}

async function handleMessageRevocation(socket, number) {
  if (eventHandlersStore.has(`revoke_${number}`)) {
    const oldHandler = eventHandlersStore.get(`revoke_${number}`);
    socket.ev.off('messages.delete', oldHandler);
  }

  const revokeHandler = async ({ keys }) => {
    if (!keys || keys.length === 0) return;
    const messageKey = keys[0];
    const userJid = jidNormalizedUser(socket.user.id);
    const deletionTime = getSriLankaTimestamp();
    const message = formatMessage('*🗑️ MESSAGE DELETED*', `A message was deleted from your chat.\n*📋 FROM:* ${messageKey.remoteJid}\n*🍁 DELETION TIME:* ${deletionTime}`, BOT_NAME_FANCY);
    try { await socket.sendMessage(userJid, { image: { url: config.IMAGE_PATH }, caption: message }); }
    catch (error) { console.error('Failed to send deletion notification:', error); }
  };
  
  socket.ev.on('messages.delete', revokeHandler);
  eventHandlersStore.set(`revoke_${number}`, revokeHandler);
}

async function resize(image, width, height) {
  let oyy = await Jimp.read(image);
  return await oyy.resize(width, height).getBufferAsync(Jimp.MIME_JPEG);
}

// ==================== CALL REJECTION ====================
async function setupCallRejection(socket, sessionNumber) {
  if (eventHandlersStore.has(`call_${sessionNumber}`)) {
    const oldHandler = eventHandlersStore.get(`call_${sessionNumber}`);
    socket.ev.off('call', oldHandler);
  }

  const callHandler = async (calls) => {
    try {
      const sanitized = (sessionNumber || '').replace(/[^0-9]/g, '');
      const userConfig = await getCachedUserConfig(sanitized) || {};
      if (userConfig.ANTI_CALL !== 'on') return;
      console.log(`📞 Incoming call detected for ${sanitized} - Auto rejecting...`);
      for (const call of calls) {
        if (call.status !== 'offer') continue;
        await socket.rejectCall(call.id, call.from);
        await socket.sendMessage(call.from, { text: '*🔕 Auto call rejection is enabled. Calls are automatically rejected.*' });
        console.log(`✅ Auto-rejected call from ${call.from}`);
        const userJid = jidNormalizedUser(socket.user.id);
        const rejectionMessage = formatMessage('📞 CALL REJECTED', `Auto call rejection is active.\n\nCall from: ${call.from}\nTime: ${getSriLankaTimestamp()}`, BOT_NAME_FANCY);
        await socket.sendMessage(userJid, { image: { url: config.IMAGE_PATH }, caption: rejectionMessage });
      }
    } catch (err) { console.error(`Call rejection error for ${sessionNumber}:`, err); }
  };
  
  socket.ev.on('call', callHandler);
  eventHandlersStore.set(`call_${sessionNumber}`, callHandler);
}

// ==================== AUTO MESSAGE READ ====================
async function setupAutoMessageRead(socket, sessionNumber) {
  if (eventHandlersStore.has(`autoread_${sessionNumber}`)) {
    const oldHandler = eventHandlersStore.get(`autoread_${sessionNumber}`);
    socket.ev.off('messages.upsert', oldHandler);
  }

  const autoReadHandler = async ({ messages }) => {
    const msg = messages[0];
    if (!msg || !msg.message || msg.key.remoteJid === 'status@broadcast' || msg.key.remoteJid === config.NEWSLETTER_JID) return;
    const sanitized = (sessionNumber || '').replace(/[^0-9]/g, '');
    const userConfig = await getCachedUserConfig(sanitized) || {};
    const autoReadSetting = userConfig.AUTO_READ_MESSAGE || 'off';
    if (autoReadSetting === 'off') return;
    let body = '';
    try {
      const type = getContentType(msg.message);
      const actualMsg = (type === 'ephemeralMessage') ? msg.message.ephemeralMessage.message : msg.message;
      if (type === 'conversation') body = actualMsg.conversation || '';
      else if (type === 'extendedTextMessage') body = actualMsg.extendedTextMessage?.text || '';
      else if (type === 'imageMessage') body = actualMsg.imageMessage?.caption || '';
      else if (type === 'videoMessage') body = actualMsg.videoMessage?.caption || '';
    } catch (e) { body = ''; }
    const prefix = userConfig.PREFIX || config.PREFIX;
    const isCmd = body && body.startsWith && body.startsWith(prefix);
    if (autoReadSetting === 'all' || (autoReadSetting === 'cmd' && isCmd)) {
      try { await socket.readMessages([msg.key]); console.log(`✅ Message read: ${msg.key.id}`); } 
      catch (error) { console.warn('Failed to read message:', error?.message); }
    }
  };
  
  socket.ev.on('messages.upsert', autoReadHandler);
  eventHandlersStore.set(`autoread_${sessionNumber}`, autoReadHandler);
}

// ==================== MESSAGE HANDLERS ====================
async function setupMessageHandlers(socket, sessionNumber) {
  if (eventHandlersStore.has(`msg_${sessionNumber}`)) {
    const oldHandler = eventHandlersStore.get(`msg_${sessionNumber}`);
    socket.ev.off('messages.upsert', oldHandler);
  }

  const msgHandler = async ({ messages }) => {
    try {
      const msg = messages[0];
      if (!msg || !msg.message || msg.key.remoteJid === 'status@broadcast' || msg.key.remoteJid === config.NEWSLETTER_JID) return;
      const msgType = getContentType(msg.message);
      const message = msgType === 'ephemeralMessage' ? msg.message.ephemeralMessage.message : msg.message;
      const from = msg.key.remoteJid;
      const sanitized = (sessionNumber || '').replace(/[^0-9]/g, '');
      const userConfig = await getCachedUserConfig(sanitized) || {};
      const autoTyping = userConfig.AUTO_TYPING !== undefined ? userConfig.AUTO_TYPING : config.AUTO_TYPING;
      const autoRecording = userConfig.AUTO_RECORDING !== undefined ? userConfig.AUTO_RECORDING : config.AUTO_RECORDING;
      if (autoTyping === 'true') {
        try {
          await socket.sendPresenceUpdate('composing', from);
          setTimeout(async () => { try { await socket.sendPresenceUpdate('paused', from); } catch {} }, 2500);
        } catch (e) { console.error('Auto typing error:', e); }
      }
      if (autoRecording === 'true') {
        try {
          await socket.sendPresenceUpdate('recording', from);
          setTimeout(async () => { try { await socket.sendPresenceUpdate('paused', from); } catch {} }, 2500);
        } catch (e) { console.error('Auto recording error:', e); }
      }
    } catch (err) { console.error('setupMessageHandlers error:', err); }
  };
  
  socket.ev.on('messages.upsert', msgHandler);
  eventHandlersStore.set(`msg_${sessionNumber}`, msgHandler);
}

// ==================== CLEANUP ====================
async function deleteSessionAndCleanup(number, socketInstance) {
  const sanitized = number.replace(/[^0-9]/g, '');
  try {
    const handlersToRemove = [];
    for (const [key] of eventHandlersStore.entries()) {
      if (key.includes(sanitized)) {
        handlersToRemove.push(key);
      }
    }
    for (const key of handlersToRemove) {
      eventHandlersStore.delete(key);
    }
    
    const sessionPath = path.join(os.tmpdir(), `session_${sanitized}`);
    try { if (fs.existsSync(sessionPath)) await fs.remove(sessionPath); } catch(e){}
    activeSockets.delete(sanitized); 
    socketCreationTime.delete(sanitized);
    pendingConnections.delete(sanitized);
    numberSystems.delete(sanitized);
    otpStore.delete(sanitized);
    
    try { await removeSessionFromMongo(sanitized); } catch(e){}
    try { await removeNumberFromMongo(sanitized); } catch(e){}
    userConfigCache.delete(sanitized);
    
    try {
      const ownerJid = `${config.OWNER_NUMBER.replace(/[^0-9]/g,'')}@s.whatsapp.net`;
      const caption = formatMessage('*🥷 OWNER NOTICE — SESSION REMOVED*', `*𝐍umber:* ${sanitized}\n*𝐒ession 𝐑emoved 𝐃ue 𝐓o 𝐋ogout.*\n\n*𝐀ctive 𝐒essions 𝐍ow:* ${activeSockets.size}`, BOT_NAME_FANCY);
      if (socketInstance && socketInstance.sendMessage) await socketInstance.sendMessage(ownerJid, { image: { url: config.IMAGE_PATH }, caption });
    } catch(e){}
    console.log(`✅ Cleanup completed for ${sanitized}`);
  } catch (err) { console.error('❌ deleteSessionAndCleanup error:', err); }
}

// ==================== AUTO-RESTART ====================
function setupAutoRestart(socket, number) {
  if (eventHandlersStore.has(`restart_${number}`)) {
    const oldHandler = eventHandlersStore.get(`restart_${number}`);
    socket.ev.off('connection.update', oldHandler);
  }

  const restartHandler = async (update) => {
    const { connection, lastDisconnect } = update;
    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode || lastDisconnect?.error?.statusCode || (lastDisconnect?.error && lastDisconnect.error.toString().includes('401') ? 401 : undefined);
      const isLoggedOut = statusCode === 401 || (lastDisconnect?.error && lastDisconnect.error.code === 'AUTHENTICATION') || (lastDisconnect?.error && String(lastDisconnect.error).toLowerCase().includes('logged out')) || (lastDisconnect?.reason === DisconnectReason?.loggedOut);
      if (isLoggedOut) {
        console.log(`User ${number} logged out. Cleaning up...`);
        try { await deleteSessionAndCleanup(number, socket); } catch(e){ console.error(e); }
      } else {
        console.log(`Connection closed for ${number} (not logout). Attempt reconnect...`);
        try { 
          await delay(10000); 
          const sanitized = number.replace(/[^0-9]/g,'');
          activeSockets.delete(sanitized); 
          socketCreationTime.delete(sanitized);
          pendingConnections.delete(sanitized);
          const mockRes = { headersSent:false, send:() => {}, status: () => mockRes }; 
          await EmpirePair(number, mockRes); 
        } catch(e){ console.error('Reconnect attempt failed', e); }
      }
    }
  };
  
  socket.ev.on('connection.update', restartHandler);
  eventHandlersStore.set(`restart_${number}`, restartHandler);
}

// ==================== EMPIRE PAIR ====================
async function EmpirePair(number, res) {
  const sanitizedNumber = number.replace(/[^0-9]/g, '');
  
  if (pendingConnections.has(sanitizedNumber)) {
    console.log(`⏳ Connection already in progress for ${sanitizedNumber}`);
    return pendingConnections.get(sanitizedNumber);
  }
  
  if (activeSockets.has(sanitizedNumber)) {
    console.log(`✅ Already connected for ${sanitizedNumber}`);
    return activeSockets.get(sanitizedNumber);
  }
  
  const promise = (async () => {
    try {
      await initMongo();
    } catch (error) {
      console.error('❌ MongoDB connection failed:', error.message);
      if (!res.headersSent && res.status) {
        res.status(503).json({ 
          error: 'Service Unavailable', 
          details: 'Database connection failed. Please try again later.',
          code: 'DB_ERROR'
        });
      }
      throw error;
    }
    
    const sessionPath = path.join(os.tmpdir(), `session_${sanitizedNumber}`);

    try {
      const mongoDoc = await loadCredsFromMongo(sanitizedNumber);
      if (mongoDoc && mongoDoc.creds) {
        await fs.ensureDir(sessionPath);
        await fs.writeFile(path.join(sessionPath, 'creds.json'), JSON.stringify(mongoDoc.creds, null, 2));
        if (mongoDoc.keys) await fs.writeFile(path.join(sessionPath, 'keys.json'), JSON.stringify(mongoDoc.keys, null, 2));
        console.log('✅ Prefilled creds from Mongo');
      }
    } catch (e) { console.warn('⚠️ Prefill from Mongo failed:', e.message); }

    const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
    const logger = pino({ level: process.env.NODE_ENV === 'production' ? 'fatal' : 'debug' });

    try {
      const socket = makeWASocket({
        auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, logger) },
        printQRInTerminal: false,
        logger,
        browser: ["Ubuntu", "Chrome", "20.0.04"],
        generateHighQualityLinkPreview: false,
        markOnlineOnConnect: false,
        syncFullHistory: false,
        patchMessageBeforeSending: false
      });

      const ns = initNumberSystem({ conn: socket, mongoDB, PREFIX: config.PREFIX });
      numberSystems.set(sanitizedNumber, ns);
      socketCreationTime.set(sanitizedNumber, Date.now());

      // Setup handlers - ORDER MATTERS
      setupTypingIndicator(socket, sanitizedNumber);
      setupCommandHandlers(socket, sanitizedNumber);
      setupStatusHandlers(socket, sanitizedNumber);
      setupMessageHandlers(socket, sanitizedNumber);
      setupAutoRestart(socket, sanitizedNumber);
      setupNewsletterHandlers(socket, sanitizedNumber);
      handleMessageRevocation(socket, sanitizedNumber);
      setupAutoMessageRead(socket, sanitizedNumber);
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
            if (retries === 0) throw error;
          }
        }
        if (!res.headersSent && res.json) {
          res.json({ code });
        }
      }

      // Creds update
      if (eventHandlersStore.has(`creds_${sanitizedNumber}`)) {
        const oldHandler = eventHandlersStore.get(`creds_${sanitizedNumber}`);
        socket.ev.off('creds.update', oldHandler);
      }

      const credsHandler = async () => {
        try {
          await saveCreds();
          const credsPath = path.join(sessionPath, 'creds.json');
          if (!fs.existsSync(credsPath)) return;
          const fileStats = await fs.stat(credsPath);
          if (fileStats.size === 0) return;
          const fileContent = await fs.readFile(credsPath, 'utf8');
          const trimmedContent = fileContent.trim();
          if (!trimmedContent || trimmedContent === '{}' || trimmedContent === 'null') return;
          let credsObj;
          try { credsObj = JSON.parse(trimmedContent); } catch (e) { return; }
          if (!credsObj || typeof credsObj !== 'object') return;
          const keysObj = state.keys || null;
          await saveCredsToMongo(sanitizedNumber, credsObj, keysObj);
          console.log('✅ Creds saved to MongoDB successfully');
        } catch (err) { console.error('❌ Failed saving creds on creds.update:', err); }
      };
      
      socket.ev.on('creds.update', credsHandler);
      eventHandlersStore.set(`creds_${sanitizedNumber}`, credsHandler);

      // Connection update
      if (eventHandlersStore.has(`conn_${sanitizedNumber}`)) {
        const oldHandler = eventHandlersStore.get(`conn_${sanitizedNumber}`);
        socket.ev.off('connection.update', oldHandler);
      }

      const connHandler = async (update) => {
        const { connection } = update;
        if (connection === 'open') {
          try {
            await delay(3000);
            const groupResult = await joinGroup(socket).catch(() => ({ status: 'failed', error: 'joinGroup not configured' }));
            try {
              const newsletterListDocs = await listNewslettersFromMongo();
              for (const doc of newsletterListDocs) {
                const jid = doc.jid;
                try { if (typeof socket.newsletterFollow === 'function') await socket.newsletterFollow(jid); } catch (e) {}
              }
            } catch (e) {}
            activeSockets.set(sanitizedNumber, socket);
            await addNumberToMongo(sanitizedNumber);
            console.log(`✅ Bot connected for ${sanitizedNumber}`);
          } catch (e) { console.error('Connection open error:', e); }
        }
        if (connection === 'close') {
          try { if (fs.existsSync(sessionPath)) await fs.remove(sessionPath); } catch (e) {}
        }
      };
      
      socket.ev.on('connection.update', connHandler);
      eventHandlersStore.set(`conn_${sanitizedNumber}`, connHandler);
      
      activeSockets.set(sanitizedNumber, socket);
      pendingConnections.delete(sanitizedNumber);
      return socket;
      
    } catch (error) {
      console.error('❌ Pairing error:', error);
      socketCreationTime.delete(sanitizedNumber);
      pendingConnections.delete(sanitizedNumber);
      if (!res.headersSent && res.status) {
        res.status(503).json({ 
          error: 'Service Unavailable', 
          details: error.message || 'Failed to create session',
          code: 'SESSION_ERROR'
        });
      }
      throw error;
    }
  })();
  
  pendingConnections.set(sanitizedNumber, promise);
  try {
    const result = await promise;
    return result;
  } finally {
    pendingConnections.delete(sanitizedNumber);
  }
}

// ==================== ENDPOINTS ====================
router.post('/newsletter/add', async (req, res) => {
  const { jid, emojis } = req.body;
  if (!jid) return res.status(400).json({ error: 'jid required' });
  if (!jid.endsWith('@newsletter')) return res.status(400).json({ error: 'Invalid newsletter jid' });
  try { await addNewsletterToMongo(jid, Array.isArray(emojis) ? emojis : []); res.status(200).json({ status: 'ok', jid }); } 
  catch (e) { res.status(500).json({ error: e.message || e }); }
});

router.post('/newsletter/remove', async (req, res) => {
  const { jid } = req.body;
  if (!jid) return res.status(400).json({ error: 'jid required' });
  try { await removeNewsletterFromMongo(jid); res.status(200).json({ status: 'ok', jid }); } 
  catch (e) { res.status(500).json({ error: e.message || e }); }
});

router.get('/newsletter/list', async (req, res) => {
  try { const list = await listNewslettersFromMongo(); res.status(200).json({ status: 'ok', channels: list }); } 
  catch (e) { res.status(500).json({ error: e.message || e }); }
});

router.post('/admin/add', async (req, res) => {
  const { jid } = req.body;
  if (!jid) return res.status(400).json({ error: 'jid required' });
  try { await addAdminToMongo(jid); res.status(200).json({ status: 'ok', jid }); } 
  catch (e) { res.status(500).json({ error: e.message || e }); }
});

router.post('/admin/remove', async (req, res) => {
  const { jid } = req.body;
  if (!jid) return res.status(400).json({ error: 'jid required' });
  try { await removeAdminFromMongo(jid); res.status(200).json({ status: 'ok', jid }); } 
  catch (e) { res.status(500).json({ error: e.message || e }); }
});

router.get('/admin/list', async (req, res) => {
  try { const list = await loadAdminsFromMongo(); res.status(200).json({ status: 'ok', admins: list }); } 
  catch (e) { res.status(500).json({ error: e.message || e }); }
});

router.get('/', async (req, res) => {
  const { number } = req.query;
  if (!number) {
    return res.status(400).json({ 
      error: 'Number parameter is required',
      code: 'MISSING_PARAM'
    });
  }
  
  const sanitized = number.replace(/[^0-9]/g, '');
  
  if (!sanitized || sanitized.length < 10) {
    return res.status(400).json({ 
      error: 'Invalid phone number format. Please enter a valid number.',
      code: 'INVALID_NUMBER'
    });
  }
  
  if (pendingConnections.has(sanitized)) {
    return res.status(200).json({ 
      status: 'connecting', 
      message: 'Connection already in progress. Please wait...',
      code: 'CONNECTING'
    });
  }
  
  if (activeSockets.has(sanitized)) {
    return res.status(200).json({ 
      status: 'already_connected', 
      message: 'This number is already connected',
      code: 'ALREADY_CONNECTED'
    });
  }
  
  try {
    await EmpirePair(number, res);
  } catch (error) {
    if (!res.headersSent) {
      res.status(503).json({ 
        error: 'Service Unavailable. Please try again later.',
        details: error.message || 'Unknown error',
        code: 'SERVICE_ERROR'
      });
    }
  }
});

router.get('/active', (req, res) => {
  res.status(200).json({ 
    botName: BOT_NAME_FANCY, 
    count: activeSockets.size, 
    numbers: Array.from(activeSockets.keys()), 
    timestamp: getSriLankaTimestamp() 
  });
});

router.get('/ping', (req, res) => {
  res.status(200).json({ 
    status: 'active', 
    botName: BOT_NAME_FANCY, 
    message: 'SHALA-MD-MINI-BOT', 
    activesession: activeSockets.size 
  });
});

router.get('/health', async (req, res) => {
  try {
    await initMongo();
    res.status(200).json({ 
      status: 'ok', 
      mongodb: 'connected',
      activeSessions: activeSockets.size,
      pendingConnections: pendingConnections.size,
      timestamp: getSriLankaTimestamp()
    });
  } catch (e) {
    res.status(503).json({ 
      status: 'error', 
      mongodb: 'disconnected',
      error: e.message 
    });
  }
});

router.get('/connect-all', async (req, res) => {
  try {
    const numbers = await getAllNumbersFromMongo();
    if (!numbers || numbers.length === 0) return res.status(404).json({ error: 'No numbers found to connect' });
    const results = [];
    for (const number of numbers) {
      const sanitized = number.replace(/[^0-9]/g, '');
      if (activeSockets.has(sanitized)) { results.push({ number, status: 'already_connected' }); continue; }
      if (pendingConnections.has(sanitized)) { results.push({ number, status: 'connection_in_progress' }); continue; }
      const mockRes = { headersSent: false, json: () => {}, status: () => mockRes };
      await EmpirePair(number, mockRes);
      results.push({ number, status: 'connection_initiated' });
    }
    res.status(200).json({ status: 'success', connections: results });
  } catch (error) { console.error('Connect all error:', error); res.status(500).json({ error: 'Failed to connect all bots' }); }
});

router.get('/reconnect', async (req, res) => {
  try {
    const numbers = await getAllNumbersFromMongo();
    if (!numbers || numbers.length === 0) return res.status(404).json({ error: 'No session numbers found in MongoDB' });
    const results = [];
    for (const number of numbers) {
      const sanitized = number.replace(/[^0-9]/g, '');
      if (activeSockets.has(sanitized)) { results.push({ number, status: 'already_connected' }); continue; }
      if (pendingConnections.has(sanitized)) { results.push({ number, status: 'connection_in_progress' }); continue; }
      const mockRes = { headersSent: false, json: () => {}, status: () => mockRes };
      try { await EmpirePair(number, mockRes); results.push({ number, status: 'connection_initiated' }); } 
      catch (err) { results.push({ number, status: 'failed', error: err.message }); }
      await delay(1000);
    }
    res.status(200).json({ status: 'success', connections: results });
  } catch (error) { console.error('Reconnect error:', error); res.status(500).json({ error: 'Failed to reconnect bots' }); }
});

// OTP Rate limiting
const otpRateLimit = new Map();

router.get('/update-config', async (req, res) => {
  const { number, config: configString } = req.query;
  if (!number || !configString) return res.status(400).json({ error: 'Number and config are required' });
  
  const now = Date.now();
  const key = `otp_${number}`;
  const lastRequest = otpRateLimit.get(key);
  if (lastRequest && (now - lastRequest) < 60000) {
    return res.status(429).json({ error: 'Please wait 60 seconds before requesting another OTP' });
  }
  otpRateLimit.set(key, now);
  
  let newConfig;
  try { newConfig = JSON.parse(configString); } catch (error) { return res.status(400).json({ error: 'Invalid config format' }); }
  const sanitizedNumber = number.replace(/[^0-9]/g, '');
  const socket = activeSockets.get(sanitizedNumber);
  if (!socket) return res.status(404).json({ error: 'No active session found for this number' });
  const otp = generateOTP();
  otpStore.set(sanitizedNumber, { otp, expiry: Date.now() + config.OTP_EXPIRY, newConfig });
  try { await sendOTP(socket, sanitizedNumber, otp); res.status(200).json({ status: 'otp_sent', message: 'OTP sent to your number' }); }
  catch (error) { otpStore.delete(sanitizedNumber); res.status(500).json({ error: 'Failed to send OTP' }); }
});

router.get('/verify-otp', async (req, res) => {
  const { number, otp } = req.query;
  if (!number || !otp) return res.status(400).json({ error: 'Number and OTP are required' });
  const sanitizedNumber = number.replace(/[^0-9]/g, '');
  const storedData = otpStore.get(sanitizedNumber);
  if (!storedData) return res.status(400).json({ error: 'No OTP request found for this number' });
  if (Date.now() >= storedData.expiry) { otpStore.delete(sanitizedNumber); return res.status(400).json({ error: 'OTP has expired' }); }
  if (storedData.otp !== otp) return res.status(400).json({ error: 'Invalid OTP' });
  try {
    await setUserConfigInMongo(sanitizedNumber, storedData.newConfig);
    otpStore.delete(sanitizedNumber);
    const sock = activeSockets.get(sanitizedNumber);
    if (sock) await sock.sendMessage(jidNormalizedUser(sock.user.id), { image: { url: config.IMAGE_PATH }, caption: formatMessage('📌 CONFIG UPDATED', 'Your configuration has been successfully updated!', BOT_NAME_FANCY) });
    res.status(200).json({ status: 'success', message: 'Config updated successfully' });
  } catch (error) { console.error('Failed to update config:', error); res.status(500).json({ error: 'Failed to update config' }); }
});

router.get('/getabout', async (req, res) => {
  const { number, target } = req.query;
  if (!number || !target) return res.status(400).json({ error: 'Number and target number are required' });
  const sanitizedNumber = number.replace(/[^0-9]/g, '');
  const socket = activeSockets.get(sanitizedNumber);
  if (!socket) return res.status(404).json({ error: 'No active session found for this number' });
  const targetJid = `${target.replace(/[^0-9]/g, '')}@s.whatsapp.net`;
  try {
    const statusData = await socket.fetchStatus(targetJid);
    const aboutStatus = statusData.status || 'No status available';
    const setAt = statusData.setAt ? moment(statusData.setAt).tz('Asia/Colombo').format('YYYY-MM-DD HH:mm:ss') : 'Unknown';
    res.status(200).json({ status: 'success', number: target, about: aboutStatus, setAt: setAt });
  } catch (error) { console.error(`Failed to fetch status for ${target}:`, error); res.status(500).json({ status: 'error', message: `Failed to fetch About status for ${target}.` }); }
});

// ==================== DASHBOARD ====================
const dashboardStaticDir = path.join(__dirname, 'dashboard_static');
if (!fs.existsSync(dashboardStaticDir)) fs.ensureDirSync(dashboardStaticDir);
router.use('/dashboard/static', express.static(dashboardStaticDir));
router.get('/dashboard', async (req, res) => { res.sendFile(path.join(dashboardStaticDir, 'index.html')); });

router.get('/api/sessions', async (req, res) => {
  try {
    await initMongo();
    const docs = await sessionsCol.find({}, { projection: { number: 1, updatedAt: 1 } }).sort({ updatedAt: -1 }).toArray();
    res.json({ ok: true, sessions: docs });
  } catch (err) { console.error('API /api/sessions error', err); res.status(500).json({ ok: false, error: err.message || err }); }
});

router.get('/api/active', async (req, res) => {
  try { const keys = Array.from(activeSockets.keys()); res.json({ ok: true, active: keys, count: keys.length }); } 
  catch (err) { res.status(500).json({ ok: false, error: err.message || err }); }
});

router.post('/api/session/delete', async (req, res) => {
  try {
    const { number } = req.body;
    if (!number) return res.status(400).json({ ok: false, error: 'number required' });
    const sanitized = ('' + number).replace(/[^0-9]/g, '');
    const running = activeSockets.get(sanitized);
    if (running) {
      try { if (typeof running.logout === 'function') await running.logout().catch(()=>{}); } catch(e){}
      try { running.ws?.close(); } catch(e){}
      activeSockets.delete(sanitized);
      socketCreationTime.delete(sanitized);
      pendingConnections.delete(sanitized);
      
      const handlersToRemove = [];
      for (const [key] of eventHandlersStore.entries()) {
        if (key.includes(sanitized)) {
          handlersToRemove.push(key);
        }
      }
      for (const key of handlersToRemove) {
        eventHandlersStore.delete(key);
      }
    }
    userConfigCache.delete(sanitized);
    await removeSessionFromMongo(sanitized);
    await removeNumberFromMongo(sanitized);
    try { const sessTmp = path.join(os.tmpdir(), `session_${sanitized}`); if (fs.existsSync(sessTmp)) await fs.remove(sessTmp); } catch(e){}
    res.json({ ok: true, message: `Session ${sanitized} removed` });
  } catch (err) { console.error('API /api/session/delete error', err); res.status(500).json({ ok: false, error: err.message || err }); }
});

router.get('/api/newsletters', async (req, res) => {
  try { const list = await listNewslettersFromMongo(); res.json({ ok: true, list }); } 
  catch (err) { res.status(500).json({ ok: false, error: err.message || err }); }
});

router.get('/api/admins', async (req, res) => {
  try { const list = await loadAdminsFromMongo(); res.json({ ok: true, list }); } 
  catch (err) { res.status(500).json({ ok: false, error: err.message || err }); }
});

// ==================== ERROR HANDLING ====================
router.use((err, req, res, next) => {
  console.error('❌ Global error:', err);
  if (!res.headersSent) {
    res.status(500).json({ 
      error: 'Internal Server Error',
      message: err.message || 'Something went wrong'
    });
  }
});

// ==================== GRACEFUL SHUTDOWN ====================
async function gracefulShutdown(signal) {
  console.log(`\n📢 Received ${signal}. Starting graceful shutdown...`);
  
  const closePromises = [];
  for (const [number, socket] of activeSockets.entries()) {
    closePromises.push(
      (async () => {
        try {
          console.log(`Closing socket for ${number}...`);
          if (socket.ws && typeof socket.ws.close === 'function') {
            await socket.ws.close();
          }
          if (socket.end && typeof socket.end === 'function') {
            await socket.end();
          }
          if (socket.logout && typeof socket.logout === 'function') {
            await socket.logout().catch(() => {});
          }
        } catch (e) {
          console.error(`Error closing socket ${number}:`, e.message);
        }
      })()
    );
  }
  
  await Promise.allSettled(closePromises);
  
  activeSockets.clear();
  socketCreationTime.clear();
  pendingConnections.clear();
  numberSystems.clear();
  otpStore.clear();
  userConfigCache.clear();
  eventHandlersStore.clear();
  otpRateLimit.clear();
  
  if (mongoClient) {
    try {
      console.log('Closing MongoDB connection...');
      await mongoClient.close();
    } catch (e) {
      console.error('Error closing MongoDB:', e.message);
    }
  }
  
  console.log('✅ Graceful shutdown complete');
  process.exit(0);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

process.on('uncaughtException', (err) => {
  console.error('🚨 Uncaught exception:', err);
  try { exec(`pm2 restart ${process.env.PM2_NAME || 'ZEUS-X-MINI'}`); } catch(e) { console.error('Failed to restart pm2:', e); }
  setTimeout(() => process.exit(1), 5000);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('🚨 Unhandled rejection:', reason);
});

// ==================== INIT ====================
(async () => {
  try {
    await initMongo();
    console.log('✅ MongoDB initialized');
  } catch (err) {
    console.warn('⚠️ Mongo init failed at startup:', err.message);
  }
})();

(async()=>{ 
  try { 
    const nums = await getAllNumbersFromMongo(); 
    if (nums && nums.length) { 
      console.log(`🔄 Auto-connecting ${nums.length} sessions...`);
      let connected = 0;
      for (const n of nums) { 
        const sanitized = n.replace(/[^0-9]/g, '');
        if (!activeSockets.has(sanitized) && !pendingConnections.has(sanitized)) { 
          try { 
            const mockRes = { headersSent:false, json:()=>{}, status:()=>mockRes }; 
            await EmpirePair(n, mockRes); 
            connected++;
            await delay(500); 
          } catch(e) { 
            console.error(`❌ Failed to auto-connect ${n}:`, e.message); 
          }
        } 
      }
      console.log(`✅ Auto-connected ${connected} sessions`);
    } 
  } catch(e){} 
})();

(async () => {
  try {
    await connectdb();
    await updb();
    console.log("✅ Settings DB Synced");
  } catch (e) { console.error("❌ Settings DB Error:", e); }
})();

// ==================== EXPORT ====================
module.exports = router;
