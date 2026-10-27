import { S3Client, GetObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { createPresignedPost } from '@aws-sdk/s3-presigned-post';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { Config } from '../config.js';

export interface UploadTicket {
  /** POST a multipart form to this URL with `fields` first, then the file as `file`. */
  url: string;
  fields: Record<string, string>;
  key: string;
  expiresIn: number;
}

export interface Storage {
  presignUpload(key: string, contentType: string, maxBytes: number): Promise<UploadTicket>;
  viewUrl(key: string): Promise<string>;
  exists(key: string): Promise<boolean>;
}

export const PROOF_TYPES: Record<string, { ext: string; media: 'photo' | 'video'; maxBytes: number }> = {
  'image/jpeg': { ext: 'jpg', media: 'photo', maxBytes: 15 * 1024 * 1024 },
  'image/png': { ext: 'png', media: 'photo', maxBytes: 15 * 1024 * 1024 },
  'image/heic': { ext: 'heic', media: 'photo', maxBytes: 15 * 1024 * 1024 },
  'video/mp4': { ext: 'mp4', media: 'video', maxBytes: 60 * 1024 * 1024 },
  'video/quicktime': { ext: 'mov', media: 'video', maxBytes: 60 * 1024 * 1024 },
};

export const DOC_TYPES: Record<string, { ext: string; maxBytes: number }> = {
  'application/pdf': { ext: 'pdf', maxBytes: 15 * 1024 * 1024 },
  'image/jpeg': { ext: 'jpg', maxBytes: 15 * 1024 * 1024 },
  'image/png': { ext: 'png', maxBytes: 15 * 1024 * 1024 },
  'video/mp4': { ext: 'mp4', maxBytes: 200 * 1024 * 1024 },
  'video/quicktime': { ext: 'mov', maxBytes: 200 * 1024 * 1024 },
  'audio/mpeg': { ext: 'mp3', maxBytes: 10 * 1024 * 1024 },
  'audio/mp4': { ext: 'm4a', maxBytes: 10 * 1024 * 1024 },
};

const EXPIRES = 10 * 60;

export function createStorage(config: Config): Storage {
  if (config.STORAGE_DRIVER === 'local') {
    // Development only: no real files. Upload tickets and links are placeholders.
    return {
      async presignUpload(key) {
        return { url: `${config.PUBLIC_BASE_URL}/dev/uploads`, fields: { key }, key, expiresIn: EXPIRES };
      },
      async viewUrl(key) { return `${config.PUBLIC_BASE_URL}/dev/files/${encodeURIComponent(key)}`; },
      async exists() { return true; },
    };
  }

  const s3 = new S3Client({ region: config.AWS_REGION });
  const Bucket = config.S3_BUCKET!;
  return {
    async presignUpload(key, contentType, maxBytes) {
      const { url, fields } = await createPresignedPost(s3, {
        Bucket,
        Key: key,
        Expires: EXPIRES,
        Fields: { 'Content-Type': contentType },
        Conditions: [['content-length-range', 1, maxBytes], ['eq', '$Content-Type', contentType]],
      });
      return { url, fields, key, expiresIn: EXPIRES };
    },
    async viewUrl(key) {
      return getSignedUrl(s3, new GetObjectCommand({ Bucket, Key: key }), { expiresIn: 3600 });
    },
    async exists(key) {
      try {
        await s3.send(new HeadObjectCommand({ Bucket, Key: key }));
        return true;
      } catch {
        return false;
      }
    },
  };
}
