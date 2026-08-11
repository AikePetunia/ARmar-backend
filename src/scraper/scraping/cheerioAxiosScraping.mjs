// ========================================================
// 2. La opción intermedia
// Obtengo todas las rutas (getStorePaths), luego Axios + Cheerio, entran página por pagina.
// Usado tiendas basadas en: Tiendanube, WooCommerce, Shopify, PrestaShop
// ========================================================

import * as cheerio from "cheerio";
import axios from "axios";
import { parsePrice, hashCode } from "./utils/utils.mjs";
import { convertImage } from "./utils/convertImage.mjs";
const scraperClient = axios.create({
	timeout: 30000, // 15 segundos máximo antes de abortar si el server no responde
	headers: {
		"User-Agent": "ARmar/0.1 [https://aike.tech, discord: venus.s.s]",
		Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
		"Accept-Language": "es-ES,es;q=0.9",
		Connection: "keep-alive",
	},
});

export async function cheerioAxiosScraping(
	url,
	store_base_url,
	config,
	seen = new Set(),
	runId = Date.now()
) {
	try {
		console.log("[CheAxios] Extrayendo productos desde:", url);
		const response = await scraperClient.get(url);
		const html = response.data;

		const $ = cheerio.load(html);
		const products = [];
		const storeId = config.store_id;
		const attributes = ["data-src", "data-lazy-src", "srcset", "src"];

		const nodes = $(config.selectors.productWrapper).toArray();

		for (const element of nodes) {
			const titleRaw = $(element).find(config.selectors.title_raw).text().trim();
			const productUrl = $(element).find(config.selectors.product_url).attr("href");

			if (!titleRaw || !productUrl) continue;

			const imgElement = $(element).find(config.selectors.image_url);
			const imageUrl =
				imgElement.attr("src") ||
				imgElement.attr("data-src") ||
				imgElement.attr("data-lazy-src") ||
				imgElement.attr("srcset");

			const priceText = $(element).find(config.selectors.price).text().trim();

			const listing_id = `${storeId}_${hashCode(productUrl)}`;
			if (seen.has(listing_id)) continue;

			seen.add(listing_id);

			let hasImageBool = await convertImage(imageUrl, store_base_url, listing_id);

			products.push({
				listing_id,
				store_id: storeId,
				source_page_url: url,
				product_url: productUrl,
				title_raw: titleRaw,
				image_url: imageUrl,
				has_image: hasImageBool,
				stock_status: true,
				product_tags: [],
				last_price: parsePrice(priceText),
				last_scraped_at: new Date().toISOString(),
				missing: 0,
				last_run_id: runId,
			});
		}
		return products;
	} catch (error) {
		// Axios guarda el status en error.response.status si el server respondió con error
		const status = error.response ? error.response.status : "Network/Timeout";
		console.error(`[${status}] failed extracting ${url}:`, error.message);
		return [];
	}
}
