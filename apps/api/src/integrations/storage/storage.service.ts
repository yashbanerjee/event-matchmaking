import { Injectable, Logger } from '@nestjs/common';
import { EnvService } from '../../config/env.service';
import { EffectiveConfigService } from '../../settings/effective-config.service';
import type { StorageProvider } from './storage.provider';
import { LocalStorageProvider } from './local-storage.provider';
import { S3StorageProvider } from './s3-storage.provider';

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);

  constructor(
    private readonly env: EnvService,
    private readonly config: EffectiveConfigService,
  ) {}

  async getProviderName() {
    return this.config.getString(
      'storage.provider',
      this.env.storageProvider,
    );
  }

  async putObject(input: { key: string; body: Buffer; mimeType: string }) {
    return (await this.resolveProvider()).putObject(input);
  }

  async getSignedDownloadUrl(key: string, expiresInSeconds?: number) {
    return (await this.resolveProvider()).getSignedDownloadUrl(
      key,
      expiresInSeconds,
    );
  }

  async deleteObject(key: string) {
    return (await this.resolveProvider()).deleteObject(key);
  }

  /** @deprecated prefer getProviderName */
  getProvider() {
    return {
      name: this.env.storageProvider,
    } as StorageProvider;
  }

  private async resolveProvider(): Promise<StorageProvider> {
    const provider = await this.config.getString(
      'storage.provider',
      this.env.storageProvider,
    );
    if (provider === 's3') {
      const bucket = await this.config.getString('storage.s3Bucket', '');
      const region = await this.config.getString('storage.s3Region', '');
      if (!bucket || !region) {
        this.logger.warn(
          'S3 selected but bucket/region missing; falling back to local',
        );
        return new LocalStorageProvider(
          await this.config.getString(
            'storage.localPath',
            this.env.storageLocalPath,
          ),
        );
      }
      return new S3StorageProvider(bucket, {
        region,
        accessKey:
          (await this.config.getString('storage.s3AccessKey', '')) || undefined,
        secretKey:
          (await this.config.getString('storage.s3SecretKey', '')) || undefined,
        endpoint:
          (await this.config.getString('storage.s3Endpoint', '')) || undefined,
      });
    }
    return new LocalStorageProvider(
      await this.config.getString(
        'storage.localPath',
        this.env.storageLocalPath,
      ),
    );
  }
}
