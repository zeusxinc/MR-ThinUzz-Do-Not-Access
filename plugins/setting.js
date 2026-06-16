const config = require('../settings')
const { cmd } = require('../lib/command')
const { input, get, updb, updfb } = require("../lib/database")

// Helper function to check if sender is bot itself
const isBotItself = (conn, sender) => {
    const botNumber = conn.user.id.split(':')[0] + '@s.whatsapp.net';
    return sender === botNumber;
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
    if (!isOwner && !isMe) return reply("*Owner only command ❌*")
    await updfb()
    await updb()
    return reply("*Database reseted & reloaded ✅*")
} catch (e) {
    console.log(e)
    reply("*Error ❌*")
}
})

// ================== BUTTON ON /OFF =====================
cmd({
    pattern: "button",
    fromMe: true,
    filename: __filename
},
async(conn, mek, m,{ q, isOwner, reply, sender }) => {
try{
    const isMe = isBotItself(conn, sender);
    if (!isOwner && !isMe) return reply("*Owner only ❌*")
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
})

// ================= WORK TYPE =================
cmd({
    pattern: "mode",
    fromMe: true,
    filename: __filename
},
async(conn, mek, m,{ q, isOwner, reply, sender }) => {
try{
    const isMe = isBotItself(conn, sender);
    if (!isOwner && !isMe) return reply("*Owner only ❌*")
    if (!q) return reply("*public / private / group ?*")

    await input("WORK_TYPE", q)
    await updb()

    reply(`*Work mode updated to:* ${q} ✅`)
} catch(e){
    console.log(e)
    reply("*Error updating mode ❌*")
}
})

// ================= SET PREFIX =================
cmd({
    pattern: "setprefix",
    fromMe: true,
    filename: __filename
},
async(conn, mek, m,{ q, isOwner, reply, sender }) => {
try{
    const isMe = isBotItself(conn, sender);
    if (!isOwner && !isMe) return reply("*Owner only ❌*")
    if (!q) return reply("*Please provide a new prefix ❌*")
    
    await input("PREFIX", q)
    await updb()
    reply(`*New Prefix:* ${q} ✅`)
} catch(e){
    console.log(e)
    reply("*Error setting prefix ❌*")
}
})

// ================= SETTINGS =================
cmd({
    pattern: "settings",
    react: "⚙️",
    alias: ["setting",'botsetting'],
    desc: 'bot settings',
    category: "owner",
    use: '.settings',
    filename: __filename
},
async(conn, mek, m,{from, l, quoted, body, isCmd, command, args, prefix, q, isSudo, isGroup, sender, senderNumber, botNumber2, botNumber, pushname, isMe, isOwner, groupMetadata, groupName, participants, groupAdmins, isBotAdmins, isAdmins, reply}) => {
try{
    // Check if bot itself or owner (using isSudo as owner)
    if (!isMe && !isOwner) return await reply('*Access Denided ⛔*')
    
    // Get current settings from database
    const buttonStatus = await get("BUTTON") || "false"
    const workMode = await get("WORK_TYPE") || "public"
    const prefixSetting = await get("PREFIX") || "."
    
    // Create settings display
    let settingsMsg = `╭━━━━━〔 *BOT SETTINGS* 〕━━━━━━╮\n`
    settingsMsg += `┃\n`
    settingsMsg += `┃  ⚙️ *Button Mode:* ${buttonStatus}\n`
    settingsMsg += `┃  🔧 *Work Mode:* ${workMode}\n`
    settingsMsg += `┃  📝 *Prefix:* ${prefixSetting}\n`
    settingsMsg += `┃  🤖 *Bot Number:* ${botNumber}\n`
    settingsMsg += `┃\n`
    settingsMsg += `╰━━━━━━━━━━━━━━━━━━━━━━╯\n\n`
    settingsMsg += `📌 *Commands to change settings:*\n`
    settingsMsg += `┃  • ${prefixSetting}button <true/false>\n`
    settingsMsg += `┃  • ${prefixSetting}mode <public/private/group>\n`
    settingsMsg += `┃  • ${prefixSetting}setprefix <symbol>\n`
    settingsMsg += `┃  • ${prefixSetting}resetdb\n`
    
    await reply(settingsMsg)
    
} catch(e){
    console.log(e)
    await reply('*Error loading settings ❌*')
}
})
