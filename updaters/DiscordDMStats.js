const utils = require("../utils.js");

class DiscordDMStats {
	constructor(message) {
		//Requires that message is a Discord Message object
		this.message = message;
		this.channel = this.message.channel;
		this.server = this.message.guild;
		this.author = this.message.author;
	}

	//async update(player1, killJson1, deathJson1, player2, killJson2, deathJson2, info) {
	async update(matchJson) {
		let info = matchJson.info;

		let messages = [];
		if (info.format === "Csv") messages = utils.genCSV(matchJson);
		else if (info.format === "Sheets")
			messages = utils.genSheets(matchJson);
		else if (info.format === "Tour") messages = utils.genTour(matchJson);
		else messages = utils.genMessage(matchJson);

		let psPlayer1 = Object.keys(matchJson.players)[0];
		let psPlayer2 = Object.keys(matchJson.players)[1];
		let message1 = messages[0];
		let message2 = messages[1];

		let finalMessage = "";

		//finally sending players the info
		if (info.format === "Tour") {
			if (info.spoiler) finalMessage = `||${message1}||`;
			else finalMessage = message1;
		} else {
			if (info.spoiler)
				finalMessage = `||**${psPlayer1}**: \n${message1}|| \n\n||**${psPlayer2}**: \n${message2}||`;
			else
				finalMessage = `\n\n**${psPlayer1}**: \n${message1} \n\n**${psPlayer2}**: \n${message2}`;
		}

		if (info.tb) {
			finalMessage = `**Result:** ||${info.result}||\n\n${finalMessage}\n\n**Replay: **${info.replay}\n**History: **${info.history}`;
		}

		this.author.send(finalMessage);
		this.channel.send(
			`Battle between \`${psPlayer1}\` and \`${psPlayer2}\` is complete and info has been updated!`
		);
	}
}

module.exports = DiscordDMStats;
