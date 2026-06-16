const fs = require('fs');
if (fs.existsSync('config.env')) require('dotenv').config({ path: './config.env' });
function convertToBool(text, fault = 'true') {
    return text === fault ? true : false;
}
module.exports = {

    MONGO_URI: process.env.MONGO_URI || 'mongodb+srv://Angle:99999978666@cluster0.ynt3dwp.mongodb.net/',
    MONGO_DB: process.env.MONGO_DB || 'zeus',
    
    PREFIX: process.env.PREFIX || '.',
    BUTTON: process.env.BUTTON || 'true',
    MAX_RETRIES: process.env.MAX_RETRIES || '5',
    ADMIN_LIST_PATH: process.env.ADMIN_LIST_PATH || '94774571418',

    OWNER_REACT:process.env.OWNER_REACT || 'true',
    AUTO_REPLY:process.env.AUTO_REPLY || 'true',
    AUTO_AI: process.env.AUTO_AI || 'true',
    AUTO_VIEW_STATUS: process.env.AUTO_VIEW_STATUS || 'true',
    AUTO_LIKE_STATUS: process.env.AUTO_LIKE_STATUS || 'true',
    AUTO_RECORDING: process.env.AUTO_RECORDING || 'true',
    WORK_TYPE: process.env.WORK_TYPE || 'private',
    LANG: process.env.LANG || 'EN',

    NEWSLETTER_MESSAGE_ID: process.env.NEWSLETTER_MESSAGE_ID || '428',
    NEWSLETTER_JID: process.env.NEWSLETTER_JID || '120363404252774256@newsletterr',
    
    AUTO_LIKE_EMOJI: process.env.AUTO_LIKE_EMOJI ? JSON.parse(process.env.AUTO_LIKE_EMOJI) : ['❤️','🩷','🧡','💛','💚','💙','🩵','💜','🖤','🩶','🤍','💗'],

    IMAGE_PATH: process.env.IMAGE_PATH || 'https://mc-error-db.pages.dev/VIHAGA%20XMD/Data/ZEUS%20X%20MD%20MINI%201%20.png',
    CHANNEL_LINK: process.env.CHANNEL_LINK || 'https://whatsapp.com/channel/0029VbC6sAYC6ZvlRtTuM005',
    GROUP_INVITE_LINK: process.env.GROUP_INVITE_LINK || 'https://chat.whatsapp.com/BP3LZx3EnOB7o1BG8NL7kF?mode=gi_t',

    OTP_EXPIRY: process.env.OTP_EXPIRY || '300000',

    BOT_NAME: process.env.BOT_NAME || '*Zᴇᴜꜱ X Mᴅ ᴹᴵᴺᴵ*',
    OWNER_NAME: process.env.OWNER_NAME || '_𝐏𝐎𝐖𝐄𝐑𝐄𝐃 𝐁𝐘 𝐍𝐄𝐗𝐔𝐒 𝐈𝐍𝐂 </>_ 🇱🇰',
    OWNER_NUMBER: process.env.OWNER_NUMBER || '94774571418',
    OWNER_NUMBERS: process.env.OWNER_NUMBERS || '94704227534,94787072548',
    SUDO_NUMBERS: process.env.SUDO_NUMBERS || '94741245331',
    BOT_VERSION: process.env.BOT_VERSION || '1.0.0',
    BOT_FOOTER: process.env.FOOTER || '*_𝐏𝐎𝐖𝐄𝐑𝐄𝐃 𝐁𝐘 𝐍𝐄𝐗𝐔𝐒 𝐈𝐍𝐂 </>_ 🇱🇰*',
};





    
