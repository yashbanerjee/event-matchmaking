export interface StoredObject {
  key: string;
  sizeBytes: number;
  mimeType: string;
  checksumSha256?: string;
}

export interface StorageProvider {
  readonly name: string;
  putObject(input: {
    key: string;
    body: Buffer;
    mimeType: string;
  }): Promise<StoredObject>;
  getSignedDownloadUrl(key: string, expiresInSeconds?: number): Promise<string>;
  deleteObject(key: string): Promise<void>;
}
