//Importing all required modules
const fs = require("fs");
const Discord = require("discord.js");
const Airtable = require("airtable");
const getUrls = require("get-urls");
const axios = require("axios");
//Importing bot's required functionalities
const Showdown = require("./tracker/Showdown");
const utils = require("./utils");
const util = require("./utils");

//Setting up process.env
require("dotenv").config();
const airtable_key = process.env.AIRTABLE_KEY;
const base_id = process.env.BASE_ID;
//Creating the client
const client = new Discord.Client({ disableEveryone: true });

//Getting the bot's commands
client.commands = new Discord.Collection();
const commandFiles = fs
	.readdirSync("./commands")
	.filter((file) => file.endsWith(".js"));
for (const file of commandFiles) {
	const command = require(`./commands/${file}`);
	client.commands.set(command.name, command);
}

	//When the client is connected and logged in to Discord
	client.on("ready", async () => {
		console.log(`${client.user.username} is online!`);
		client.user
			.setActivity(`PS Battles in ${client.guilds.cache.size} servers.`, {
				type: "WATCHING",
			})
			.then((presence) =>
				console.log(`Activity set to ${presence.activities[0].name}`)
			)
			.catch(console.error);
	});

	const base = new Airtable({
		apiKey: airtable_key,
	}).base(base_id);

	//When the client joins a new server
	client.on("guildCreate", (guild) => {
		client.user.setActivity(
			`PS Battles in ${client.guilds.size} servers.`,
			{
				type: "Watching",
			}
		);
	});

	//When the client leaves/gets kicked from a server
	client.on("guildDelete", async (guild) => {
		//Getting the channels that this server has
		const channels = await utils.getChannels();
		const toDelete = [];
		for (let channel of channels) {
			if (util.getChannel(guild, channel)) {
				toDelete.push(channel);
			}
		}

		//Deleting the records for those channels, but Custom Rules and Leagues
		for (let channel of toDelete) {
			const leagueJson = await utils.findLeagueId(channel);
			const rulesId = await utils.findRulesId(channel);
			/* Deleting the rules record first. */
			base("Custom Rules").destroy([rulesId], (err, deletedRecords) => {
				console.log(
					`${leagueJson.name}'s custom rules have been deleted`
				);
			});
			/* Deleting the leagues record next. */
			base("Leagues").destroy([leagueJson.id], (err, deletedRecords) => {
				console.log(`${leagueJson.name}'s league has been deleted.`);
			});
		}
	});

	//When a message is sent
	client.on("message", async (message) => {
		const channel = message.channel;
		const msgStr = message.content;
		const prefix = "porygon, use ";

		if (channel.type === "dm") return;
		else if (
			channel.name.includes("live-links") ||
			channel.name.includes("live-battles")
		) {
			//Extracting battlelink from the message
			let urls = getUrls(msgStr).values(); //This is because getUrls returns a Set
			let battlelink = urls.next().value;
			if (
				battlelink &&
				!battlelink.includes("google") &&
				!battlelink.includes("replay")
			) {
				let psServer = "";
				//Checking what server the battlelink is from
				if (battlelink.includes("sports.psim.us")) {
					psServer = "Sports";
				} else if (battlelink.includes("automatthic.psim.us")) {
					psServer = "Automatthic";
				} else if (battlelink.includes("play.pokemonshowdown.com")) {
					psServer = "Showdown";
				} else if (battlelink.includes("dawn.psim.us")) {
					psServer = "Dawn";
				} else {
					channel.send(
						"This link is not a valid Pokemon Showdown battle url."
					);
					return;
				}

				channel.send("Joining the battle...");
				//Getting the rules
				let rulesId = await utils.findRulesId(channel.id);
				let rules = await utils.getRules(rulesId);
				//Instantiating the Showdown client
				const psclient = new Showdown(
					battlelink,
					psServer,
					message,
					rules
				);
				//Tracking the battle
				await new Promise(async (resolve, reject) => {
					await psclient.track();
					resolve();
				});
			}
		}

		//Getting info from the message if it's not a live link
		const args = message.content.slice(prefix.length).trim().split(/ +/);
		const commandName = args.shift().toLowerCase();

		//Running commands as normal
		if (
			client.commands.has(commandName.toLowerCase()) &&
			msgStr.toLowerCase().startsWith(prefix)
		) {
			const command = client.commands.get(commandName);
			try {
				await command.execute(message, args);
			} catch (error) {
				console.error(error);
				message.reply(
					"There was an error trying to execute that command!"
				);
			}
		}
	});

	client.login(process.env.TOKEN)
