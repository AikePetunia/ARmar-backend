import { storesInformation } from "../config/storesInformation.mjs";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import fs from "fs/promises";

dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY);


export async function storesDump() {
	console.log("Writing all stores info to dump...");
	let stores = [];
	try {
		for (const [siteKey, config] of Object.entries(storesInformation)) {
			let store = {};
			store = {
				store_id: config.store_id,
				store_name: config.store_name,
				store_url: config.store_url,
				trust_factor: config.trust_factor,
				store_role: config.store_role,
				tags: config.tags,
				created_at: new Date().toISOString(),
			};
			stores.push(store);
		}

		console.log("saving to DB");
const { data: dbStores, error } = await supabase.from("stores").upsert(stores).select();

		if (error) {
			console.log("error", error);
		}
		console.log("Inserted to DB");

		await fs.writeFile(`./data/dumps/storesDump.json`, JSON.stringify(stores, null, 2));
		console.log("json saved.");
	} catch (e) {
		console.log("Error writing stores dump:", e);
	}
}

