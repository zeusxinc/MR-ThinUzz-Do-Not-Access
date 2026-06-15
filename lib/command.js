// lib/command.js

const commands = [];

/**
 * Register a command
 * @param {Object} info - command info
 * @param {Function} func - command execute function
 */
function cmd(info, func) {
    if (!info) {
        throw new Error("❌ Command info missing");
    }

    const data = {
        pattern: info.pattern ? info.pattern.toLowerCase() : null,
        on: info.on || null,
        alias: info.alias || [],
        desc: info.desc || '',
        category: info.category || 'misc',
        use: info.use || '',
        react: info.react || null,
        fromMe: info.fromMe || false,
        dontAddCommandList: info.dontAddCommandList || false,
        filename: info.filename || 'Not Provided',
        function: func
    };

    commands.push(data);
    return data;
}

function getCommands() {
    return commands;
}

module.exports = {
    cmd,
    AddCommand: cmd,
    Function: cmd,
    Module: cmd,
    commands,
    getCommands
};
