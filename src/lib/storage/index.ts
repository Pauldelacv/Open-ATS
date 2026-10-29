import { createReadStream } from "node:fs";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { env, uploadsDir } from "@/lib/env";

export interface Storage {
  put(key: string, data: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer | null>;
  stream(key: string): Promise<ReadableStream<Uint8Array> | null>;
  delete(key: string): Promise<void>;
}

function safeKey(key: string): string {
  const normalized = path.posix.normalize(key).replace(/^\/+/, "");
  if (normalized.startsWith("..") || normalized.includes("/../") || normalized.includes("\0")) {
    throw new Error("Invalid storage key");
  }
  return normalized;
}

class LocalStorage implements Storage {
  constructor(private readonly root: string) {}

  private file(key: string) {
    return path.join(this.root, safeKey(key));
  }

  async put(key: string, data: Buffer) {
    const file = this.file(key);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, data);
  }

  async get(key: string) {
    try {
      return await readFile(this.file(key));
    } catch {
      return null;
    }
  }

  async stream(key: string) {
    const file = this.file(key);
    try {
      await stat(file);
    } catch {
      return null;
    }
    return Readable.toWeb(createReadStream(file)) as ReadableStream<Uint8Array>;
  }

  async delete(key: string) {
    await rm(this.file(key), { force: true });
  }
}

/** Access keys when given; otherwise Vercel OIDC when a role is set; otherwise the SDK's default chain. */
async function s3Credentials(region: string) {
  const e = env();
  if (e.S3_ACCESS_KEY_ID && e.S3_SECRET_ACCESS_KEY) {
    return { accessKeyId: e.S3_ACCESS_KEY_ID, secretAccessKey: e.S3_SECRET_ACCESS_KEY };
  }
  if (e.AWS_ROLE_ARN) {
    const { awsCredentialsProvider } = await import("@vercel/oidc-aws-credentials-provider");
    return awsCredentialsProvider({ roleArn: e.AWS_ROLE_ARN, clientConfig: { region } });
  }
  return undefined;
}

class S3Storage implements Storage {
  private client: Promise<{
    send: (command: unknown) => Promise<unknown>;
    mod: typeof import("@aws-sdk/client-s3");
  }>;

  constructor(private readonly bucket: string) {
    this.client = import("@aws-sdk/client-s3").then(async (mod) => {
      const e = env();
      const region = e.S3_REGION ?? e.AWS_REGION ?? "auto";
      const client = new mod.S3Client({
        region,
        endpoint: e.S3_ENDPOINT,
        forcePathStyle: e.S3_FORCE_PATH_STYLE,
        credentials: await s3Credentials(region),
      });
      return { send: (command: unknown) => client.send(command as never), mod };
    });
  }

  async put(key: string, data: Buffer, contentType: string) {
    const { send, mod } = await this.client;
    await send(
      new mod.PutObjectCommand({
        Bucket: this.bucket,
        Key: safeKey(key),
        Body: data,
        ContentType: contentType,
      }),
    );
  }

  async get(key: string) {
    const stream = await this.stream(key);
    if (!stream) return null;
    return Buffer.from(await new Response(stream).arrayBuffer());
  }

  async stream(key: string) {
    const { send, mod } = await this.client;
    try {
      const result = (await send(
        new mod.GetObjectCommand({ Bucket: this.bucket, Key: safeKey(key) }),
      )) as {
        Body?: { transformToWebStream(): ReadableStream<Uint8Array> };
      };
      return result.Body?.transformToWebStream() ?? null;
    } catch {
      return null;
    }
  }

  async delete(key: string) {
    const { send, mod } = await this.client;
    await send(new mod.DeleteObjectCommand({ Bucket: this.bucket, Key: safeKey(key) }));
  }
}

let instance: Storage | undefined;

export function storage(): Storage {
  if (instance) return instance;
  const e = env();
  if (e.STORAGE_DRIVER === "s3") {
    const bucket = e.S3_BUCKET ?? e.S3_BUCKET_NAME;
    if (!bucket) throw new Error("S3_BUCKET is required when STORAGE_DRIVER=s3");
    instance = new S3Storage(bucket);
  } else {
    instance = new LocalStorage(path.resolve(uploadsDir()));
  }
  return instance;
}

/** Keys of public organisation assets (logo, cover photo) contain this segment. */
export const PUBLIC_SEGMENT = "/public/";

export function isPublicKey(key: string): boolean {
  return safeKey(key).includes(PUBLIC_SEGMENT);
}
