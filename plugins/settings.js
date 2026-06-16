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
    if (!isOwner && !isMe) return reply("*Owner only ❌*")
    if (!q) return reply("*public / private / group ?*")

    await input("WORK_TYPE", q)
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
    if (!isOwner && !isMe) return reply("*Owner only ❌*")
    if (!q) return reply("*Please provide a new prefix ❌*")
    
    await input("PREFIX", q)
    await updb()
    reply(`*New Prefix:* ${q} ✅`)
} catch(e){
    console.log(e)
    reply("*Error setting prefix ❌*")
}
});
