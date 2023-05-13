import { PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { Database } from "../index.js";

export default {
    data: new SlashCommandBuilder()
    .setName('setalertrole')
    .setDescription('Create an alert role')
    .addRoleOption(option => option.setName('role').setDescription('The role to be alerted').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    async execute(interaction) {
        Database.db.discord.findOne({ guildId: interaction.guild.id }, async (err, doc) => {
            if (err) throw err;
            if (!doc) return interaction.reply({ content: 'Please set up the bot first with /setup', ephemeral: true });
            const role = interaction.options.getRole('role');
            if(!role) return interaction.reply({ content: 'Please provide a valid role!', ephemeral: true });

            // const role = interaction.guild.roles.cache.get(interaction.options.getString('role'));
            Database.db.discord.update({ guildId: interaction.guild.id }, { $set: { alertRole: role.id } });
            interaction.reply({ content: 'The alert role has been set!', ephemeral: true }).then(msg => {
                setTimeout(() => msg.delete(), 5000);
            });
        });
    }
}