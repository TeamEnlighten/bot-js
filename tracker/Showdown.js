//This is the code for connecting to and keeping track of a showdown match
const json = require("json");
const ws = require("ws");
const axios = require("axios");
const querystring = require("querystring");

const Pokemon = require("./Pokemon");
const Battle = require("./Battle");

const DiscordStats = require("../updaters/DiscordStats");
const SheetsStats = require("../updaters/SheetsStats");

const { username, password, airtable_key, base_id } = require("../config.json");
const Airtable = require("airtable");
const base = new Airtable({
	apiKey: airtable_key,
}).base(base_id);
const VIEW_NAME = "Grid view";

//Pokemon-related Constants
const recoilMoves = [
	"bravebird",
	"doubleedge",
	"flareblitz",
	"headcharge",
	"headsmash",
	"highjumpkick",
	"jumpkick",
	"lightofruin",
	"shadowend",
	"shadowrush",
	"struggle",
	"submission",
	"takedown",
	"volttackle",
	"wildcharge",
	"woodhammer",
];

const confusionMoves = [
	"Chatter",
	"Confuse Ray",
	"Confusion",
	"Dizzy Punch",
	"Dynamic Punch",
	"Flatter",
	"Hurricane",
	"Outrage",
	"Petal Dance",
	"Psybeam",
	"Rock Climb",
	"Secret Power",
	"Shadow Panic",
	"Signal Beam",
	"Strange Stream",
	"Supersonic",
	"Swagger",
	"Sweet Kiss",
	"Teeter Dance",
	"Thrash",
	"Water Pulse",
];

const toxicMoves = [
	"Baneful Bunker",
	"Cross Poison",
	"Fling",
	"Gunk Shot",
	"Poison Fang",
	"Poison Gas",
	"Poison Jab",
	"Poison Powder",
	"Poison Sting",
	"Poison Tail",
	"Psycho Shift",
	"Secret Power",
	"Shell Side Arm",
	"Sludge",
	"Sludge Bomb",
	"Sludge Wave",
	"Smog",
	"Toxic",
	"Toxic Thread",
	"Twineedle",
];

const burnMoves = [
	"Beak Blast",
	"Blaze Kick",
	"Blue Flare",
	"Burning Jealousy",
	"Ember",
	"Fire Blast",
	"Fire Fang",
	"Fire Punch",
	"Flame Wheel",
	"Flamethrower",
	"Flare Blitz",
	"Fling",
	"Heat Wave",
	"Ice Burn",
	"Inferno",
	"Lava Plume",
	"Psycho Shift",
	"Pyro Ball",
	"Sacred Fire",
	"Scald",
	"Scorching Sands",
	"Searing Shot",
	"Secret Power",
	"Shadow Fire",
	"Sizzly Slide",
	"Steam Eruption",
	"Tri Attack",
	"Will-O-Wisp",
];
const statusAbility = ["Poison Point", "Poison Touch", "Flame Body"];

let findLeagueId = async (checkChannelId) => {
	let leagueId;
	let leagueName;
	await base("Leagues")
		.select({
			maxRecords: 500,
			view: "Grid view",
		})
		.all()
		.then(async (records) => {
			for (let leagueRecord of records) {
				let channelId = await leagueRecord.get("Channel ID");
				if (channelId === checkChannelId) {
					leagueId = leagueRecord.id;
					leagueName = await leagueRecord.get("Name");
				}
			}
		});

	let leagueJson = {
		id: leagueId,
		name: leagueName,
	};
	console.log("End of first function");
	return leagueJson;
};

let getPlayersIds = async (leagueId) => {
	console.log("Inside the second function");
	let recordsIds = await new Promise((resolve, reject) => {
		base("Leagues").find(leagueId, (err, record) => {
			if (err) reject(err);

			recordIds = record.get("Players");
			resolve(recordIds);
		});
	});

	return recordsIds;
};

let playerInLeague = async (playersIds, playerName) => {
	let funcarr = [];
	let isIn = false;
	for (let playerId of playersIds) {
		funcarr.push(
			new Promise((resolve, reject) => {
				base("Players").find(playerId, async (err, record) => {
					if (err) reject(err);

					let recordName = await record.get("Showdown Name");
					if (recordName.toLowerCase() === playerName.toLowerCase()) {
						isIn = true;
					}

					resolve();
				});
			})
		);
	}
	await Promise.all(funcarr);

	return isIn;
};

class Showdown {
	constructor(battle, server, message) {
		this.battle = battle.split("/")[3];

		this.serverType = server.toLowerCase();

		let ip;
		switch (server) {
			case "Showdown":
				ip = "sim.smogon.com:8000";
				break;
			case "Sports":
				ip = "34.222.148.43:8000";
				break;
			case "Automatthic":
				ip = "185.224.89.75:8000";
				break;
			case "Dawn":
				ip = "oppai.azure.lol:80";
		}
		this.server = `ws://${ip}/showdown/websocket`;

		this.websocket = new ws(this.server);
		this.username = username;
		this.password = password;
		this.message = message;
	}

	async endscript(
		playerp1,
		killJson1,
		deathJson1,
		playerp2,
		killJson2,
		deathJson2,
		info
	) {
		let player1 = playerp1
			.substring(0, playerp1.length - 2)
			.toLowerCase()
			.trim();
		let player2 = playerp2
			.substring(0, playerp2.length - 2)
			.toLowerCase()
			.trim();

		// Getting info from Airtable if required
		let recordJson = {
			players: {},
			system: ""
		};
		recordJson.players[player1] = {
			ps: player1,
			kills: killJson1,
			deaths: deathJson1,
		};
		recordJson.players[player2] = {
			ps: player2,
			kills: killJson2,
			deaths: deathJson2,
		};

		base("Leagues")
			.select({
				maxRecords: 500,
				view: VIEW_NAME,
			})
			.all()
			.then(async (records) => {
				for (let leagueRecord of records) {
					let channelId = await leagueRecord.get("Channel ID");
					if (channelId === this.message.channel.id) {
						let playersIds = await leagueRecord.get("Players");

						// Getting info from the league
						recordJson.system = await leagueRecord.get(
							"Stats System"
						);
						recordJson.sheetId = await leagueRecord.get("Sheet ID");
						recordJson.info = info;
						recordJson.dmAuthor = await leagueRecord.get(
							"DM Author?"
						);
						recordJson.combinePD = await leagueRecord.get(
							"Combine P/D?"
						);
						recordJson.streamChannel = await leagueRecord.get(
							"Stream Channel ID"
						);
						recordJson.battleId = this.battle;
						if (recordJson.system === "Discord") {
							break;
						}

						// Gets more info from each player if Google Sheets is the system
						let funcArr = [];
						for (let playerId of playersIds) {
							funcArr.push(
								new Promise((resolve, reject) => {
									base("Players").find(
										playerId,
										async (error, record) => {
											if (error) {
												console.error(error);
												reject(error);
											}

											let recordName = await record.get(
												"Showdown Name"
											);
											recordName.toLowerCase().trim();
											let recordRange = await record.get(
												"Range"
											);
											console.log(
												playerId +
													"    " +
													recordName +
													"player"
											);
											recordJson.players[
												recordName === player1
													? player1
													: player2
											].range = recordRange;

											resolve();
										}
									);
								})
							);
						}
						await Promise.all(funcArr).then(
							console.log("Players found! Updating now...")
						);
					}
				}
			})
			.then(async () => {
				console.log(JSON.stringify(recordJson));

				//Instantiating updater objects
				let dmer = new DiscordStats(this.message);
				let masser = new SheetsStats(
					recordJson.sheetId,
					recordJson.players[player1],
					recordJson.players[player2],
					this.message
				);

				//Updating stats based on given method
				switch (recordJson.system) {
					case "Sheets":
						await masser.update(recordJson);
						break;
					case "Discord":
						await dmer.update(recordJson);
						break;
				}

				console.log("Updating done!");
			});
	}

	async login(nonce) {
		console.log("LOGGING IN");
		let psUrl = `https://play.pokemonshowdown.com/~~${this.serverType}/action.php`;
		let data = querystring.stringify({
			act: "login",
			name: this.username,
			pass: this.password,
			challstr: nonce,
		});

		let response = await axios.post(psUrl, data);
		let json;
		try {
			json = JSON.parse(response.data.substring(1));
			console.log("Login is a success!");
		} catch (e) {
			console.log("Response to login request: " + response);
			this.message.channel.send(
				`Error: \`${this.username}\` failed to login to Showdown. Contact Porygon support.`
			);
			console.error(e);
			return;
		}
		console.log("Logged in to PS.");
		return json.assertion;
	}

	async join() {
		console.log(this.battle);
		this.websocket.send(`|/join ${this.battle}`);
		this.message.channel.send("Battle joined! Keeping track of stats now.");
	}

	async requestReplay(data) {
		let url = `https://play.pokemonshowdown.com/~~${this.serverType}/action.php`;
		data.id = `${
			this.serverType === "showdown" ? "" : `${this.serverType}-`
		}${data.id}`;
		let newData = querystring.stringify({
			act: "uploadreplay",
			log: data.log,
			id: data.id,
		});
		//console.log("newData: " + JSON.stringify(newData) + "\n");

		let response = await axios.post(url, newData);

		console.log("Replay posted!");
		let replay = `https://replay.pokemonshowdown.com/${data.id}`;
		//console.log(`Response to replay: ${response.data}`);

		return replay;
	}

	async track() {
		let battle;
		let dataArr = [];

		this.websocket.on("message", async (data) => {
			try {
				//Separates the data into lines so it's easy to parse
				let realdata = data.split("\n");

				for (const line of realdata) {
					//console.log(line);
					dataArr.push(line);

					//Separates the line into parts, separated by `|`
					const parts = line.split("|").slice(1); //The substring is because all lines start with | so the first element is always blank

					//Checks first and foremost if the battle even exists
					if (line.startsWith(`|noinit|nonexistent|`)) {
						return this.message.channel.send(
							":x: This link is invalid. The battleroom is either closed or non-existent. I have left the battle."
						);
					}

					//Once the server connects, the bot logs in and joins the battle
					else if (data.startsWith("|challstr|")) {
						const nonce = data.substring(10);
						const assertion = await this.login(nonce);
						//logs in
						if (assertion) {
							this.websocket.send(
								`|/trn ${username},0,${assertion}|`
							);
							//Joins the battle
							await this.join();
						} else {
							return;
						}
					}

					//At the beginning of every match, the title of a match contains the player's names.
					//As such, in order to get and verify the player's names in the database, this is the most effective.
					else if (line.startsWith(`|title|`)) {
						let players = parts[1].split(" vs. ");
						console.log("Players: " + players);

						//Initializes the battle as an object
						battle = new Battle(
							this.battle,
							players[0],
							players[1]
						);
					}

					//At the beginning of every non-randoms match, a list of Pokemon show up.
					//This code is to get all that
					else if (line.startsWith(`|poke|`)) {
						let pokemonName = parts[2].split(",")[0].split("-")[0];
						//console.log(pokemonName);
						let pokemon = new Pokemon(pokemonName); //Adding a pokemon to the list of pokemon in the battle
						if (parts[1] === "p1") {
							//If the pokemon belongs to Player 1
							battle.p1Pokemon[pokemonName] = pokemon;
						} else if (parts[1] === "p2") {
							//If the pokemon belongs to Player 2
							battle.p2Pokemon[pokemonName] = pokemon;
						}
					}

					//Increments the total number of turns at the beginning of every new turn
					else if (line.startsWith(`|turn|`)) {
						battle.turns++;
					}

					//If a Pokemon switches, the active Pokemon must now change
					else if (
						line.startsWith(`|switch|`) ||
						line.startsWith(`|drag|`)
					) {
						if (parts[1].startsWith("p1")) {
							//If Player 1's Pokemon get switched out
							battle.p1a.hasSubstitute = false;
							battle.p1a.clearAfflictions(); //Clears all afflictions of the pokemon that switches out, like confusion
							let oldPokemon = battle.p1a;
							if (oldPokemon.name !== "") {
								battle.p1Pokemon[oldPokemon.name] = oldPokemon;
							}
							battle.p1a =
								battle.p1Pokemon[
									parts[2].split(",")[0].split("-")[0]
								];
							console.log(
								`${oldPokemon.name} has been switched into ${battle.p1a.name}`
							);
						} else if (parts[1].startsWith("p2")) {
							//If Player 2's Pokemon get switched out
							battle.p2a.hasSubstitute = false;
							battle.p2a.clearAfflictions(); //Clears all afflictions of the pokemon that switches out, like confusion
							let oldPokemon = battle.p2a;
							if (oldPokemon.name !== "") {
								battle.p2Pokemon[oldPokemon.name] = oldPokemon;
							}
							battle.p2a =
								battle.p2Pokemon[
									parts[2].split(",")[0].split("-")[0]
								];
							console.log(
								`${oldPokemon.name} has been switched into ${battle.p2a.name}`
							);
						}
					}

					//Removes the |-supereffective| or  |upkeep part of realdata if it exists
					else if (
						line.startsWith(`|-supereffective|`) ||
						line.startsWith(`|upkeep`)
					) {
						dataArr.splice(dataArr.length - 1, 1);
					}

					//If a weather condition is set
					else if (line.startsWith(`|-weather|`)) {
						if (
							!line.includes("[upkeep]") &&
							!line.includes("none")
						) {
							let weather = parts[1];
							console.log(line);
							let inflictor;
							try {
								//Weather is caused by an ability
								let side = parts[3].split("a: ")[0];
								if (side === "p1") {
									inflictor = battle.p1a.name;
								} else {
									inflictor = battle.p2a.name;
								}
							} catch (e) {
								//Weather is caused by a move
								let prevLine = dataArr[dataArr.length - 2];
								if (
									prevLine
										.split("|")
										.slice(1)[2]
										.startsWith("p1a")
								) {
									inflictor = battle.p1a.name;
								} else {
									inflictor = battle.p2a.name;
								}
							}
							console.log(`${inflictor} caused ${weather}.`);
							battle.setWeather(weather, inflictor);
						}

						//If the weather has been stopped
						if (parts[1] === "none") {
							battle.clearWeather();
						}
					}

					//Checks for certain specific moves: hazards, statuses, etc.
					else if (line.startsWith(`|move|`)) {
						let move = parts[2];
						console.log(line);

						if (
							move === "Stealth Rock" ||
							move === "Spikes" ||
							move === "Toxic Spikes"
						) {
							//Hazards
							//This would be true if there were already Rocks in the field
							let side = parts[3].split(": ")[0].split("a")[0];
							console.log(side);
							if (side.startsWith("p1")) {
								battle.addHazard(side, move, battle.p2a);
							} else {
								battle.addHazard(side, move, battle.p1a);
							}
						}
					}

					//Checks for statuses
					else if (line.startsWith(`|-status|`)) {
						let prevMoveLine = dataArr[dataArr.length - 2];
						let prevMove = prevMoveLine.split("|").slice(1)[2];
						if (
							prevMoveLine.startsWith(`|move|`) &&
							(toxicMoves.includes(prevMove) ||
								burnMoves.includes(prevMove))
						) {
							//If status was caused by a move
							if (
								prevMoveLine
									.split("|")
									.slice(1)[1]
									.startsWith("p1a")
							) {
								battle.p2a.statusEffect(parts[2], battle.p1a);
							} else {
								battle.p1a.statusEffect(parts[2], battle.p2a);
							}
						} else if (
							line.includes("ability") &&
							statusAbility.includes(
								parts[3].split("ability: ")[1].split("|")[0]
							)
						) {
							//Ability status
							let victimSide = parts[1].split(": ")[0];
							if (victimSide === "p1a") {
								battle.p1a.statusEffect(parts[2], battle.p2a);
							} else {
								battle.p2a.statusEffect(parts[2], battle.p1a);
							}
						} else {
							//If status wasn't caused by a move, but rather something like a hazard
							if (parts[1].split(": ")[0] === "p1a") {
								battle.p1a.statusEffect(
									parts[2],
									battle.hazardsSet.p1["Toxic Spikes"]
								);
							} else {
								battle.p2a.statusEffect(
									parts[2],
									battle.hazardsSet.p2["Toxic Spikes"]
								);
							}
						}
					}

					//If a hazard ends on a side
					else if (line.startsWith(`|-sideend|`)) {
						let side = parts[1].split(": ")[0];
						let hazard = parts[2];
						battle.endHazard(side, hazard);
					}

					//If an affliction like Leech Seed or confusion starts
					else if (line.startsWith(`|-start|`)) {
						let prevMove = dataArr[dataArr.length - 2];
						let affliction = parts[2];
						if (
							prevMove.startsWith(`|move|`) &&
							(prevMove.split("|").slice(1)[2] ===
								affliction.split("move: ")[1] ||
							confusionMoves.includes(
								prevMove.split("|").slice(1)[2]
							) || //For confusion
							affliction.includes("perish") || //For Perish Song
							affliction === "Curse" || //For Curse
								affliction === "Nightmare") //For Nightmare
						) {
							let move = affliction.split("move: ")[1]
								? affliction.split("move: ")[1]
								: affliction;
							let afflictor = prevMove
								.split("|")
								.slice(1)[1]
								.split(": ")[1];
							let side = parts[1].split(": ")[0];
							if (
								move === "Future Sight" ||
								move === "Doom Desire"
							) {
								if (side === "p2a") {
									battle.hazardsSet.p1[move] =
										battle.p2a.name;
								} else if (side === "p1a") {
									battle.hazardsSet.p2[move] =
										battle.p1a.name;
								}
							} else {
								console.log(
									"Started " + move + " by " + afflictor
								);
								if (side === "p1a") {
									battle.p1a.otherAffliction[move] =
										battle.p2a.name;
								} else if (side === "p2a") {
									battle.p2a.otherAffliction[move] =
										battle.p1a.name;
								}
							}
						} else if (affliction === `perish0`) {
							//Pokemon dies of perish song
							let side = parts[1].split(": ")[0];
							if (side === "p1a") {
								let deathJson = battle.p1a.died(
									affliction,
									battle.p1a.otherAffliction["perish3"],
									true
								);
								battle.p2Pokemon[
									battle.p1a.otherAffliction["perish3"]
								].killed(deathJson);
							} else if (side === "p2a") {
								let deathJson = battle.p2a.died(
									affliction,
									battle.p2a.otherAffliction["perish3"],
									true
								);
								console.log(
									JSON.stringify(battle.p1a.otherAffliction)
								);
								battle.p1Pokemon[
									battle.p2a.otherAffliction["perish3"]
								].killed(deathJson);
							}
						} else if (affliction === `Substitute`) {
							let side = parts[1].split(": ")[0];
							if (side === `p1a`) {
								battle.p1a.hasSubstitute = true;
							} else {
								battle.p2a.hasSubstitute = true;
							}
						}
						dataArr.splice(dataArr.length - 1, 1);
					} else if (line.startsWith(`|-end|`)) {
						let side = parts[1].split(": ")[0];
						let move = parts[2].split("move: ")[1];
						if (move === "Future Sight" || move === "Doom Desire") {
							if (side === "p1a") {
								if (!battle.p1a.hasSubstitute) {
									let killer = battle.hazardsSet.p1[move];
									let deathJson = battle.p1a.died(
										move,
										killer,
										true
									);
									battle.p2Pokemon[killer].killed(deathJson);
								}
								battle.p1a.hasSubstitute = false;
							} else if (side === "p2a") {
								if (!battle.p2a.hasSubstitute) {
									let killer = battle.hazardsSet.p2[move];
									let deathJson = battle.p2a.died(
										move,
										killer,
										true
									);
									battle.p1Pokemon[killer].killed(deathJson);
								}
								battle.p2a.hasSubstitute = false;
							}
						}
					} else if (line.startsWith(`|-immune|`)) {
						let side = parts[1].split(": ")[0];
						if (side === "p1a") {
							if (battle.p1a.isDead) {
								battle.p1a.undied();
								battle[battle.p1a.killer].unkilled();
							}
						}
						if (side === "p2a") {
							if (battle.p2a.isDead) {
								battle.p2a.undied();
								battle[battle.p2a.killer.name].unkilled();
							}
						}
					}

					//If a pokemon's status is cured
					else if (line.startsWith(`|-curestatus|`)) {
						let side = parts[1].split(": ")[0];
						if (side.startsWith("p1")) {
							battle.p1a.statusFix();
						} else {
							battle.p2a.statusFix();
						}
					}

					//When a Pokemon is damaged, and possibly faints
					else if (line.startsWith(`|-damage|`)) {
						//TODO destiny bond
						if (parts[2].endsWith("fnt")) {
							//A pokemon has fainted
							let victimSide = parts[1].split(": ")[0];

							if (parts[3] && parts[3].includes("[from]")) {
								//It's a special death, not a normal one.
								let move = parts[3].split("[from] ")[1];
								if (
									move === "Stealth Rock" ||
									move === "Spikes"
								) {
									//Hazards
									if (victimSide === "p1a") {
										let killer =
											battle.hazardsSet.p1[move].name;
										let deathJson = battle.p1a.died(
											move,
											killer,
											true
										);
										battle.p2Pokemon[killer].killed(
											deathJson
										);
										console.log(
											`${battle.p1a.name} was killed by ${killer} due to hazards.`
										);
									} else if (victimSide === "p2a") {
										let killer =
											battle.hazardsSet.p2[move].name;
										let deathJson = battle.p2a.died(
											move,
											killer,
											true
										);
										battle.p1Pokemon[killer].killed(
											deathJson
										);
										console.log(
											`${battle.p2a.name} was killed by ${killer} due to hazards.`
										);
									}
								} else if (
									move === "Hail" ||
									move === "Sandstorm"
								) {
									//Weather
									if (victimSide === "p1a") {
										console.log(battle.weatherInflictor);
										let killer = battle.weatherInflictor;
										let deathJson = battle.p1a.died(
											move,
											killer,
											true
										);
										battle.p2Pokemon[killer].killed(
											deathJson
										);
									}
									if (victimSide === "p2a") {
										let killer = battle.weatherInflictor;
										let deathJson = battle.p2a.died(
											move,
											killer,
											true
										);
										console.log(killer);
										battle.p1Pokemon[killer].killed(
											deathJson
										);
									}
								} else if (
									move === "brn" ||
									move === "psn" ||
									move === "tox"
								) {
									if (victimSide === "p1a") {
										let deathJson = battle.p1a.died(
											move,
											battle.p1a.statusInflictor,
											true
										);
										battle.p2Pokemon[
											battle.p1a.statusInflictor.name
										].killed(deathJson);
										console.log(
											`${battle.p1a.name} was killed by ${battle.p1a.statusInflictor.name}`
										);
									} else if (victimSide === "p2a") {
										let deathJson = battle.p2a.died(
											move,
											battle.p2a.statusInflictor,
											true
										);
										console.log(
											battle.p2a.statusInflictor.name
										);
										battle.p1Pokemon[
											battle.p2a.statusInflictor.name
										].killed(deathJson);
										console.log(
											`${battle.p2a.name} was killed by ${battle.p2a.statusInflictor.name}`
										);
									}
								} else if (
									recoilMoves.includes(move) ||
									move === "Recoil"
								) {
									//Recoil deaths
									if (victimSide == "p1a") {
										let deathJson = battle.p1a.died(
											"recoil",
											battle.p2a,
											false
										);
										battle.p2a.killed(deathJson);
									} else {
										let deathJson = battle.p2a.died(
											"recoil",
											battle.p1a,
											false
										);
										battle.p1a.killed(deathJson);
									}
								} else if (move.startsWith(`item: `)) {
									let item = move.split(": ")[1];

									if (
										victimSide === "p1a" &&
										!battle.p1a.isDead
									) {
										let deathJson = battle.p1a.died(
											item,
											battle.p2a,
											false
										);
										battle.p2a.killed(deathJson);
									} else if (
										victimSide === "p2a" &&
										!battle.p2a.isDead
									) {
										let deathJson = battle.p2a.died(
											item,
											battle.p1a,
											false
										);
										battle.p1a.killed(deathJson);
									}
								} else if (move.includes(`ability`)) {
									//Ability deaths
									if (victimSide == "p1a") {
										let deathJson = battle.p1a.died(
											"ability",
											battle.p2a,
											false
										);
										battle.p2a.killed(deathJson);
									} else {
										let deathJson = battle.p2a.died(
											"ability",
											battle.p1a,
											false
										);
										battle.p1a.killed(deathJson);
									}
								} else {
									//Affliction-caused deaths
									if (victimSide === "p1a") {
										let deathJson = battle.p1a.died(
											move,
											battle.p1a.otherAffliction[move],
											true
										);
										battle.p2Pokemon[
											battle.p1a.otherAffliction[move]
										].killed(deathJson);
									} else if (victimSide === "p2a") {
										let deathJson = battle.p2a.died(
											move,
											battle.p2a.otherAffliction[move],
											true
										);
										battle.p1Pokemon[
											battle.p2a.otherAffliction[move]
										].killed(deathJson);
									}
								}
							} else {
								//It's just a regular effing kill
								if (
									victimSide === "p1a" &&
									!battle.p1a.isDead
								) {
									let deathJson = battle.p1a.died(
										"direct",
										battle.p2a,
										false
									);
									battle.p2a.killed(deathJson);
								} else if (
									victimSide === "p2a" &&
									!battle.p2a.isDead
								) {
									let deathJson = battle.p2a.died(
										"direct",
										battle.p1a,
										false
									);
									battle.p1a.killed(deathJson);
								}
							}
						}
						dataArr.splice(dataArr.length - 1, 1);
					}

					//This is mostly only used for the victim of Destiny Bond
					else if (line.startsWith(`|faint|`)) {
						let victimSide = parts[1].split(": ")[0];
						let prevLine = dataArr[dataArr.length - 2];
						if (
							prevLine.startsWith(`|-activate|`) &&
							prevLine.endsWith(`Destiny Bond`)
						) {
							if (victimSide === "p1a") {
								let deathJson = battle.p1a.died(
									"Destiny Bond",
									battle.p2a,
									true
								);
								battle.p2a.killed(deathJson);
								console.log(
									`${battle.p1a.name} was killed by ${battle.p2a.name}`
								);
							}
							if (victimSide === "p2a") {
								let deathJson = battle.p2a.died(
									"Destiny Bond",
									battle.p1a,
									true
								);
								battle.p1a.killed(deathJson);
								console.log(
									`${battle.p2a.name} was killed by ${battle.p1a.name}`
								);
							}
						} else {
							//Regular kill if it wasn't picked up by the |-damage| statement
							if (victimSide === "p1a" && !battle.p1a.isDead) {
								let deathJson = battle.p1a.died(
									"faint",
									battle.p2a,
									false
								);
								battle.p2a.killed(deathJson);
								console.log(
									`${battle.p1a.name} was killed by ${battle.p2a.name}`
								);
							} else if (
								victimSide === "p2a" &&
								!battle.p2a.isDead
							) {
								let deathJson = battle.p2a.died(
									"faint",
									battle.p1a,
									false
								);
								battle.p1a.killed(deathJson);
								console.log(
									`${battle.p2a.name} was killed by ${battle.p1a.name}`
								);
							}
						}
					}

					//At the end of the match, when the winner is announced
					else if (line.startsWith(`|win|`)) {
						battle.winner = parts[1];
						battle.winner =
							battle.winner === battle.p1
								? `${battle.winner}p1`
								: `${battle.winner}p2`;
						battle.loser =
							battle.winner === `${battle.p1}p1`
								? `${battle.p2}p2`
								: `${battle.p1}p1`;

						console.log(`${battle.winner} won!`);
						this.websocket.send(`${this.battle}|/uploadreplay`); //Requesting the replay from Showdown
					}

					//After the match is done and replay request is sent, it uploads the replay and gets the link
					else if (line.startsWith("|queryresponse|savereplay")) {
						let replayData = JSON.parse(data.substring(26));
						battle.replay = await this.requestReplay(replayData);

						let info = {
							replay: battle.replay,
							turns: battle.turns,
							winner: battle.winner,
							loser: battle.loser,
						};

						//Creating the objects for kills and deaths
						//Player 1
						let killJsonp1 = {};
						let deathJsonp1 = {};
						for (let pokemonObj of Object.values(
							battle.p1Pokemon
						)) {
							killJsonp1[pokemonObj.name] = {
								direct: pokemonObj.directKills,
								passive: pokemonObj.passiveKills,
							};
							deathJsonp1[pokemonObj.name] = pokemonObj.isDead
								? 1
								: 0;
						}
						//Player 2
						let killJsonp2 = {};
						let deathJsonp2 = {};
						for (let pokemonObj of Object.values(
							battle.p2Pokemon
						)) {
							killJsonp2[pokemonObj.name] = {
								direct: pokemonObj.directKills,
								passive: pokemonObj.passiveKills,
							};
							deathJsonp2[pokemonObj.name] = pokemonObj.isDead
								? 1
								: 0;
						}

						if (
							battle.winner.endsWith("p1") &&
							battle.loser.endsWith("p2")
						) {
							await this.endscript(
								battle.winner,
								killJsonp1,
								deathJsonp1,
								battle.loser,
								killJsonp2,
								deathJsonp2,
								info
							);
						} else if (
							battle.winner.endsWith("p2") &&
							battle.loser.endsWith("p1")
						) {
							await this.endscript(
								battle.winner,
								killJsonp2,
								deathJsonp2,
								battle.loser,
								killJsonp1,
								deathJsonp1,
								info
							);
						} else {
							return { code: "-1" };
						}

						this.websocket.send(`|/leave ${this.battle}`);

						let returndata = {
							info: info,
							code: "0",
						};

						return returndata;
					}
				}
			} catch (e) {
				this.message.channel.send(
					`:x: Error with this match. I will be unable to update this match until you screenshot this message and send it to the Porygon server's general channel and **@harbar20#9389**.\n**Error:**\`\`\`${e}\`\`\``
				);
				console.error(e);
			}
		});
	}
}

module.exports = Showdown;
