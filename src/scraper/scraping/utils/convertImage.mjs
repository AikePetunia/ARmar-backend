import sharp from "sharp";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config();

// Descarga la imagen
// La convierte en .avif
// La pone en 512x512
// Le pone el nombre de listing_id
// No debe de repetir imagenes.
// La sube a r2

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY);
// pongo en el set, listing id y hasImage
const r2Client = new S3Client({
	region: "auto",
	endpoint: `https://${process.env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`,
	forcePathStyle: true,
	credentials: {
		accessKeyId: process.env.CLOUDFLARE_S3_ID,
		secretAccessKey: process.env.CLOUDFLARE_S3_SECRET,
	},
});

// ! la fuente de verdad es la db, no el bucket.
const hasImageSet = new Set();
const PAGE_SIZE = 1000;
async function createSetFromDB() {
	let count = 0;
	while (count <= 20000) {
		const { data: products, error } = await supabase
			.from("products")
			.select("listing_id, has_image")
			.range(count, count + PAGE_SIZE - 1);

		products.forEach((product) => {
			if (product.has_image) {
				hasImageSet.add(product.listing_id);
			}
		});
		if (error || products.length < PAGE_SIZE) break;

		count += PAGE_SIZE;
	}
}
await createSetFromDB();

const BUCKET_NAME = "imgs";
const BUCKET_PREFIX = "products";
export async function convertImage(image_url, store_base_url, listing_id) {
	let fileName = `${listing_id}.avif`;
	let hasImage = false;
	if (hasImageSet.has(listing_id)) {
		hasImage = true;
		console.log("imagen ya en bucket", fileName);
		return hasImage;
	}

	if (!image_url.includes("https")) {
		image_url = store_base_url + "/" + image_url;
	}

	// si el set tiene imagen segun el listing id, retorno temprano.
	try {
		const response = await fetch(image_url);
		if (!response.ok) {
			throw new Error(`error al descargar imagen${response.status}`);
		}

		let arrayBuffer = await response.arrayBuffer();
		let buffer = Buffer.from(arrayBuffer);

		let image = await sharp(buffer)
			.resize(512, 512, {
				fit: "cover",
				position: "center",
			})
			.avif({ quality: 80 })
			.toBuffer();

		hasImage = await uploadImage(image, fileName);
		if (hasImage) {
			hasImageSet.add(listing_id);
		}
		return hasImage;
	} catch (error) {
		console.error(`fallo al procesar el listing_id ${listing_id}:`, error.message);
		return hasImage;
	}
}

// recibe el buffer (o sea, imagen en la memoria ram) y la sube a r2.
async function uploadImage(image, fileName) {
	try {
		const uploadParams = {
			Bucket: BUCKET_NAME, // bucket
			Key: `${BUCKET_PREFIX}/${fileName}`, // nombre
			Body: image,
			ContentType: "image/avif",
		};

		//	console.log(`Uploading ${fileName} to R2...`);
		const command = new PutObjectCommand(uploadParams);
		await r2Client.send(command);

		//console.log(`Uploaded, saved as: ${fileName}`);
		return true;
	} catch (e) {
		console.log("error cloudfare", e);
		return false;
	}
}
