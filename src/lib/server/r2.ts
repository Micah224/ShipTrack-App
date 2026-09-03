import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { optional, optionalNumber, required } from './env';

/*
 * Cloudflare R2 over the S3 API.
 *
 * R2 charges nothing for egress, which is the whole reason release archives
 * live here rather than being streamed back through a Vercel function: a 6 MB
 * zip pulled by every site on every update would otherwise be the largest line
 * on the bill and the slowest thing in the request path.
 */
let cached: S3Client | undefined;

export function bucketName(): string {
	return optional('R2_BUCKET', 'shiptrack-app-store');
}

function client(): S3Client {
	cached ??= new S3Client({
		region: 'auto',
		endpoint: `https://${required('R2_ACCOUNT_ID')}.r2.cloudflarestorage.com`,
		credentials: {
			accessKeyId: required('R2_ACCESS_KEY_ID'),
			secretAccessKey: required('R2_SECRET_ACCESS_KEY')
		}
	});
	return cached;
}

export async function uploadReleaseZip(key: string, body: Buffer, sha256: string): Promise<void> {
	await client().send(
		new PutObjectCommand({
			Bucket: bucketName(),
			Key: key,
			Body: body,
			ContentType: 'application/zip',
			ChecksumSHA256: Buffer.from(sha256, 'hex').toString('base64'),
			Metadata: { sha256 }
		})
	);
}

/** Presigned GET. Short-lived by design — it is handed straight to WordPress. */
export async function presignReleaseDownload(key: string, filename: string): Promise<string> {
	return getSignedUrl(
		client(),
		new GetObjectCommand({
			Bucket: bucketName(),
			Key: key,
			ResponseContentDisposition: `attachment; filename="${filename}"`
		}),
		{ expiresIn: optionalNumber('R2_PRESIGN_TTL_SECONDS', 900) }
	);
}
