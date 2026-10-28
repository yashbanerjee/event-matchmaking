import { createHash, randomBytes } from 'crypto';
import { createReadStream, promises as fs } from 'fs';
import { dirname, join } from 'path';
import type { StorageProvider, StoredObject } from './storage.provider';

export class LocalStorageProvider implements StorageProvider {
  readonly name = 'local';

  constructor(private readonly rootPath: string) {}

  async putObject(input: {
    key: string;
    body: Buffer;
    mimeType: string;
  }): Promise<StoredObject> {
    const fullPath = join(this.rootPath, input.key);
    await fs.mkdir(dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, input.body);
    return {
      key: input.key,
      sizeBytes: input.body.byteLength,
      mimeType: input.mimeType,
      checksumSha256: createHash('sha256').update(input.body).digest('hex'),
    };
  }

  async getSignedDownloadUrl(
    key: string,
    expiresInSeconds = 900,
  ): Promise<string> {
    // Local adapter: tokenized path valid for expiresInSeconds (validated by API).
    const token = randomBytes(16).toString('hex');
    const expires = Math.floor(Date.now() / 1000) + expiresInSeconds;
    return `/api/v1/documents/local-download?key=${encodeURIComponent(key)}&expires=${expires}&token=${token}`;
  }

  async deleteObject(key: string): Promise<void> {
    const fullPath = join(this.rootPath, key);
    await fs.unlink(fullPath).catch(() => undefined);
  }

  createReadStream(key: string) {
    return createReadStream(join(this.rootPath, key));
  }

  resolvePath(key: string) {
    return join(this.rootPath, key);
  }
}
