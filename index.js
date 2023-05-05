
import fetch from 'node-fetch';
import cron from 'node-cron';
import dotenv from 'dotenv';
import nedb from 'nedb';
import { WebhookClient, Client, GatewayIntentBits } from 'discord.js';

class Utils {
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    filterPromise(array, callback) {
        return Promise.all(array.map(async item => await callback(item)))
            .then(results => array.filter((_v, index) => results[index]));
    }
}



class EpicGames {
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

class App {
    constructor() {
        this.db = new nedb({ filename: 'db.json', autoload: true });
        this.epicGames = new EpicGames();
        this.utils = new Utils();
        this.client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages] });
        this.webHook = new WebhookClient({ url: "https://discord.com/api/webhooks/1103392723798593678/wglVSf-9ISJdZR8r44DUwHalPJ5gJgLkMHrQp6EYFhB8PqQi-KFnSZxFnG1DnYPqaJDx" });
    }

    async start() {
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
            this.webHook.send(this.createDiscordMessage(game)).then(() => {
                console.log(`Sent message for ${game.title}`);
            }).catch(err => {
                console.error(err);
            });
        });
    }

    createDiscordMessage(game) {
        return {
            content: '',
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
            resolve(await this.utils.filterPromise(currentFreeGames, async game => {
                return new Promise(async (res, rej) => {
                    await this.db.findOne({ gameId: game.id }, (err, doc) => {
                        if (err) return rej(err);
                        if (doc) return res(false);
                        this.db.insert({ gameId: game.id });
                        res(true);
                    });
                });
            }));
        });
    }
}

dotenv.config()
const app = new App();
app.start();