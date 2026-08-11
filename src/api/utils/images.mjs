// trae las imagenes de r2
import path from "path";
import { fileURLToPath } from "url";
import { S3Client } from "@aws-sdk/client-s3";
import dotenv from "dotenv";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, "../../../.env") });

export function getProductImage(listing_id) {
	if (!/^[a-zA-Z0-9_-]+$/.test(listing_id)) return null;
	const fileName = `${listing_id}.avif`;
	const PRODUCT_URL_R2 = "https://img.armar.dev/products";
	const url = `${PRODUCT_URL_R2}/${fileName}`;
	return url;
}

export function getStoreImage(store_id) {
	if (!/^[a-zA-Z0-9_-]+$/.test(store_id)) return null;
	const fileName = `${store_id}.webp`;
	const STORE_URL_R2 = "https://img.armar.dev/stores";
	const url = `${STORE_URL_R2}/${fileName}`;
	return url;
}

