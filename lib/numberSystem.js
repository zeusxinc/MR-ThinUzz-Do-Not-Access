// lib/numberSystem.js
module.exports = function initNumberSystem({ conn, mongoDB, PREFIX }) {
  const axios = require("axios");
  const col = mongoDB.collection("number_cmd_store");
  col.createIndex({ msgId: 1 }).catch(() => {});
  
  const SESSION_TIMEOUT = 86_400_000; // 24 hours
  const activeSessions = new Map(); // jid -> timeout

  // ================= SESSION =================
  function startTimeout(jid, msgId) {
    if (activeSessions.has(jid)) {
      clearTimeout(activeSessions.get(jid));
    }

    const t = setTimeout(async () => {
      try {
       // await conn.sendMessage(jid, {
        //  text: "*📛 Number System Expire.*"
      //  });
        await col.deleteOne({ msgId });
      } catch {}
      activeSessions.delete(jid);
    }, SESSION_TIMEOUT);

    activeSessions.set(jid, t);
  }

  async function saveCMDMap(msgId, jid, map) {
    await col.updateOne(
      { msgId },
      {
        $set: {
          msgId,
          jid,
          map,
          createdAt: new Date(),
          expiresAt: new Date(Date.now() + SESSION_TIMEOUT + 10_000)
        }
      },
      { upsert: true }
    );
  }

  async function findCmd(cmdId, quotedId) {
    const doc = await col.findOne({ msgId: quotedId });
    if (!doc) return null;
    return doc.map.find(m => m.cmdId === cmdId) || null;
  }
const reply = async(teks) => {
  return await conn.sendMessage(from, { text: teks }, { quoted: mek })
}
conn.replyad = async (teks) => {
  await conn.sendMessage(from, { text: teks }, { quoted: mek })
}
  // ================= NUMBER HANDLER =================
  conn.handleNumberReply = async (msg, body) => {
    try {
      const jid = msg.key.remoteJid;
      const reply = body.trim();

      // cancel
      if (reply === '#') {
        if (activeSessions.has(jid)) {
          clearTimeout(activeSessions.get(jid));
          activeSessions.delete(jid);
        }
     //   await conn.sendMessage(jid, { text: "❌ Cancelled" });
        return null;
      }

      // only numbers (1 / 1.2 / 2.1.3)
      if (!/^\d+(\.\d+)*$/.test(reply)) return null;

      const quotedId =
        msg.message?.extendedTextMessage?.contextInfo?.stanzaId;
      if (!quotedId) return null;

      const found = await findCmd(reply, quotedId);
      if (!found) {
       // await conn.sendMessage(jid, {
      //    text: "*📛 Number System Expire. Use New Command.*"
     //   });
        return null;
      }

      startTimeout(jid, quotedId);

      // return real command
      return found.cmd.startsWith(PREFIX)
        ? found.cmd
        : PREFIX + found.cmd;

    } catch (e) {
      console.error("numberSystem error:", e);
      return null;
    }
  };

  // ================= BUTTON → NUMBER =================
  conn.buttonMessage2 = async (jid, msgData, quoted) => {
  let out = "";
  const MAP = [];

  msgData.buttons.forEach((btn, i) => {
    const n = `${i + 1}`;
    out += `\n${n} │❯❯◦ ${btn.buttonText.displayText}`;
    MAP.push({ cmdId: n, cmd: btn.buttonId });
  });

  const footerText = msgData.footer ? `\n\n${msgData.footer}` : "";

  const text = `${msgData.text || msgData.caption || ""}

*\`Reply Below Number\` 🔢*
${out}${footerText}`;

  let content = { text };

  if (
    msgData.headerType === 4 &&
    msgData.image &&
    (Buffer.isBuffer(msgData.image) || msgData.image?.url)
  ) {
    content = {
      image: Buffer.isBuffer(msgData.image)
        ? msgData.image
        : { url: msgData.image.url },
      caption: text
    };
  }

  const sent = await conn.sendMessage(jid, content, { quoted });

  await saveCMDMap(sent.key.id, jid, MAP);
  startTimeout(jid, sent.key.id);
};

  // ================= LIST → NUMBER =================
  conn.listMessage2 = async (jid, msgData, quoted) => {
  let out = "";
  const MAP = [];

  msgData.sections.forEach((sec, si) => {
    const main = `${si + 1}`;
    out += `\n*[${main}] ${sec.title}*\n`;

    sec.rows.forEach((row, ri) => {
      const sub = `${main}.${ri + 1}`;
      out += `   ${sub} │❯❯◦ ${row.title}\n`;
      if (row.description) {
        out += `   ${row.description}\n`;
      }
      MAP.push({ cmdId: sub, cmd: row.rowId });
    });
  });

  const text = `${msgData.text || msgData.caption || ""}

${msgData.buttonText || ""}
${out}

${msgData.footer || ""}`;

  const content =
    msgData.image
      ? {
          image:
            typeof msgData.image === "string"
              ? { url: msgData.image }
              : msgData.image,
          caption: text
        }
      : { text };

  const sent = await conn.sendMessage(jid, content, { quoted });

  await saveCMDMap(sent.key.id, jid, MAP);
  startTimeout(jid, sent.key.id);
};
conn.sendFileUrl = async (jid, url, caption, quoted, options = {}) => {
  let mime = '';
  let res = await axios.head(url)
  mime = res.headers['content-type']
  if (mime.split("/")[1] === "gif") {
    return conn.sendMessage(jid, { video: await getBuffer(url), caption: caption, gifPlayback: true, ...options }, { quoted: quoted, ...options })
  }
  let type = mime.split("/")[0] + "Message"
  if (mime === "application/pdf") {
    return conn.sendMessage(jid, { document: await getBuffer(url), mimetype: 'application/pdf', caption: caption, ...options }, { quoted: quoted, ...options })
  }
  if (mime.split("/")[0] === "image") {
    return conn.sendMessage(jid, { image: await getBuffer(url), caption: caption, ...options }, { quoted: quoted, ...options })
  }
  if (mime.split("/")[0] === "video") {
    return conn.sendMessage(jid, { video: await getBuffer(url), caption: caption, mimetype: 'video/mp4', ...options }, { quoted: quoted, ...options })
  }
  if (mime.split("/")[0] === "audio") {
    return conn.sendMessage(jid, { audio: await getBuffer(url), caption: caption, mimetype: 'audio/mpeg', ...options }, { quoted: quoted, ...options })
  }
}
  // ================= CLEANUP =================
  setInterval(async () => {
    try {
      await col.deleteMany({ expiresAt: { $lt: new Date() } });
    } catch {}
  }, 60 * 60 * 1000);

  return conn;
};
