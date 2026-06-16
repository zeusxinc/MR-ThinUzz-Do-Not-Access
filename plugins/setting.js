const config = require('../settings')
const { cmd } = require('../lib/command')
const { input, get, updb, updfb } = require("../lib/database")


// ================= RESET DATABASE =================
cmd({
    pattern: "resetdb",
    desc: "Reset Database",
    category: "owner",
    filename: __filename
},
async(conn, mek, m,{ isOwner, isMe, reply }) => {
try{
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
async(conn, mek, m,{ q, isOwner, reply }) => {
try{
    if (!isOwner) return reply("*Owner only ❌*")
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
async(conn, mek, m,{ q, isOwner, reply }) => {
try{
    if (!isOwner) return reply("*Owner only ❌*")
    if (!q) return reply("*public / private / group ?*")

    await input("WORK_TYPE", q)
    await updb()

    reply(`*Work mode updated to:* ${q} ✅`)
} catch(e){
    console.log(e)
}
})

// ================= SET PREFIX =================
cmd({
    pattern: "setprefix",
    fromMe: true,
    filename: __filename
},
async(conn, mek, m,{ q, isOwner, reply }) => {
try{
    if (!isOwner) return
    await input("PREFIX", q)
    await updb()
    reply(`*New Prefix:* ${q} ✅`)
} catch(e){console.log(e)}
})
