import { Injectable, Logger } from '@nestjs/common';
import { EnvService } from '../../config/env.service';
import type { StorageProvider } from './storage.provider';
import { LocalStorageProvider } from './local-storage.provider';
import { S3StorageProvider } from './s3-storage.provider';

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly provider: StorageProvider;

  constructor(private readonly env: EnvService) {
    this.provider = this.createProvider();
  }

  getProviderName() {
    return this.provider.name;
  }

  getProvider() {
    return this.provider;
  }

  putObject(input: { key: string; body: Buffer; mimeType: string }) {
    return this.provider.putObject(input);
  }

  getSignedDownloadUrl(key: string, expiresInSeconds?: number) {
    return this.provider.getSignedDownloadUrl(key, expiresInSeconds);
  }

  deleteObject(key: string) {
    return this.provider.deleteObject(key);
  }

  private createProvider(): StorageProvider {
    const raw = this.env.raw;
    if (raw.STORAGE_PROVIDER === 's3') {
      if (!raw.S3_BUCKET || !raw.S3_REGION) {
        this.logger.warn(
          'S3 storage selected but bucket/region missing; falling back to local',
        );
        return new LocalStorageProvider(raw.STORAGE_LOCAL_PATH);
      }
      return new S3StorageProvider(raw.S3_BUCKET, {
        region: raw.S3_REGION,
        accessKey: raw.S3_ACCESS_KEY || undefined,
        secretKey: raw.S3_SECRET_KEY || undefined,
        endpoint: raw.S3_ENDPOINT || undefined,
      });
    }
    return new LocalStorageProvider(raw.STORAGE_LOCAL_PATH);
  }
}
