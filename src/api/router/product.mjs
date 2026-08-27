import { Router } from "express";
import { getProductImage, getStoreImage } from "../utils/images.mjs";
import {
	sanitizeSearchQuery,
	toSearchTokens,
	sanitizeStoreId,
	sanitizeInteger,
	sanitizeSort,
} from "../utils/safeQuery.mjs";

const MAX_PRICE = 10000000; // el producto más caro que vi es de 10m
const MAX_MISSING = 999; // producto 10 veces que no se vio, "no esta en stock"
const STOCK_DAYS = 999; // ultima vez visto hace 5 días
const MAX_LIMIT = 1000;
const MAX_OFFSET = 100000;

const PRODUCT_SELECT = `
	listing_id,
	store_id,
	product_url,
	title_raw,
	last_price,
	has_image,
	image_url,
	stores!fk_store!inner (
		store_name,
		store_url,
		trust_factor
	)
`;

export const createProductRouter = ({ supabase }) => {
	const productController = Router();

	productController.get("/", async (req, res) => {
		const startedAt = Date.now();
		try {
			let currentOffset = sanitizeInteger(req.query.offset, {
				min: 0,
				max: MAX_OFFSET,
				fallback: 0,
			});

			let limit = sanitizeInteger(req.query.limit, { min: 1, max: MAX_LIMIT, fallback: 20 });
			if (limit > 30) {
				limit = 20;
			}

			/*
			! filtros por:
			* store_id 			 		     /products?q={search}&store_id=armytech
			* trust_factor  	 			 /products?q={search}&sort=trust_factor:desc
		    * relevance  					 /products?q={search}
			* el precio: [
			*  "precio más bajo",			 /products?q=mouse&sort=last_price:desc
			*  "precio mas alto", 		     /products?q=ram&sort=last_price:asc
			*  "rango de precio[MIN, MAX]"   /products?q={search}&minPrice=100000&maxPrice=250000
			]
			todos:
			* categoria de producto <- No implementado en ningún lado xd
			* Marca de producto
			*/

			const userQ = sanitizeSearchQuery(req.query.q);
			const searchTokens = toSearchTokens(userQ);

			const storeId = sanitizeStoreId(req.query.store_id);
			if (storeId === false) {
				return res.status(400).json({ error: "store_id inválido" });
			}

			const priceMin = sanitizeInteger(req.query.minPrice, { min: 0, max: MAX_PRICE });
			const priceMax = sanitizeInteger(req.query.maxPrice, { min: 0, max: MAX_PRICE });
			const sort = sanitizeSort(req.query.sort);

			const dateLimit = new Date();
			dateLimit.setDate(dateLimit.getDate() - STOCK_DAYS);
			const dateLimitIso = dateLimit.toISOString();

			// todo: hacer un filtro para excluir paginas que son de decoracion (shibuya) o armadoras de pcs.
			let query = supabase
				.from("products")
				.select(PRODUCT_SELECT, { count: "exact" })
				.lt("missing", MAX_MISSING)
				.gte("last_scraped_at", dateLimitIso);

			// el titulo tiene que contener todas las palabras buscadas
			for (const token of searchTokens) {
				query = query.ilike("title_raw", `%${token}%`);
			}

			if (storeId) {
				query = query.eq("store_id", storeId);
			}
			if (priceMin !== null) {
				query = query.gte("last_price", priceMin);
			}
			if (priceMax !== null) {
				query = query.lte("last_price", priceMax);
			}

			if (sort) {
				query = query.order(sort.column, { ascending: sort.ascending, nullsFirst: false });
			} else {
				query = query.order("stores(trust_factor)", { ascending: false, nullsFirst: false });
			}
			query = query.order("listing_id", { ascending: true });

			const { data, count, error } = await query.range(currentOffset, currentOffset + limit - 1);
			if (error) throw error;

			// al tener que esperar, promises, de awaits de tener imagenes en cloudflare, el obtener informacion de los productos hace que se tarde una locuta
			const enrichedHits = (data || []).map(({ stores, ...product }) => ({
				...product,
				store_name: stores?.store_name ?? null,
				store_url: stores?.store_url ?? null,
				trust_factor: stores?.trust_factor ?? null,
				image_url: product.has_image ? getProductImage(product.listing_id) : null,
				store_image_url: getStoreImage(product.store_id),
			}));

			res.json({
				hits: enrichedHits,
				query: userQ,
				processingTimeMs: Date.now() - startedAt,
				limit,
				offset: currentOffset,
				estimatedTotalHits: count ?? enrichedHits.length,
				totalHits: count ?? enrichedHits.length,
			});
		} catch (e) {
			console.log("error", e);
			res.status(500).json({ error: "Error interno del servidor" });
		}
	});

	return productController;
};
