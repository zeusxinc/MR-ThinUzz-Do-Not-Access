const config = require('../settings')
const { cmd } = require('../lib/command')
const { input, get, updb, updfb, getalls, Settings } = require("../lib/database")

// Helper function to check if sender is bot itself
const isBotItself = (conn, sender) => {
    const botNumber = conn.user.id.split(':')[0] + '@s.whatsapp.net';
    return sender === botNumber;
}

// Helper function to check if sender is owner
const isOwnerNumber = (sender) => {
    const ownerNumbers = config.OWNER_NUMBERS ? config.OWNER_NUMBERS.split(',') : [];
    const cleanSender = sender.split('@')[0].replace(/[^0-9]/g, '');
    const cleanOwnerMain = config.OWNER_NUMBER ? config.OWNER_NUMBER.replace(/[^0-9]/g, '') : '';
    
    if (cleanSender === cleanOwnerMain) return true;
    if (ownerNumbers.includes(cleanSender)) return true;
    
    const sudoNumbers = config.SUDO_NUMBERS ? config.SUDO_NUMBERS.split(',') : [];
    if (sudoNumbers.includes(cleanSender)) return true;
    
    return false;
}

// ================= RESET DATABASE =================
cmd({
    pattern: "resetdb",
    desc: "Reset Database",
    category: "owner",
    filename: __filename
},
async(conn, mek, m,{ isOwner, reply, sender }) => {
try{
    const isMe = isBotItself(conn, sender);
    const isOwn = isOwnerNumber(sender) || isOwner;
    if (!isOwn && !isMe) return reply("*Owner only command ❌*")
    await updfb()
    await updb()
    return reply("*Database reseted & reloaded ✅*")
} catch (e) {
    console.log(e)
    reply("*Error ❌*")
}
});

// ================== BUTTON ON /OFF =====================
cmd({
    pattern: "button",
    fromMe: true,
    filename: __filename
},
async(conn, mek, m,{ q, isOwner, reply, sender }) => {
try{
    const isMe = isBotItself(conn, sender);
    const isOwn = isOwnerNumber(sender) || isOwner;
    if (!isOwn && !isMe) return reply("*Owner only ❌*")
    if (!q) return reply("*true / false ?*")

    let inputVal = q.toLowerCase()

    if (inputVal !== "true" && inputVal !== "false") {
        return reply("*Use only true or false ❌*")
    }

    await input("BUTTON", inputVal)
    await updb()

    reply(`*Bot Reply Type Updated to:* ${inputVal} ✅`)
    
} catch(e){
    console.log(e)
    reply("*Error updating mode ❌*")
}
});

// ================= WORK TYPE =================
cmd({
    pattern: "mode",
    fromMe: true,
    filename: __filename
},
async(conn, mek, m,{ q, isOwner, reply, sender }) => {
try{
    const isMe = isBotItself(conn, sender);
    const isOwn = isOwnerNumber(sender) || isOwner;
    if (!isOwn && !isMe) return reply("*Owner only ❌*")
    if (!q) return reply("*public / private / group ?*")

    const validTypes = ["public", "private", "group"];
    if (!validTypes.includes(q.toLowerCase())) {
        return reply("*Invalid type! Use: public / private / group*");
    }

    await input("WORK_TYPE", q.toLowerCase())
    await updb()

    reply(`*Work mode updated to:* ${q} ✅`)
} catch(e){
    console.log(e)
    reply("*Error updating mode ❌*")
}
});

// ================= SET PREFIX =================
cmd({
    pattern: "setprefix",
    fromMe: true,
    filename: __filename
},
async(conn, mek, m,{ q, isOwner, reply, sender }) => {
try{
    const isMe = isBotItself(conn, sender);
    const isOwn = isOwnerNumber(sender) || isOwner;
    if (!isOwn && !isMe) return reply("*Owner only ❌*")
    if (!q) return reply("*Please provide a new prefix ❌*")
    if (q.length > 3) return reply("*Prefix too long! Max 3 characters*")
    
    await input("PREFIX", q)
    await updb()
    reply(`*New Prefix:* ${q} ✅`)
} catch(e){
    console.log(e)
    reply("*Error setting prefix ❌*")
}
});

// ================= VIEW ALL SETTINGS =================
cmd({
    pattern: "settings",
    react: "⚙️",
    alias: ["setting",'botsetting'],
    desc: 'View all bot settings',
    category: "owner",
    use: '.settings',
    filename: __filename
},
async(conn, mek, m,{from, prefix, sender, botNumber, reply}) => {
try{
    const isMe = isBotItself(conn, sender);
    const isOwn = isOwnerNumber(sender);
    
    if (!isMe && !isOwn) {
        return await reply('*Access Denied ⛔*\n*Only bot owner or bot itself can use this command.*')
    }
    
    // Get all settings from database
    const allSettings = await getalls() || {};
    
    let settingsMsg = `╭━━━━━〔 *📊 DATABASE SETTINGS* 〕━━━━━━╮\n`
    settingsMsg += `┃\n`
    settingsMsg += `┃  🤖 *Bot Name:* ${config.BOT_NAME || 'Not Set'}\n`
    settingsMsg += `┃  📝 *Prefix:* ${allSettings.PREFIX || config.PREFIX || '.'}\n`
    settingsMsg += `┃  🔧 *Work Mode:* ${allSettings.WORK_TYPE || config.WORK_TYPE || 'public'}\n`
    settingsMsg += `┃  ⚙️ *Button Mode:* ${allSettings.BUTTON || config.BUTTON || 'false'}\n`
    settingsMsg += `┃  🛡️ *Anti Call:* ${allSettings.ANTI_CALL || 'false'}\n`
    settingsMsg += `┃  ⌨️ *Auto Typing:* ${allSettings.AUTO_TYPING || 'false'}\n`
    settingsMsg += `┃  🎙️ *Auto Recording:* ${allSettings.AUTO_RECORDING || 'false'}\n`
    settingsMsg += `┃  📖 *Auto Read:* ${allSettings.AUTO_MSG_READ || 'false'}\n`
    settingsMsg += `┃  🔗 *Anti Link:* ${allSettings.ANTI_LINK || 'false'}\n`
    settingsMsg += `┃  🤖 *Anti Bot:* ${allSettings.ANTI_BOT || 'false'}\n`
    settingsMsg += `┃  💬 *Chat Bot:* ${allSettings.CHAT_BOT || 'false'}\n`
    settingsMsg += `┃  🚫 *Anti Delete:* ${allSettings.ANTI_DELETE || 'off'}\n`
    settingsMsg += `┃\n`
    settingsMsg += `╰━━━━━━━━━━━━━━━━━━━━━━╯\n\n`
    settingsMsg += `📌 *Commands:*\n`
    settingsMsg += `┃  • ${prefix}editdb <key> <value>\n`
    settingsMsg += `┃  • ${prefix}viewdb <key>\n`
    settingsMsg += `┃  • ${prefix}alldb - Show all settings\n`
    settingsMsg += `┃  • ${prefix}resetdb - Reset database\n`
    settingsMsg += `┃  • ${prefix}button <true/false>\n`
    settingsMsg += `┃  • ${prefix}mode <public/private/group>\n`
    settingsMsg += `┃  • ${prefix}setprefix <symbol>\n`
    
    await reply(settingsMsg)
    
} catch(e){
    console.log('Settings command error:', e)
    await reply('*Error loading settings ❌*\n' + e.message)
}
});

// ================= VIEW SPECIFIC SETTING =================
cmd({
    pattern: "viewdb",
    alias: ["getdb"],
    desc: "View specific database setting",
    category: "owner",
    filename: __filename
},
async(conn, mek, m,{ q, isOwner, reply, sender }) => {
try{
    const isMe = isBotItself(conn, sender);
    const isOwn = isOwnerNumber(sender) || isOwner;
    if (!isOwn && !isMe) return reply("*Owner only command ❌*")
    
    if (!q) {
        return reply("*Please provide a setting key to view*\n\n*Available keys:*\nPREFIX, WORK_TYPE, BUTTON, ANTI_CALL, AUTO_TYPING, AUTO_RECORDING, AUTO_MSG_READ, ANTI_LINK, ANTI_BOT, CHAT_BOT, ANTI_DELETE")
    }
    
    const key = q.toUpperCase();
    const value = await get(key);
    
    if (value === null || value === undefined) {
        return reply(`*Setting '${key}' not found or not set*`);
    }
    
    let msg = `╭━━━━━〔 *📁 DATABASE VIEW* 〕━━━━━━╮\n`
    msg += `┃\n`
    msg += `┃  🔑 *Key:* ${key}\n`
    msg += `┃  📦 *Value:* ${value}\n`
    msg += `┃  📊 *Type:* ${typeof value}\n`
    msg += `┃\n`
    msg += `╰━━━━━━━━━━━━━━━━━━━━━━╯`
    
    await reply(msg)
    
} catch(e){
    console.log(e)
    reply("*Error ❌*")
}
});

// ================= EDIT DATABASE =================
cmd({
    pattern: "editdb",
    alias: ["setdb", "updatedb"],
    desc: "Edit database settings",
    category: "owner",
    filename: __filename
},
async(conn, mek, m,{ q, isOwner, reply, sender }) => {
try{
    const isMe = isBotItself(conn, sender);
    const isOwn = isOwnerNumber(sender) || isOwner;
    if (!isOwn && !isMe) return reply("*Owner only command ❌*")
    
    if (!q) {
        return reply("*Usage:*\n.editdb <key> <value>\n\n*Available keys:*\nPREFIX, WORK_TYPE, BUTTON, ANTI_CALL, AUTO_TYPING, AUTO_RECORDING, AUTO_MSG_READ, ANTI_LINK, ANTI_BOT, CHAT_BOT, ANTI_DELETE, AUTO_WELCOME_LEAVE, ANTI_BAD, SUDO, JID_BLOCK, MAX_SIZE")
    }
    
    const parts = q.match(/(\S+)\s+(.+)/);
    if (!parts) {
        return reply("*Invalid format! Use:*\n.editdb <key> <value>\n\n*Example:*\n.editdb ANTI_CALL true\n.editdb PREFIX !")
    }
    
    const key = parts[1].toUpperCase();
    let value = parts[2];
    
    // Convert values based on type
    if (value === 'true') value = 'true';
    if (value === 'false') value = 'false';
    if (value === 'on') value = 'on';
    if (value === 'off') value = 'off';
    
    // Handle array values (comma separated)
    if (value.includes(',')) {
        value = value.split(',').map(v => v.trim());
    }
    
    // Handle number values
    if (!isNaN(value) && value !== 'true' && value !== 'false' && value !== 'on' && value !== 'off') {
        value = Number(value);
    }
    
    try {
        await input(key, value);
        await updb();
        
        let msg = `╭━━━━━〔 *✅ DATABASE UPDATED* 〕━━━━━━╮\n`
        msg += `┃\n`
        msg += `┃  🔑 *Key:* ${key}\n`
        msg += `┃  📦 *New Value:* ${JSON.stringify(value)}\n`
        msg += `┃  📊 *Type:* ${typeof value}\n`
        msg += `┃\n`
        msg += `╰━━━━━━━━━━━━━━━━━━━━━━╯`
        
        await reply(msg);
        
    } catch (err) {
        await reply(`*Error updating database:* ${err.message}`);
    }
    
} catch(e){
    console.log(e);
    reply("*Error ❌*");
}
});

// ================= SHOW ALL DATABASE =================
cmd({
    pattern: "alldb",
    alias: ["alldatabase", "showdb"],
    desc: "Show all database settings",
    category: "owner",
    filename: __filename
},
async(conn, mek, m,{ isOwner, reply, sender }) => {
try{
    const isMe = isBotItself(conn, sender);
    const isOwn = isOwnerNumber(sender) || isOwner;
    if (!isOwn && !isMe) return reply("*Owner only command ❌*")
    
    const allSettings = await getalls();
    
    if (!allSettings) {
        return reply("*No settings found in database*");
    }
    
    let msg = `╭━━━━━〔 *📊 FULL DATABASE* 〕━━━━━━╮\n`
    msg += `┃\n`
    
    // Remove MongoDB internal fields
    const { __v, _id, ...settings } = allSettings;
    
    for (const [key, value] of Object.entries(settings)) {
        const displayValue = typeof value === 'object' ? JSON.stringify(value) : value;
        if (displayValue && displayValue.length > 30) {
            msg += `┃  🔑 *${key}:*\n┃     ${displayValue.substring(0, 50)}...\n┃\n`;
        } else {
            msg += `┃  🔑 *${key}:* ${displayValue}\n`;
        }
    }
    
    msg += `┃\n`
    msg += `┃  📊 *Total Settings:* ${Object.keys(settings).length}\n`
    msg += `╰━━━━━━━━━━━━━━━━━━━━━━╯`
    
    // If message is too long, send in parts
    if (msg.length > 65000) {
        await reply("*Database too large! Use .viewdb <key> to view specific settings*");
    } else {
        await reply(msg);
    }
    
} catch(e){
    console.log(e);
    reply("*Error loading database ❌*");
}
});

// ================= ADD SUDO USER =================
cmd({
    pattern: "addsudo",
    desc: "Add sudo user",
    category: "owner",
    filename: __filename
},
async(conn, mek, m,{ q, isOwner, reply, sender }) => {
try{
    const isMe = isBotItself(conn, sender);
    const isOwn = isOwnerNumber(sender) || isOwner;
    if (!isOwn && !isMe) return reply("*Owner only command ❌*")
    
    if (!q) return reply("*Provide a number to add as sudo user*")
    
    let sudoList = await get("SUDO") || [];
    if (!Array.isArray(sudoList)) sudoList = [];
    
    const cleanNumber = q.replace(/[^0-9]/g, '');
    if (sudoList.includes(cleanNumber)) {
        return reply(`*${cleanNumber} is already a sudo user*`);
    }
    
    sudoList.push(cleanNumber);
    await input("SUDO", sudoList);
    await updb();
    
    reply(`*✅ Added ${cleanNumber} as sudo user*`);
    
} catch(e){
    console.log(e);
    reply("*Error ❌*");
}
});

// ================= REMOVE SUDO USER =================
cmd({
    pattern: "removesudo",
    desc: "Remove sudo user",
    category: "owner",
    filename: __filename
},
async(conn, mek, m,{ q, isOwner, reply, sender }) => {
try{
    const isMe = isBotItself(conn, sender);
    const isOwn = isOwnerNumber(sender) || isOwner;
    if (!isOwn && !isMe) return reply("*Owner only command ❌*")
    
    if (!q) return reply("*Provide a number to remove from sudo*")
    
    let sudoList = await get("SUDO") || [];
    if (!Array.isArray(sudoList)) sudoList = [];
    
    const cleanNumber = q.replace(/[^0-9]/g, '');
    if (!sudoList.includes(cleanNumber)) {
        return reply(`*${cleanNumber} is not a sudo user*`);
    }
    
    sudoList = sudoList.filter(num => num !== cleanNumber);
    await input("SUDO", sudoList);
    await updb();
    
    reply(`*✅ Removed ${cleanNumber} from sudo users*`);
    
} catch(e){
    console.log(e);
    reply("*Error ❌*");
}
});

// ================= LIST SUDO USERS =================
cmd({
    pattern: "listsudo",
    alias: ["sudolist"],
    desc: "List all sudo users",
    category: "owner",
    filename: __filename
},
async(conn, mek, m,{ isOwner, reply, sender }) => {
try{
    const isMe = isBotItself(conn, sender);
    const isOwn = isOwnerNumber(sender) || isOwner;
    if (!isOwn && !isMe) return reply("*Owner only command ❌*")
    
    const sudoList = await get("SUDO") || [];
    
    if (sudoList.length === 0) {
        return reply("*No sudo users found*");
    }
    
    let msg = `╭━━━━━〔 *👑 SUDO USERS* 〕━━━━━━╮\n`
    msg += `┃\n`
    sudoList.forEach((num, i) => {
        msg += `┃  ${i+1}. ${num}\n`
    })
    msg += `┃\n`
    msg += `┃  📊 *Total:* ${sudoList.length}\n`
    msg += `╰━━━━━━━━━━━━━━━━━━━━━━╯`
    
    await reply(msg);
    
} catch(e){
    console.log(e);
    reply("*Error ❌*");
}
});
