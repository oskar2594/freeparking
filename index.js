
import fetch from 'node-fetch';
import cron from 'node-cron';
import dotenv from 'dotenv';
import nedb from 'nedb';
import { WebhookClient, Client, GatewayIntentBits, Events, Collection, REST, Routes } from 'discord.js';
import path from 'path';
import fs from 'fs';

export class Database {
    static {
        this.db = new nedb({ filename: 'db.json', autoload: true });
        this.db.discord = new nedb({ filename: 'discord.json', autoload: true });
    }
}

class Utils {
    static sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    static filterPromise(array, callback) {
        return Promise.all(array.map(async item => await callback(item)))
            .then(results => array.filter((_v, index) => results[index]));
    }
}


export class EpicGames {
    generateUrl(namespace, id) {
        return `https://store.epicgames.com/purchase?highlightColor=64cc88&offers=1-${namespace}-${id}&orderId&purchaseToken&showNavigation=true#/purchase/payment-methods`
    }

    createBuyUrl(game) {
        return this.generateUrl(game.namespace, game.id);
    }

    getAllFreeGames() {
        return new Promise((resolve, reject) => {
            fetch('https://store-site-backend-static.ak.epicgames.com/freeGamesPromotions?locale=de&country=DE&allowCountries=DE')
                .then(res => res.json())
                .then(json => {
                    const games = json.data.Catalog.searchStore.elements;
                    const freeGames = games.filter(game => game.price.totalPrice.discountPrice == 0 && game.promotions.promotionalOffers.length);
                    resolve(freeGames);
                })
                .catch(err => reject(err));
        });
    }

    getBestImage(game) {
        const imageUrl = game.keyImages.find(image => image.type === 'OfferImageWide').url;
        return imageUrl || game.keyImages[0].url;
    }
}

class DiscordBot {

    collectedMessages = [];

    constructor() {
        this.client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.GuildModeration] });
        this.loadCommands();
        this.start();
    }

    async loadCommands() {
        let commands = []
        this.client.commands = new Collection();
        const commandPath = path.join(path.resolve(), 'commands');
        const commandFiles = await fs.readdirSync(commandPath).filter(file => file.endsWith('.js'));
        await Promise.all(commandFiles.map(async file => {
            const command = await import(`./commands/${file}`).then(command => command.default);
            if (!command.data || !command.execute) return console.log('no command data or execute')
            commands.push(command.data.toJSON());
            this.client.commands.set(command.data.name, command);
        }));
        this.registerCommands(commands);
    }

    async registerCommands(commands) {
        console.log('Registering application commands...');
        const rest = new REST().setToken(process.env.DISCORD_TOKEN);
        await rest.put(Routes.applicationCommands(process.env.DISCORD_CLIENT_ID), { body: commands })
            .then(() => console.log('Successfully registered application commands.'))
            .catch(console.error);
    }

    async start() {
        this.client.once(Events.ClientReady, c => {
            this.ready = true;
            console.log('Discord client ready!');
            this.client.on(Events.InteractionCreate, async interaction => {
                if (!interaction.isCommand()) return;
                const command = this.client.commands.get(interaction.commandName);
                if (!command) return;
                try {
                    await command.execute(interaction);
                } catch (error) {
                    console.error(error);
                    await interaction.reply({ content: 'There was an error while executing this command!', ephemeral: true });
                }
            });
            this.setupButtonActions();
        });
        this.client.login(process.env.DISCORD_TOKEN);
    }

    async send(channel, message) {
        if (!this.ready || !channel) return;
        channel.send(message);
    }

    async sendToGuild(guildId, channelId, message) {
        const channel = this.client.guilds.cache.get(guildId).channels.cache.get(channelId);
        this.send(channel, message).then(() => {
            console.log(`Sent message to on ${guild.guildId}`);
        }).catch(err => {
            console.error(err);
        });
    };

    async sendToAll(message, notifyRole = false) {
        if (!this.ready) return;
        await Database.db.discord.find({}, (err, guilds) => {
            if (err) return console.error(err);
            guilds.forEach(guild => {
                if (!guild.alertChannel) return;
                if (notifyRole && !guild.alertRole) return;
                if (notifyRole) message.content = message.content.replace('{role}', `<@&${guild.alertRole}>`);
                this.sendToGuild(guild.guildId, guild.alertChannel, message);
            });
        });
    }

    async setupButtonActions() {
        if (!this.ready) return;
        await Database.db.discord.find({}, (err, guilds) => {
            if (err) return console.error(err);
            guilds.forEach(guild => {
                if (!guild.roleMessage || !guild.roleChannel || !guild.alertRole || !guild.guildId) return console.log(`Guild ${guild.guildId} is missing data!`, guild);
                const channel = this.client.guilds.cache.get(guild.guildId).channels.cache.get(guild.roleChannel);
                if (!channel) return console.error(`Channel ${guild.roleChannel} not found!`);
                console.log(`Setting up button actions for ${guild.guildId}`);
                channel.messages.fetch(guild.roleMessage).then(message => {
                    if(this.collectedMessages.includes(message.id)) return;
                    const role = this.client.guilds.cache.get(guild.guildId).roles.cache.get(guild.alertRole);
                    const filter = (interaction) => interaction.customId === 'subscribe' || interaction.customId === 'unsubscribe';
                    const collector = message.createMessageComponentCollector({ filter });
                    this.collectedMessages.push(message.id);
                    collector.on('collect', async interaction => {
                        if (interaction.customId === 'subscribe') {
                            await interaction.member.roles.add(role);
                            interaction.reply({ content: 'Du wirst nun benachrichtigt, wenn es neue kostenlose Spiele gibt!', ephemeral: true });
                        } else if (interaction.customId === 'unsubscribe') {
                            await interaction.member.roles.remove(role);
                            interaction.reply({ content: 'Du wirst nun nicht mehr benachrichtigt, wenn es neue kostenlose Spiele gibt! :(', ephemeral: true });
                        } else {
                            return;
                        }
                    });
                });
            });
        });
    }

}

class App {
    constructor() {
        this.epicGames = new EpicGames();
        this.discordbot = new DiscordBot();
    }

    async start() {
        while (!this.discordbot.ready) {
            await Utils.sleep(1000);
        }
        console.log('Starting...');
        this.sendNewGames();
        await cron.schedule('0 * * * *', async () => {
            this.sendNewGames();
        });
    }

    async sendNewGames() {
        console.log('Checking for new free games... ' + new Date().toLocaleString());
        const newGames = await this.checkForNewFreeGames();
        console.log('Found new free games: ' + newGames.length);
        if (newGames.length === 0) return;
        newGames.forEach(game => {
            this.discordbot.sendToAll(this.createDiscordMessage(game), true).then(() => {
                console.log(`Sent message for ${game.title}`);
            }).catch(err => {
                console.error(err);
            });
        });
    }

    createDiscordMessage(game) {
        return {
            content: '{role}',
            embeds: [{
                type: 'rich',
                title: `${game.title} ist jetzt kostenlos!`,
                description: game.description,
                color: 0x64cc88,
                timestamp: new Date(),
                url: this.epicGames.createBuyUrl(game),
                fields: [
                    {
                        name: 'Originalpreis',
                        value: game.price.totalPrice.fmtPrice.originalPrice,
                        inline: true
                    },
                    {
                        name: 'Gültig bis',
                        value: new Date(game.promotions.promotionalOffers[0].promotionalOffers[0].endDate).toLocaleDateString('de-DE'),
                        inline: true
                    }
                ],
                image: {
                    url: game.keyImages[0].url
                }
            }]
        }
    }


    checkForNewFreeGames() {
        return new Promise(async (resolve, reject) => {
            const currentFreeGames = await this.epicGames.getAllFreeGames();
            if (currentFreeGames.length === 0) return;
            resolve(await Utils.filterPromise(currentFreeGames, async game => {
                return new Promise(async (res, rej) => {
                    await Database.db.findOne({ gameId: game.id }, (err, doc) => {
                        if (err) return rej(err);
                        if (doc) return res(false);
                        Database.db.insert({ gameId: game.id, gameData: game});
                        res(true);
                    });
                });
            }));
        });
    }
}

dotenv.config()
export const app = new App();
app.start();