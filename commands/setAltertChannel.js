import { PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { Database } from "../index.js";

export default {
    data: new SlashCommandBuilder().setName('setaltertchannel').setDescription('Create an alert channel').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    async execute(interaction) {
        Database.db.discord.findOne({ guildId: interaction.guild.id }, async (err, doc) => {
            if (err) throw err;
            if (!doc) return interaction.reply({ content: 'Please set up the bot first with /setup', ephemeral: true });
            Database.db.discord.update({ guildId: interaction.guild.id }, { $set: { alertChannel: interaction.channelId } });
            interaction.reply({ content: 'The alert channel has been set!', ephemeral: true }).then(msg => {
                setTimeout(() => msg.delete(), 5000);
            });

        });
    },
}