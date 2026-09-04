import sharp from "sharp";
import { S3Client, PutObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config();

/**
 * Consulta la DB si tiene imagen el producto
 * Si tiene imagen, extrae el URL, storebaseurl, y el listing id
 * lo pasa por sharp para pasarlo a 512x512 .avif
 * lo sube a cloudflare
 */
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY);
const r2Client = new S3Client({
	region: "auto",
	endpoint: `https://${process.env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`,
	forcePathStyle: true,
	credentials: {
		accessKeyId: process.env.CLOUDFLARE_S3_ID,
		secretAccessKey: process.env.CLOUDFLARE_S3_SECRET,
	},
});

const PAGE_SIZE = 1000;
let imagesToUpload = [];
const BUCKET_NAME = "imgs";
const BUCKET_PREFIX = "products";

async function getImagesFromDB() {
	let count = 0;
	while (count <= 35000) {
		const { data: products, error } = await supabase
			.from("products")
			.select(
				`
				listing_id,
				has_image, 
				image_url,
				stores!fk_store!inner (
					store_url
				)
			`
			)
			.eq("has_image", true)
			.range(count, count + PAGE_SIZE - 1);

		if (error) {
			console.error("erro en la DB", error);
		}

		if (!products || products.length === 0) break;

		console.log("insertando imagenes a subir...");
		products.forEach((product) => {
			const storeUrl = product.stores?.store_url || "";

			imagesToUpload.push({
				has_image: product.has_image,
				store_base_url: storeUrl,
				image_url: product.image_url,
				listing_id: product.listing_id,
			});
		});
		if (products.length < PAGE_SIZE) break;

		count += PAGE_SIZE;
	}
}

/*
si existe el has image queda true, o sea:
has_image: true
image_url: <url>

FINALMENTE:
has_image: <tiene url y está subida a Cloudflare> 
*/

async function updateProductImageStatus(listing_id, is_success) {
	const { error } = await supabase
		.from("products")
		.update({ has_image: is_success })
		.eq("listing_id", listing_id);

	if (error) {
		console.error("error con la DB", error);
	} else {
		console.log("DB updated con", listing_id);
	}
}

export async function convertImage() {
	await getImagesFromDB();
	console.log(`imagenes a procesar: ${imagesToUpload.length}`);

	for (let { store_base_url, image_url, listing_id } of imagesToUpload) {
		let fileName = `${listing_id}.avif`;
		let imageExistsInCloudflare = await doesImageExist(listing_id);

		if (imageExistsInCloudflare) {
			console.log(`imagen ${listing_id} ya existe en r2`);
			continue;
		}

		if (!image_url.includes("https")) {
			image_url = store_base_url + "/" + image_url;
		}

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

			const upload_success = await uploadImage(image, fileName);

			if (upload_success) {
				await updateProductImageStatus(listing_id, true);
			} else {
				await updateProductImageStatus(listing_id, false);
			}
		} catch (error) {
			await updateProductImageStatus(listing_id, false);
			console.error(`fallo al procesar el listing_id ${listing_id}:`, error.message);
		}
	}
}
await convertImage();

// recibe el buffer (o sea, imagen en la memoria ram) y la sube a r2.
async function uploadImage(image, fileName) {
	try {
		const uploadParams = {
			Bucket: BUCKET_NAME,
			Key: `${BUCKET_PREFIX}/${fileName}`,
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

async function doesImageExist(listing_id) {
	const fullKey = `${BUCKET_PREFIX}/${listing_id}`;
	try {
		const command = new HeadObjectCommand({
			Bucket: BUCKET_NAME,
			Key: fullKey,
		});

		await r2Client.send(command);
		return true;
	} catch (error) {
		if (error.name === "NotFound" || error.$metadata?.httpStatusCode === 404) {
			return false;
		}

		console.error("Error checkeando existencia de imagen en r2:", error);
		throw error;
	}
}
