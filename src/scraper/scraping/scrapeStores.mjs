import pLimit from "p-limit";
import { cheerioAxiosScraping } from "./cheerioAxiosScraping.mjs";
import { fetchScraping } from "./fetchScraping.mjs";
import { storesInformation } from "../config/storesInformation.mjs";
import fs from "fs/promises";
import { all } from "axios";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import { PlaywrightScraping } from "./playwrightScraping.mjs";

dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY);

async function loadFailedStores() {
	try {
		const content = await fs.readFile("./data/failedStores.json", "utf-8");
		return JSON.parse(content);
	} catch (error) {
		console.log("failed to load failed stores", error);
		return [];
	}
}

const limit = pLimit(5);
const storesEntries = Object.entries(storesInformation); // esto es el nombre de la tienda en su config (armyTech: new SiteConfig)
const allProducts = [];
const storeRuns = [];
const storeToTest = null; // it's by entry name. Use null for ignoring
const storeAmountToTest = 999;
const storePagesToTest = 999;
const failedStores = await loadFailedStores();
const globalSeen = new Set();
let i = 0;

// entra tienda por tienda, y dentro de cada tienda entra categoría por categoría
export async function scrapeStores() {
	for (const [storeName, config] of storesEntries) {
		if (i >= storeAmountToTest) break;
		if (storeToTest && storeName !== storeToTest) continue;

		const runId = Date.now();
		const storeTasks = [];

		// ! Solo axios interceptando un fetch.
		if (config.public_fetching_url) {
			console.log("tienda con public fetching", storeName);
			storeTasks.push(limit(() => fetchScraping(config, runId)));
		} else {
			console.log("cheerio + axios con", storeName);
			const storeToAccess = config.store_url;
			let j = 0;
			storeRuns.push({ store_id: config.store_id, run_id: runId });
			for (const categoryPath of config.pages) {
				if (j >= storePagesToTest) break;
				let fullCategoryUrl = storeToAccess + categoryPath;
				storeTasks.push(
					limit(() => cheerioAxiosScraping(fullCategoryUrl, config, globalSeen, runId))
				);
				j++;
			}
		}

		// escribimos resultados por tienda
		let storeResults = await Promise.all(storeTasks);
		let storeProducts = storeResults.flat();

		if (storeProducts.length != 0 && !config.public_fetching_url) {
			console.log("Cheerio no trajo nada, pruebo Playwright con", storeName);
			const scraper = new PlaywrightScraping(config, runId, globalSeen);
			storeProducts = await scraper.scrapeProducts();
		}

		if (storeProducts.length != 0) {
			await fs.writeFile(`./data/raw/${storeName}.json`, JSON.stringify(storeProducts, null, 2));
		} else {
			failedStores.push(storeName);
			await fs.writeFile(`./data/failedStores.json`, JSON.stringify(failedStores, null, 2));
		}

		allProducts.push(...storeProducts);
		await fs.writeFile(`./data/raw/allProducts.json`, JSON.stringify(allProducts, null, 2));
		i++;
	}

	// inserto datos a supabase
	const uniqueProductsByListingId = [
		...new Map(allProducts.map((product) => [product.listing_id, product])).values(),
	];
	const { data, error } = await supabase
		.from("products")
		.upsert(uniqueProductsByListingId)
		.select();
	if (error) throw error;

	await increment_missing();
	await purge_products();
}

await scrapeStores();
/*
	Por tienda, tiene un "id de sesion", si en esa sesion, un producto no volvio a aparecer, incrementa missing.

	->Criterios para desaparecer del front un producto:
	last_scraped_at > 1 día y missing > 5..
	Esto hace que un producto no este más en stock.

	->Criterio para sacar un producto de la DB
	como no cago plata para mantener un DB cara xd, voy a tomar de criterio.
	last_scraped_at > 7 día
	missing > 30.
	*/

async function increment_missing() {
	console.log("updating missing counters...");
	for (const run of storeRuns) {
		const { error: rpcError } = await supabase.rpc("increment_missingv2", {
			p_store_id: run.store_id,
			p_current_run_id: run.run_id,
		});

		if (rpcError) {
			console.error(`Error incrementando missing para tienda ${run.store_id}:`, rpcError);
		}
	}
	console.log("missing counters updated");
}

async function purge_products() {
	try {
		console.log("trying to delete old products...");
		const { data, error } = await supabase.rpc("purge_products", {
			p_days_old: 7,
			p_missing_min: 30,
		});
		console.log(`deleted ${data} products`);
	} catch (e) {
		console.log("error deleting product.");
	}
}

