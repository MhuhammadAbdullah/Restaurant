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
