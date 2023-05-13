import { PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { Database } from "../index.js";

export default {
    data: new SlashCommandBuilder().setName('setup').setDescription('Set up the bot').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    async execute(interaction) {
        Database.db.discord.findOne({ guildId: interaction.guild.id }, async (err, doc) => {
            if(err) throw err;
            if(doc) return interaction.reply({ content: 'The bot is already set up!', ephemeral: true });
            Database.db.discord.insert({ guildId: interaction.guild.id, roleChannel: null, alertChannel: null, alertRole: null, roleMessage: null});
            interaction.reply({ content: 'The bot has been set up!', ephemeral: true });
        });
    }
}