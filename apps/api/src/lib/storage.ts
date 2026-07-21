// ============================================================================
// WHAT THIS FILE DOES (in plain English)
// ----------------------------------------------------------------------------
// The ONE place in the whole app that knows how to talk to MinIO - same
// "one shared instance, imported where needed" idea as lib/logger.ts's
// `logger` and lib/socket.ts's `io`. MinIO speaks the same protocol as
// Amazon S3 ("S3-compatible"), which is why this file imports an AWS SDK
// package even though there's no AWS account involved anywhere - the SDK
// just needs to be pointed at MinIO's own address instead of Amazon's.
//
// Three jobs live here:
//   1. `ensureBucketExists()` - called once at startup (see index.ts).
//      docker-compose.yml runs MinIO, but a fresh MinIO server has ZERO
//      buckets in it - nothing creates one automatically. Without this
//      check, the very first upload anyone tried would fail with a
//      confusing "bucket does not exist" error deep inside the SDK.
//   2. `uploadFileToStorage` / `deleteFileFromStorage` - put/remove the
//      actual file bytes.
//   3. `getSignedDownloadUrl` - see its own comment below; this is the
//      actual mechanism the frontend uses to download a file.
// ============================================================================

import {
  S3Client,
  HeadBucketCommand,
  CreateBucketCommand,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "../config/env.js";
import { logger } from "./logger.js";

// TYPESCRIPT NOTE: `new S3Client({...})` - this looks identical to how
// you'd talk to REAL Amazon S3. The only OpsSphere-specific parts are
// `endpoint` (pointing at our own MinIO container instead of Amazon's
// servers) and `forcePathStyle: true` (MinIO expects URLs shaped like
// `http://host:9000/bucket-name/key`, not S3's `bucket-name.host/key` -
// this flag tells the SDK to use the MinIO-friendly shape).
const s3 = new S3Client({
  endpoint: `http://${env.MINIO_ENDPOINT}:${env.MINIO_PORT}`,
  region: "us-east-1", // MinIO doesn't care about regions, but the SDK requires SOME value here
  forcePathStyle: true,
  credentials: {
    accessKeyId: env.MINIO_ACCESS_KEY,
    secretAccessKey: env.MINIO_SECRET_KEY,
  },
});

const BUCKET = env.MINIO_BUCKET;

// Checks whether our bucket already exists, and creates it if not.
// Deliberately does NOT crash the whole server if MinIO is unreachable -
// contrast with config/env.ts's hard `process.exit(1)` on bad
// credentials/secrets. The reasoning: a missing/misconfigured
// ACCESS_TOKEN_SECRET breaks EVERY route in the app (nothing works
// without auth), but MinIO being down only breaks file uploads - every
// other feature (tasks, tickets, risks, ...) should keep working. A
// warning in the logs is the right amount of alarm here, not a full stop.
export async function ensureBucketExists(): Promise<void> {
  try {
    await s3.send(new HeadBucketCommand({ Bucket: BUCKET }));
    logger.info(`Storage bucket "${BUCKET}" already exists`);
  } catch {
    // HeadBucketCommand throws for ANY failure (missing bucket, wrong
    // credentials, MinIO unreachable) - it doesn't distinguish. We try to
    // create it; if MinIO is genuinely unreachable, this second call fails
    // too, and THAT failure is what we actually log and swallow.
    try {
      await s3.send(new CreateBucketCommand({ Bucket: BUCKET }));
      logger.info(`Storage bucket "${BUCKET}" created`);
    } catch (err) {
      logger.warn({ err }, "Could not reach MinIO / create storage bucket - file uploads will fail until this is fixed");
    }
  }
}

export async function uploadFileToStorage(key: string, buffer: Buffer, contentType: string): Promise<void> {
  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    })
  );
}

export async function deleteFileFromStorage(key: string): Promise<void> {
  await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
}

// DAY 12's actual new CONCEPT: files are never served directly through our
// own API (no "GET /attachments/:id/raw" route streaming bytes through
// Express). Instead, we ask MinIO to generate a URL that's valid for a
// short window (15 minutes) and points STRAIGHT at MinIO - the browser
// downloads the file directly from MinIO, our server never touches the
// bytes on the way out. This is the standard real-world S3 pattern (a
// "presigned URL"): the signature bakes in an expiry time, so a link
// copy-pasted somewhere and left sitting around eventually stops working
// on its own, without needing any code to actively revoke it.
const SIGNED_URL_TTL_SECONDS = 15 * 60;

export async function getSignedDownloadUrl(key: string): Promise<string> {
  const command = new GetObjectCommand({ Bucket: BUCKET, Key: key });
  return getSignedUrl(s3, command, { expiresIn: SIGNED_URL_TTL_SECONDS });
}
