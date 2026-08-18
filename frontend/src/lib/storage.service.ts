import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { v2 as cloudinary } from 'cloudinary';

export interface StorageProvider {
  generateUploadUrl(key: string, contentType: string, expiresInSeconds?: number): Promise<string>;
  generateDownloadUrl(key: string, expiresInSeconds?: number): Promise<string>;
  deleteFile(key: string): Promise<void>;
}

/**
 * Cloudinary Storage Provider implementation using signed upload & private authenticated delivery URLs.
 */
export class CloudinaryStorageProvider implements StorageProvider {
  private cloudName: string;
  private apiKey: string;
  private apiSecret: string;

  constructor(config?: { cloudName?: string; apiKey?: string; apiSecret?: string }) {
    this.cloudName = config?.cloudName || process.env.CLOUDINARY_CLOUD_NAME || '';
    this.apiKey = config?.apiKey || process.env.CLOUDINARY_API_KEY || '';
    this.apiSecret = config?.apiSecret || process.env.CLOUDINARY_API_SECRET || '';

    cloudinary.config({
      cloud_name: this.cloudName,
      api_key: this.apiKey,
      api_secret: this.apiSecret,
      secure: true
    });
  }

  async generateUploadUrl(
    key: string,
    _contentType: string,
    _expiresInSeconds: number = 900
  ): Promise<string> {
    const timestamp = Math.round(new Date().getTime() / 1000);
    const paramsToSign = {
      public_id: key,
      timestamp: timestamp,
      type: 'authenticated'
    };

    const signature = cloudinary.utils.api_sign_request(paramsToSign, this.apiSecret);

    // Direct signed Cloudinary REST upload endpoint with query parameters
    return `https://api.cloudinary.com/v1_1/${this.cloudName}/auto/upload?api_key=${this.apiKey}&timestamp=${timestamp}&public_id=${encodeURIComponent(
      key
    )}&signature=${signature}&type=authenticated`;
  }

  async generateDownloadUrl(key: string, expiresInSeconds: number = 900): Promise<string> {
    const expiresAt = Math.round(new Date().getTime() / 1000) + expiresInSeconds;

    try {
      return cloudinary.utils.private_download_url(key, '', {
        expires_at: expiresAt,
        type: 'authenticated',
        attachment: false
      });
    } catch {
      return cloudinary.url(key, {
        sign_url: true,
        secure: true,
        type: 'authenticated'
      });
    }
  }

  async deleteFile(key: string): Promise<void> {
    const publicId = key.replace(/\.[^/.]+$/, '');
    await cloudinary.uploader.destroy(publicId, { type: 'authenticated' });
  }
}

/**
 * AWS S3 Storage Provider implementation for S3 compatible buckets.
 */
export class S3StorageProvider implements StorageProvider {
  private client: S3Client;
  private bucket: string;

  constructor(config?: {
    endpoint?: string;
    region?: string;
    accessKeyId?: string;
    secretAccessKey?: string;
    bucket?: string;
  }) {
    const endpoint = config?.endpoint || process.env.S3_ENDPOINT;
    const region = config?.region || process.env.AWS_REGION || 'us-east-1';
    const accessKeyId = config?.accessKeyId || process.env.AWS_ACCESS_KEY_ID || '';
    const secretAccessKey = config?.secretAccessKey || process.env.AWS_SECRET_ACCESS_KEY || '';

    this.bucket = config?.bucket || process.env.S3_BUCKET_NAME || 'expenses-receipts';

    this.client = new S3Client({
      region,
      endpoint,
      credentials: {
        accessKeyId,
        secretAccessKey
      }
    });
  }

  async generateUploadUrl(
    key: string,
    contentType: string,
    expiresInSeconds: number = 900
  ): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: contentType
    });

    return getSignedUrl(this.client, command, { expiresIn: expiresInSeconds });
  }

  async generateDownloadUrl(key: string, expiresInSeconds: number = 900): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key
    });

    return getSignedUrl(this.client, command, { expiresIn: expiresInSeconds });
  }

  async deleteFile(key: string): Promise<void> {
    const command = new DeleteObjectCommand({
      Bucket: this.bucket,
      Key: key
    });

    await this.client.send(command);
  }
}

/**
 * Mock Storage Provider for testing and local development without cloud credentials.
 */
export class MockStorageProvider implements StorageProvider {
  async generateUploadUrl(key: string, _contentType: string): Promise<string> {
    return `https://mock-cloudinary.storage.local/upload/${encodeURIComponent(key)}?signature=mock-valid-sig`;
  }

  async generateDownloadUrl(key: string): Promise<string> {
    return `https://mock-cloudinary.storage.local/download/${encodeURIComponent(key)}?signature=mock-valid-sig`;
  }

  async deleteFile(_key: string): Promise<void> {
    // No-op for mock
  }
}

/**
 * Storage factory - returns configured Cloudinary provider, S3 provider, or Mock provider for local development.
 */
export function getStorageProvider(): StorageProvider {
  if (process.env.CLOUDINARY_CLOUD_NAME || process.env.CLOUDINARY_API_KEY) {
    return new CloudinaryStorageProvider();
  }
  if (process.env.AWS_ACCESS_KEY_ID) {
    return new S3StorageProvider();
  }
  return new MockStorageProvider();
}
