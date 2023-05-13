import { PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { Database, app } from "../index.js";

export default {
    data: new SlashCommandBuilder().setName('sendlatest').setDescription('Send the latest message in the role channel').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    async execute(interaction) {
        Database.db.discord.findOne({ guildId: interaction.guild.id }, async (err, guild) => {
            if (err) throw err;
            if (!guild) return interaction.reply({ content: 'Please set up the bot first with /setup', ephemeral: true });
            if (!guild.alertChannel) return interaction.reply({ content: 'Please set up the alert channel first with /setalertchannel', ephemeral: true });
            if (!guild.alertRole) return interaction.reply({ content: 'Please set up the alert role first with /setalertrole', ephemeral: true });
            await Database.db.findOne({}).sort({ _id: -1 }).exec((err, latestGame) => {
                if (err) throw err;
                const message = app.createDiscordMessage(latestGame.gameData);
                message.content = message.content.replace('{role}', `<@&${guild.alertRole}>`);
                app.discordbot.sendToGuild(interaction.guildId, guild.alertChannel, message)
                interaction.reply({ content: 'The latest message has been sent!', ephemeral: true }).then(msg => {
                    setTimeout(() => msg.delete(), 5000);
                });
            });
        });
    }
}