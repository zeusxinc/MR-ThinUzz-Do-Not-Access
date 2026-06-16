const os = require("os");
const moment = require("moment-timezone");
const axios = require("axios");
const { activeSockets } = require('../lib/sessionStore');
const config = require('../settings');
const fs = require('fs');
const { cmd, commands } = require('../lib/command')
const { downloadContentFromMessage } = require('baileyz');
const { getBuffer, getGroupAdmins, getRandom, h2k, isUrl, Json, runtime, sleep, fetchJson, jsonformat} = require('../lib/functions')



//--------------- BOT' S ALIVE ------------------//
cmd({
  pattern: "alive",
  alias: ["info", "online"],
  desc: amsg,
  category: "main",
  react: "👋",
  filename: __filename
}, async (conn, mek, q, { from, prefix, pushname, reply }) => {
  try {
    
    const ownerdata = (await axios.get(
      "https://raw.githubusercontent.com/thinura-nethsara/ZEUS-X-MINI-DATA/refs/heads/main/Main/Details.json"
    )).data;

    const {
      alivemsg, footer, imageurl, alivevideo,
      version, botname, ownername, ownernumber,
      pairlink, header, platform, aliveimg, jid,
	  jidname, channel, title
    } = ownerdata;

   let hostname;
    const hostLen = os.hostname().length;
    if (hostLen === 12) hostname = "Replit";
    else if (hostLen === 36) hostname = "Heroku";
    else if (hostLen === 8) hostname = "Koyeb";
    else hostname = os.hostname();

    
    const ramUsed = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2);
    const ramTotal = Math.round(os.totalmem() / 1024 / 1024);
    const uptime = runtime(process.uptime());

    
    const date = moment().tz("Asia/Colombo").format("YYYY-MM-DD");
    const time = moment().tz("Asia/Colombo").format("HH:mm:ss");
    const hour = moment().tz("Asia/Colombo").hour();
    const greetings =
      hour < 12 ? '*`සුභ උදෑසනක්` 🌄*' :
      hour < 17 ? '*`සුභ දහවලක්` 🏞️*' :
      hour < 20 ? '*`සුභ හැන්දෑවක්` 🌅*' :
                  '*`සුභ රාත්‍රියක්` 🌌*';

    
    let monospace = '```';
    const aliveMessage = `👋 ${greetings} ${monospace}${pushname}${monospace}

*╭──『 BOT'S INFO 』─◉◉➤*
*│👤 \`User\` : -* ${pushname}
*│🤖 \`Bot Name\` : -* ${botname}
*│🎡 \`Prefix\` : -* ${config.PREFIX}
*│🧬 \`Version\` : -* ${version}
*│💼 \`Work Type\` : -* ${config.WORK_TYPE}
*╰──────────────◉◉➤*

${alivemsg}`;

    
    const buttons = [
      { buttonId: `${prefix}menu`, buttonText: { displayText: "COMMAND MENU" }, type: 1 },
      { buttonId: `${prefix}ping`, buttonText: { displayText: "BOT\S SPEED" }, type: 1 },
      { buttonId: `${prefix}help`, buttonText: { displayText: "HELP CENTER" }, type: 1 }
    ];

const buttons1 = [
      { buttonId: `${prefix}menu`, buttonText: { displayText: "MENU CMD" }, type: 1 },
      { buttonId: `${prefix}ping`, buttonText: { displayText: "PING CMD" }, type: 1 },
      { buttonId: `${prefix}help`, buttonText: { displayText: "HELP CMD" }, type: 1 }
    ];

    
  //  await conn.sendMessage(from, { 
  //    video: { url: alivevideo },
   //   mimetype: "video/mp4",
// ptv: true
  //  }, { quoted: mek });


if (config.BUTTON === 'true') {

const buttonMessage = {
            image: { url: aliveimg },
            caption: aliveMessage,
            footer: footer,
            buttons: buttons1,
            headerType: 4 
        };

await conn.sendMessage(from, buttonMessage, { quoted: mek });

} else {

await conn.buttonMessage2(from, {
   text: aliveMessage,
   footer: footer,
   image: { url: aliveimg },
   buttons: buttons,
   headerType: 4,
}, mek);
}

  } catch (e) {
    console.error(e);
    reply(`*🚩 Alive Error :-*\n${e.message}`);
  }
});



//--------------- BOT' S ACTIVE SESSION  ------------------//
cmd({
    pattern: "active",
    react: "🟢",
    alias: ["activebot", "onlinebot"],
    desc: aamsg,
    category: "main",
    use: '.active',
    filename: __filename
},
async (conn, mek, q, { from, prefix, pushname, reply }) => {
  try {

	const activeCount = activeSockets?.size || 0;
	  
    const ownerdata = (await axios.get(
      "https://raw.githubusercontent.com/thinura-nethsara/ZEUS-X-MINI-DATA/refs/heads/main/Main/Details.json"
    )).data;

    const {
      alivemsg, footer, imageurl, alivevideo,
      version, botname, ownername, ownernumber,
      pairlink, header, channel, jid, jidname, 
	  platform
    } = ownerdata;
   
const shala = {
      key: {
        remoteJid: "status@broadcast",
        participant: "0@s.whatsapp.net",
        fromMe: false,
        id: "META_AI_SYSTEM"
      },
      message: {
        contactMessage: {
           displayName: botname,
          vcard: `BEGIN:VCARD
VERSION:3.0
N:${botname};;;;
FN:${botname}
ORG:Meta Platforms
TEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002
END:VCARD`
        }
      }
    };
  

let ping = await conn.sendMessage(from , { text: '*_Chacke Your Active Session Count_* ❗'  }, { quoted: shala });
await conn.sendMessage(from, { text : '《 █▒▒▒▒▒▒▒▒▒▒▒》10%' , edit : ping.key })
await conn.sendMessage(from, { text : '《 ████▒▒▒▒▒▒▒▒》30%' , edit : ping.key })
await conn.sendMessage(from, { text : '《 ███████▒▒▒▒▒》50%' , edit : ping.key })
await conn.sendMessage(from, { text : '《 ██████████▒▒》80%' , edit : ping.key })
await conn.sendMessage(from, { text : '《 ████████████》100%' , edit : ping.key })
return await conn.sendMessage(from, { text : `*🟢 \`Active Session\` : - ${activeCount}*` , edit : ping.key })

} catch (e) {
reply('*🚩 Active Error!!*')
l(e)
}
});




//--------------- BOT' S SPEED ------------------//
cmd({
    pattern: "ping",
    react: "📍",
    alias: ["speed","sonic"],
    desc: pmsg,
    category: "main",
    use: '.ping',
    filename: __filename
},
async (conn, mek, q, { from, prefix, pushname, reply }) => {
  try {

      const ownerdata = (await axios.get(
      "https://raw.githubusercontent.com/thinura-nethsara/ZEUS-X-MINI-DATA/refs/heads/main/Main/Details.json"
    )).data;

    const {
      alivemsg, footer, imageurl, alivevideo,
      version, botname, ownername, ownernumber,
      pairlink, header
    } = ownerdata;
      
  const shala = {
      key: {
        remoteJid: "status@broadcast",
        participant: "0@s.whatsapp.net",
        fromMe: false,
        id: "META_AI_SYSTEM"
      },
      message: {
        contactMessage: {
           displayName: botname,
          vcard: `BEGIN:VCARD
VERSION:3.0
N:${botname};;;;
FN:${botname}
ORG:Meta Platforms
TEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002
END:VCARD`
        }
      }
    };
  
var inital = new Date().getTime();
let ping = await conn.sendMessage(from , { text: '*_Pinging to Loku Module..._* ❗'  }, { quoted: shala });
var final = new Date().getTime();
await conn.sendMessage(from, { text : '《 █▒▒▒▒▒▒▒▒▒▒▒》10%' , edit : ping.key })
await conn.sendMessage(from, { text : '《 ████▒▒▒▒▒▒▒▒》30%' , edit : ping.key })
await conn.sendMessage(from, { text : '《 ███████▒▒▒▒▒》50%' , edit : ping.key })
await conn.sendMessage(from, { text : '《 ██████████▒▒》80%' , edit : ping.key })
await conn.sendMessage(from, { text : '《 ████████████》100%' , edit : ping.key })
return await conn.sendMessage(from, { text : '*Pong '+ (final - inital) + ' Ms ⚡*' , edit : ping.key })
} catch (e) {
reply('*🚩 Ping Error!!*')
l(e)
}
});




//--------------- BOT' S MENU ------------------//
cmd({
  pattern: "menu",
  alias: ["list", "commands"],
  react: "🗃️",
  desc: mmsg,
  category: "main",
  filename: __filename
}, async (conn, mek, q, { from, prefix, pushname, reply }) => {
  try {
    
    let ping = await conn.sendMessage(from, { text: '`LOADING`' }, { quoted: mek });
    await conn.sendMessage(from, { text: '`BOT MENU` ✅', edit: ping.key });

    let hostname;
    const hostLen = os.hostname().length;
    if (hostLen === 12) hostname = "Replit";
    else if (hostLen === 36) hostname = "Heroku";
    else if (hostLen === 8) hostname = "Koyeb";
    else hostname = os.hostname();
   
    const ramUsed = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2);
    const ramTotal = Math.round(os.totalmem() / 1024 / 1024);
    const uptime = runtime(process.uptime());

    const date = moment().tz("Asia/Colombo").format("YYYY-MM-DD");
    const time = moment().tz("Asia/Colombo").format("HH:mm:ss");

    const ownerdata = (await axios.get(
      "https://raw.githubusercontent.com/thinura-nethsara/ZEUS-X-MINI-DATA/refs/heads/main/Main/Details.json"
    )).data;

    const {
      alivemsg, footer, imageurl, alivevideo,
      version, botname, ownername, ownernumber,
      pairlink, header, platform
    } = ownerdata;

    const buttons = [
      { buttonId: prefix + 'aimenu', buttonText: { displayText: 'AI COMMAND' }, type: 1 },
      { buttonId: prefix + 'downloadmenu', buttonText: { displayText: 'DOWNLOAD COMMAND' }, type: 1 },
      { buttonId: prefix + 'groupmenu', buttonText: { displayText: 'GROUP COMMAND' }, type: 1 },
      { buttonId: prefix + 'funmenu', buttonText: { displayText: 'FUN COMMAND' }, type: 1 },
      { buttonId: prefix + 'mainmenu', buttonText: { displayText: 'MAIN COMMAND' }, type: 1 },
      { buttonId: prefix + 'ownermenu', buttonText: { displayText: 'OWNER COMMAND' }, type: 1 },
      { buttonId: prefix + 'othermenu', buttonText: { displayText: 'OTHER COMMAND' }, type: 1 },
      { buttonId: prefix + 'searchmenu', buttonText: { displayText: 'SEARCH COMMAND' }, type: 1 }
  ]

    let monospace = '```';
const menuMessage = `*_👋 Hello,_* ${monospace}@${pushname}${monospace}

*╭──『 BOT'S INFO 』─◉◉➤*
*│👤 \`User\` : -* ${pushname}
*│🤖 \`Bot Name\` : -* ${botname}
*│🎡 \`Prefix\` : -* ${config.PREFIX}
*│🧬 \`Version\` : -* ${version}
*│💼 \`Work Type\` : -* ${config.WORK_TYPE}
*│🖥️ \`Platform\` : -* ${platform}
*│⏱️ \`Runtime\` : -* ${runtime(process.uptime())}
*│💾 \`Memory\` : -* ${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)}MB / ${Math.round(require('os').totalmem / 1024 / 1024)}MB
*╰──────────────◉◉➤*

🥏 _Your fast and reliable all-in-one WhatsApp assistant — ZEUS X MINI_`;
	  
let sections = [{
            title: "🔖 select your category",
            highlight_label: "ZEUS-X-MINI",
            rows: [
                { 
                    header: "Download",
                    title: "Download", 
                    description: "View download command", 
                    id: `${config.PREFIX}downloadmenu` 
                },
                { 
                    header: "Fun",
                    title: "Fun", 
                    description: "View fun command", 
                    id: `${config.PREFIX}funmenu` 
                },
                { 
                    header: "Search",
                    title: "Search", 
                    description: "View search command", 
                    id: `${config.PREFIX}searchmenu` 
                },
                { 
                    header: "Group",
                    title: "Group", 
                    description: "View group command", 
                    id: `${config.PREFIX}groupmenu` 
                },
                { 
                    header: "Owner",
                    title: "Owner", 
                    description: "View owner command", 
                    id: `${config.PREFIX}ownermenu` 
                },
                 { 
                    header: "Ai",
                    title: "Ai", 
                    description: "View ai command", 
                    id: `${config.PREFIX}aimenu` 
                },
                { 
                    header: "Other",
                    title: "Other", 
                    description: "View other command", 
                    id: `${config.PREFIX}othermenu` 
                },
                { 
                    header: "Main",
                    title: "Main", 
                    description: "View owner command", 
                    id: `${config.PREFIX}mainmenu` 
                },
                { 
                    header: "News",
                    title: "News", 
                    description: "View news command", 
                    id: `${config.PREFIX}newsmenu` 
                }
            ]
        }];

let buttons1 = [
            {
                buttonId: "action",
                buttonText: { displayText: "Click Here ❏" },
                type: 4,
                nativeFlowInfo: {
                    name: "single_select",
                    paramsJson: JSON.stringify({
                        title: "Select Category ❏",
                        sections: sections
                    })
                }
            },
            { buttonId: `${config.PREFIX}ping`, buttonText: { displayText: 'PING CMD' }, type: 1 },
            { buttonId: `${config.PREFIX}system`, buttonText: { displayText: 'SYSTEM CMD' }, type: 1 }
        ];

if (config.BUTTON === 'true') {
const buttonMessage1 = {
            image: { url: imageurl },
            caption: menuMessage,
            footer: footer,
            buttons: buttons1,
            headerType: 4 
        };

await conn.sendMessage(from, buttonMessage1, { quoted: mek });

} else {

    const buttonMessage = {
      image: { url: imageurl },
      caption: menuMessage,
      footer: footer,
      buttons: buttons,
      headerType: 4
    };

    await conn.buttonMessage2(from, buttonMessage, mek);
    }

  } catch (e) {
    console.error(e);
    reply(`*🚩 Menu Error :-*\n${e.message}`);
  }
});




//--------------- BOT' S SYSTEM ------------------//
cmd({
    pattern: "system",
    react: "🧬",
    alias: ["status", "os"],
    desc: ssmsg,
    category: "main",
    use: '.system',
    filename: __filename
},
async (conn, mek, q, { from, prefix, pushname, reply }) => {
  try {

        const date = moment().tz("Asia/Colombo").format("YYYY-MM-DD");
        const time = moment().tz("Asia/Colombo").format("HH:mm:ss");

        let hostname;
    const hostLen = os.hostname().length;
    if (hostLen === 12) hostname = "Replit";
    else if (hostLen === 36) hostname = "Heroku";
    else if (hostLen === 8) hostname = "Koyeb";
    else hostname = os.hostname();
    
    const ramUsedMB = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2);
    const ramTotalMB = Math.round(os.totalmem() / 1024 / 1024);
    const ram = `${ramUsedMB} MB / ${ramTotalMB} MB`;
    const rtime = await runtime(process.uptime());

    
    const ownerdata = (await axios.get(
      "https://raw.githubusercontent.com/thinura-nethsara/ZEUS-X-MINI-DATA/refs/heads/main/Main/Details.json"
    )).data;

    const {
      alivemsg, footer, imageurl, alivevideo,
      version, botname, ownername, ownernumber,
      pairlink, header, channel, jid, jidname, 
	  platform
    } = ownerdata;
   
const systemMessage = `
*╭──『 SYSTEM INFO 』─◉◉➤*
*│ 📌 \`CREATOR\` : -* ${ownername}
*│ 📞 \`Hotline\` : -* ${ownernumber}
*│ 📅 \`Date\` : -* ${date}
*│ ⌚ \`Time\` : -* ${time}
*│ 🕒 \`Uptime\` : -* ${rtime}
*│ 💾 \`RAM Usage\` : -* ${ram}
*│ 🖥️ \`Platform\` : -* ${platform}
*│ 🧬 \`Version\` : -* ${version}
*╰──────────────◉◉➤*

${footer}`;

        await conn.sendMessage(from, {
            image: { url: imageurl },
            caption: systemMessage,
            contextInfo: {
                forwardingScore: 999,
                isForwarded: false
            }
        }, { quoted: mek });

    } catch (e) {
        console.error(e);
        reply(`*🚩 System Error :-*\n${e.message}`);
    }
});





//--------------- BOT' S MAIN MENU ------------------//
cmd({
    pattern: "mainmenu",
    react: "🏡",
    dontAddCommandList: true,
    filename: __filename
},
async(conn, mek, m,{from, prefix, l, quoted, body, isCmd, command, args, q, isGroup, sender, senderNumber, botNumber2, botNumber, pushname, isMe, isOwner, groupMetadata, groupName, participants, groupAdmins, isBotAdmins, isAdmins, reply}) => {
try{
    const ownerdata = (await axios.get(
      "https://raw.githubusercontent.com/thinura-nethsara/ZEUS-X-MINI-DATA/refs/heads/main/Main/Details.json"
    )).data;

    const {
      alivemsg, footer, imageurl, alivevideo,
      version, botname, ownername, ownernumber,
      pairlink, header, channel, jid, jidname, 
	  platform
    } = ownerdata;

	const ramUsedMB = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2);
    const ramTotalMB = Math.round(os.totalmem() / 1024 / 1024);
    const ram = `${ramUsedMB} MB / ${ramTotalMB} MB`;
    const rtime = await runtime(process.uptime());
    
let menuc = `*_🥏 ${botname} Mᴀɪɴ Mᴇɴᴜ_* 

*╭──────────────◉◉➤*
*│ 🕒 \`Uptime\` : -* ${rtime}
*│ 💾 \`RAM Usage\` : -* ${ram}
*╰──────────────◉◉➤*

`
for (let i=0;i<commands.length;i++) { 
if(commands[i].category === 'main'){
  if(!commands[i].dontAddCommandList){
menuc += `*│ 📍 Command :* \`${commands[i].pattern}\`
*│ 📃 Usage :* *${commands[i].desc}*\n\n`}}};

	const buttons = [
      { buttonId: `${prefix}menu`, buttonText: { displayText: "MENU COMMAND" }, type: 1 },
	  { buttonId: `${prefix}help`, buttonText: { displayText: "HELP CENTER" }, type: 1 }
    ];

const buttons1 = [
      { buttonId: `${prefix}menu`, buttonText: { displayText: "MENU CMD" }, type: 1 },
      { buttonId: `${prefix}help`, buttonText: { displayText: "HELP CMD" }, type: 1 }
    ];

if (config.BUTTON === 'true') {

const buttonMessage = {
            image: { url: imageurl },
            caption: menuc,
            footer: footer,
            buttons: buttons1,
            headerType: 4 
        };

await conn.sendMessage(from, buttonMessage, { quoted: mek });

} else {

	await conn.buttonMessage2(from, {
      text: menuc,
      footer: footer,
      image: { url: imageurl },
      buttons: buttons,
      headerType: 4
    }, mek);
}

    } catch (e) {
        console.error(e);
        reply(`*🚩 Help Menu Error : -*\n${e.message}`);
    }
});





