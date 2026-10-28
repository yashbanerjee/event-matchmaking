import { createHash } from 'crypto';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { StorageProvider, StoredObject } from './storage.provider';

export class S3StorageProvider implements StorageProvider {
  readonly name = 's3';
  private readonly client: S3Client;

  constructor(
    private readonly bucket: string,
    config: {
      region: string;
      accessKey?: string;
      secretKey?: string;
      endpoint?: string;
    },
  ) {
    this.client = new S3Client({
      region: config.region,
      endpoint: config.endpoint || undefined,
      forcePathStyle: Boolean(config.endpoint),
      credentials:
        config.accessKey && config.secretKey
          ? {
              accessKeyId: config.accessKey,
              secretAccessKey: config.secretKey,
            }
          : undefined,
    });
  }

  async putObject(input: {
    key: string;
    body: Buffer;
    mimeType: string;
  }): Promise<StoredObject> {
    const checksum = createHash('sha256').update(input.body).digest('hex');
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: input.key,
        Body: input.body,
        ContentType: input.mimeType,
        ChecksumSHA256: Buffer.from(checksum, 'hex').toString('base64'),
      }),
    );
    return {
      key: input.key,
      sizeBytes: input.body.byteLength,
      mimeType: input.mimeType,
      checksumSha256: checksum,
    };
  }

  async getSignedDownloadUrl(
    key: string,
    expiresInSeconds = 900,
  ): Promise<string> {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      { expiresIn: expiresInSeconds },
    );
  }

  async deleteObject(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
    );
  }
}
