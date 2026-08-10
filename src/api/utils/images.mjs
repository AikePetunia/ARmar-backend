// trae las imagenes de r2
import path from "path";
import { fileURLToPath } from "url";
import { S3Client } from "@aws-sdk/client-s3";
import dotenv from "dotenv";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, "../../../.env") });

// en cloudflare podes devolver un link publico, o uno con autorizacion para entrar al bucket
// actualmente es publico y dev, cambiar en prod posta
export function getProductImage(listing_id) {
	if (!/^[a-zA-Z0-9_-]+$/.test(listing_id)) return null;
	const fileName = `${listing_id}.avif`;
	const DEV_URL_PRODUCT = process.env.DEV_URL_PRODUCT;
	const url = `${DEV_URL_PRODUCT}/${fileName}`;
	return url;
}

export function getStoreImage(store_id) {
	if (!/^[a-zA-Z0-9_-]+$/.test(store_id)) return null;
	const fileName = `${store_id}.webp`;
	const DEV_URL_STORE = process.env.DEV_URL_STORE;
	const url = `${DEV_URL_STORE}/${fileName}`;
	return url;
}

/*
const accessKeyId = process.env.CLOUDFLARE_S3_ID?.trim();
const secretAccessKey = process.env.CLOUDFLARE_S3_SECRET?.trim();
const accountId = process.env.CLOUDFLARE_ACCOUNT_ID?.trim();

if (!accountId || !accessKeyId || !secretAccessKey) {
	throw new Error("Faltan variables de entorno de R2");
}
const r2Client = new S3Client({
	region: "auto",
	endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
	forcePathStyle: true,
	credentials: {
		accessKeyId,
		secretAccessKey,
	},
});

getProductImage con url privada para evitar abuso; cambiar si pasa.
export async function getProductImage(req, res, listing_id) {
	//if (!/^[a-zA-Z0-9_-]+$/.test(listing_id)) return null;
	const fileName = `${listing_id}.avif`;
	try {
		const command = new GetObjectCommand({
			Bucket: "products",
			Key: fileName,
		});

		  const signedUrl = await getSignedUrl(r2Client, command, { expiresIn: 100 });
			return signedUrl;
	} catch (error) {
		console.error("Error al obtener la imagen:", error.message, "key:", fileName);
		if (error.name === "NoSuchKey") {
			return res.status(404);
		}
		//res.status(500).send("Error interno del servidor");
	}
} */
