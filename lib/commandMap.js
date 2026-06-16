
const { commands } = require('./command');

/**
 * Find command by name or alias
 * @param {string} name
 */
function findCommand(name) {
    if (!name) return null;

    name = name.toLowerCase();

    return commands.find(cmd => {
        // main pattern
        if (cmd.pattern && cmd.pattern.toLowerCase() === name) return true;

        // aliases
        if (Array.isArray(cmd.alias)) {
            return cmd.alias.map(a => a.toLowerCase()).includes(name);
        }

        return false;
    }) || null;
}

module.exports = {
    findCommand
};
