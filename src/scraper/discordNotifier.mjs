import dotenv from "dotenv";
dotenv.config();

let SELECTED_NOTIFICATOR;

export async function sendDiscordNotification({ type, taskName, status, stats = {} }) {
	switch (type) {
		case "SUCCESFUL_TASK":
			console.log("SUCCESFUL_TASK received, ");
			SELECTED_NOTIFICATOR = process.env.DISCORD_WEBHOOK_SUCCESFUL_TASK;
			break;

		case "ERROR_TASK":
			SELECTED_NOTIFICATOR = process.env.DISCORD_WEBHOOK_ERROR_TASK;
			break;
	}
	if (!type) {
		console.warn("Discord notifier called without a type!");
		return;
	}

	switch (status) {
		case "success":
			console.log("this task succeeded");
			break;
		case "failed":
			console.log("this task failed");
			break;
	}

	let statsText = "";

	if (status === "success") {
		switch (taskName) {
			case "getStorePaths":
				statsText =
					"```\n" + `Success in: ${stats.sucessStores}\n` + `Failed  : ${stats.failed}\n` + "```";
			case "storesDump":
				statsText = "```\n" + `Stores : ${stats.storesInfo}\n` + "```";
				break;

			case "scrapeStores":
				statsText =
					"```\n" +
					`Products scraped : ${stats.allProducts}\n` +
					`With products    : ${stats.storesWithProducts}\n` +
					`Without products : ${stats.storeWithoutProducts}\n` +
					"```";
				break;

			default:
				statsText = "-";
				break;
		}
	} else {
		statsText = "Task Failed.";
	}

	const embedColor = status === "success" ? 3066993 : 15158332;

	const payload = {
		username: "[ARmar] Tasks notifier",
		avatar_url: "https://armarfrontend.vercel.app/assets/eye-D1xYL9FF.gif",
		embeds: [
			{
				title: `Cron Job Finished: ${status.toUpperCase()}`,
				color: embedColor,
				fields: [
					{
						name: "Executed Task",
						value: `\`${taskName}\``,
						inline: false,
					},
					{
						name: "Execution Statistics",
						value: statsText,
						inline: false,
					},
				],
				timestamp: new Date().toISOString(),
				footer: {
					text: "ARmar Task Manager",
				},
			},
		],
	};

	try {
		const response = await fetch(SELECTED_NOTIFICATOR, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(payload),
		});

		if (response.ok) {
			console.log("Message sent successfully!");
		} else {
			console.error("Failed to send:", response.statusText);
		}
	} catch (error) {
		console.error("Error sending webhook:", error);
	}
}
