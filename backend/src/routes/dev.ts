import { createReadStream, existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import multipart from '@fastify/multipart';
import type { FastifyInstance } from 'fastify';
import type { Ctx } from '../app.js';
import { badRequest, notFound } from '../lib/errors.js';
import { DOC_TYPES, PROOF_TYPES, localPath } from '../lib/storage.js';

const TYPES: Record<string, string> = Object.fromEntries(
  [...Object.entries(PROOF_TYPES), ...Object.entries(DOC_TYPES)].map(([type, t]) => [t.ext, type]),
);

/**
 * Development stand-in for S3 when STORAGE_DRIVER=local: the app posts the same multipart form it
 * would send to S3, and proof links are served from the local folder. Never registered in production.
 */
export async function devStorageRoutes(app: FastifyInstance, ctx: Ctx) {
  await app.register(multipart, { limits: { fileSize: 200 * 1024 * 1024, files: 1 } });

  app.post('/dev/uploads', async (req, reply) => {
    let key: string | null = null;
    let saved = false;
    for await (const part of req.parts()) {
      if (part.type === 'field' && part.fieldname === 'key') key = String(part.value);
      else if (part.type === 'file') {
        if (!key) throw badRequest('Send the key field before the file');
        const path = localPath(ctx.config, key);
        await mkdir(dirname(path), { recursive: true });
        await writeFile(path, await part.toBuffer());
        saved = true;
      }
    }
    if (!saved) throw badRequest('No file received');
    return reply.status(204).send();
  });

  app.get('/dev/files/*', async (req, reply) => {
    const key = decodeURIComponent((req.params as { '*': string })['*']);
    const path = localPath(ctx.config, key);
    if (!existsSync(path)) throw notFound('File not found');
    return reply.type(TYPES[key.split('.').pop() ?? ''] ?? 'application/octet-stream').send(createReadStream(path));
  });
}
