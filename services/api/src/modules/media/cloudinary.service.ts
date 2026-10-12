import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { v2 as cloudinary } from "cloudinary";
import type { Env } from "../../config/env.schema";

export type UploadSignature = {
  timestamp: number;
  signature: string;
  apiKey: string;
  cloudName: string;
  folder: string;
  allowedFormats: string;
};

const ALLOWED_UPLOAD_FOLDERS = new Set(["restaurant", "products", "categories", "deals", "banners", "complaints", "choices", "addons"]);
const ALLOWED_IMAGE_FORMATS = "jpg,jpeg,png,webp";

/**
 * Issues signed-upload params so the admin frontend uploads directly to Cloudinary
 * (binary never passes through our API). Requires CLOUDINARY_* env vars — until they're
 * supplied this throws a clear 503 instead of a confusing crash.
 */
@Injectable()
export class CloudinaryService {
  private configured = false;

  constructor(private readonly config: ConfigService<Env, true>) {
    const cloudName = this.config.get("CLOUDINARY_CLOUD_NAME", { infer: true });
    const apiKey = this.config.get("CLOUDINARY_API_KEY", { infer: true });
    const apiSecret = this.config.get("CLOUDINARY_API_SECRET", { infer: true });

    if (cloudName && apiKey && apiSecret) {
      cloudinary.config({ cloud_name: cloudName, api_key: apiKey, api_secret: apiSecret });
      this.configured = true;
    }
  }

  /** Start of every image URL this account serves, used to refuse registering images from anywhere else. */
  urlPrefix(): string | null {
    const cloudName = this.config.get("CLOUDINARY_CLOUD_NAME", { infer: true });
    return this.configured && cloudName ? `https://res.cloudinary.com/${cloudName}/` : null;
  }

  /** Images already in the account (one page), limited to the folders the app uploads into. */
  async listImages(cursor?: string) {
    if (!this.configured) {
      throw new ServiceUnavailableException({ code: "CLOUDINARY_NOT_CONFIGURED", message: "Image storage is not configured yet." });
    }
    const res = (await cloudinary.api.resources({ type: "upload", resource_type: "image", max_results: 200, next_cursor: cursor })) as {
      resources: { public_id: string; secure_url: string; width?: number; height?: number; bytes?: number; format?: string; created_at: string; folder?: string; asset_folder?: string }[];
      next_cursor?: string;
    };
    const resources = res.resources
      .map((r) => {
        const folder = (r.folder ?? r.asset_folder ?? r.public_id.split("/").slice(0, -1).join("/")) || "restaurant";
        return {
          publicId: r.public_id,
          url: r.secure_url,
          filename: r.public_id.split("/").pop() ?? r.public_id,
          folder: folder.split("/")[0]!,
          width: r.width,
          height: r.height,
          bytes: r.bytes,
          format: r.format,
          createdAt: new Date(r.created_at),
        };
      })
      .filter((r) => ALLOWED_UPLOAD_FOLDERS.has(r.folder));
    return { resources, nextCursor: res.next_cursor ?? null };
  }

  async destroy(publicId: string) {
    if (!this.configured) return;
    await cloudinary.uploader.destroy(publicId, { resource_type: "image", invalidate: true });
  }

  getUploadSignature(requestedFolder: string): UploadSignature {
    if (!this.configured) {
      throw new ServiceUnavailableException({
        code: "CLOUDINARY_NOT_CONFIGURED",
        message: "Image uploads are not configured yet. Set CLOUDINARY_CLOUD_NAME/API_KEY/API_SECRET.",
      });
    }
    // Folder is client-supplied — restrict to a fixed allowlist rather than signing an arbitrary path.
    const folder = ALLOWED_UPLOAD_FOLDERS.has(requestedFolder) ? requestedFolder : "restaurant";

    const timestamp = Math.round(Date.now() / 1000);
    const apiSecret = this.config.get("CLOUDINARY_API_SECRET", { infer: true })!;
    // allowed_formats is included in the signed payload so the client cannot upload other file
    // types without invalidating the signature (CLAUDE.md §22 — file upload type validation).
    const signature = cloudinary.utils.api_sign_request({ timestamp, folder, allowed_formats: ALLOWED_IMAGE_FORMATS }, apiSecret);

    return {
      timestamp,
      signature,
      apiKey: this.config.get("CLOUDINARY_API_KEY", { infer: true })!,
      cloudName: this.config.get("CLOUDINARY_CLOUD_NAME", { infer: true })!,
      folder,
      allowedFormats: ALLOWED_IMAGE_FORMATS,
    };
  }
}
