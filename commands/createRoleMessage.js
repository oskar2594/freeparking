import { PermissionFlagsBits, SlashCommandBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } from "discord.js";
import { Database, app } from "../index.js";

export default {
    data: new SlashCommandBuilder().setName('createrolemessage').setDescription('Create a role message').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    async execute(interaction) {
        Database.db.discord.findOne({ guildId: interaction.guild.id }, async (err, doc) => {
            if (err) throw err;
            if (!doc) return interaction.reply({ content: 'Please set up the bot first with /setup', ephemeral: true });
            if (!doc.roleChannel) return interaction.reply({ content: 'Please set up the role channel first with /setrolechannel', ephemeral: true });
            if (!doc.alertRole) return interaction.reply({ content: 'Please set up the alert role first with /setalertrole', ephemeral: true });
            if (doc.roleChannel != interaction.channelId) return interaction.reply({ content: 'Please run this command in the role channel!', ephemeral: true });
            const subscribeButton = new ButtonBuilder().setCustomId('subscribe').setLabel('Abonnieren').setStyle(ButtonStyle.Primary);
            const unsubscribeButton = new ButtonBuilder().setCustomId('unsubscribe').setLabel('Abbestellen').setStyle(ButtonStyle.Danger);
            const row = new ActionRowBuilder().addComponents(subscribeButton, unsubscribeButton);
            const message = await interaction.channel.send({
                content: '',
                embeds: [
                    {
                        "type": "rich",
                        "title": `Werde immer über neue kostenlose EpicGames Spiele informiert!`,
                        "description": `Mit nur einem Klick auf \"Abonnieren\" wirst du Zugang zu unseren regelmäßigen Updates über die neuesten kostenlosen Spiele von Epic Games erhalten. Wenn du deine Anmeldung später widerrufen möchtest, kannst du jederzeit auf \"Abbestellen\" klicken, um dich von unseren Benachrichtigungen abzumelden. Es war noch nie einfacher, auf dem Laufenden zu bleiben - klicke einfach auf den entsprechenden Knopf, um deine Einstellungen zu ändern.`,
                        "color": 0x64cc88
                    }
                ],
                components: [row]
            });
            app.discordbot.setupButtonActions();
            Database.db.discord.update({ guildId: interaction.guild.id }, { $set: { roleMessage: message.id } });
            interaction.reply({ content: 'The role message has been created!', ephemeral: true }).then(msg => {
                setTimeout(() => msg.delete(), 5000);
            });
        });
    }
}