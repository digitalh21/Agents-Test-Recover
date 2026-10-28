/**
 * File storage layer — Backblaze B2 (native API) with public URL mapping.
 *
 * Env vars (configured in deployment):
 *   B2_KEY_ID            — application key ID
 *   B2_APPLICATION_KEY   — application key (also accepts B2_APP_KEY)
 *   B2_BUCKET_ID         — target bucket id
 *   B2_BUCKET_NAME       — target bucket name
 *   B2_PUBLIC_URL        — optional CDN/friendly base, e.g. https://f005.backblazeb2.com/file/<bucket>
 *
 * When B2 credentials are absent (local sandbox), falls back to inline
 * data-URLs so every upload flow keeps working end-to-end.
 */

type B2Auth = {
  apiUrl: string;
  authorizationToken: string;
  downloadUrl: string;
};

const g = globalThis as typeof globalThis & { __b2AuthCache?: { auth: B2Auth; at: number } };

function b2Config() {
  const keyId = process.env.B2_KEY_ID;
  const appKey = process.env.B2_APPLICATION_KEY ?? process.env.B2_APP_KEY;
  const bucketId = process.env.B2_BUCKET_ID;
  const bucketName = process.env.B2_BUCKET_NAME;
  if (!keyId || !appKey || !bucketId || !bucketName) return null;
  return { keyId, appKey, bucketId, bucketName, publicBase: process.env.B2_PUBLIC_URL ?? null };
}

async function b2Authorize(keyId: string, appKey: string): Promise<B2Auth> {
  // cache auth for 20h (tokens last 24h)
  if (g.__b2AuthCache && Date.now() - g.__b2AuthCache.at < 20 * 60 * 60 * 1000) {
    return g.__b2AuthCache.auth;
  }
  const res = await fetch("https://api.backblazeb2.com/b2api/v3/b2_authorize_account", {
    headers: { Authorization: "Basic " + Buffer.from(`${keyId}:${appKey}`).toString("base64") },
  });
  if (!res.ok) throw new Error(`B2 authorize failed: ${res.status}`);
  const json = await res.json();
  const auth: B2Auth = {
    apiUrl: json.apiInfo?.storageApi?.apiUrl ?? json.apiUrl,
    authorizationToken: json.authorizationToken,
    downloadUrl: json.apiInfo?.storageApi?.downloadUrl ?? json.downloadUrl,
  };
  g.__b2AuthCache = { auth, at: Date.now() };
  return auth;
}

/**
 * Upload a file buffer; returns a public URL.
 * B2-backed when configured, data-URL fallback otherwise.
 */
export async function uploadToStorage(opts: {
  buffer: Buffer;
  fileName: string;
  contentType: string;
  folder?: string; // e.g. "kyc", "proofs", "banners"
}): Promise<{ url: string; provider: "b2" | "inline" }> {
  const cfg = b2Config();
  const safeName = opts.fileName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-80);
  const key = `${opts.folder ?? "uploads"}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeName}`;

  if (cfg) {
    try {
      const auth = await b2Authorize(cfg.keyId, cfg.appKey);
      // get an upload url
      const upRes = await fetch(`${auth.apiUrl}/b2api/v3/b2_get_upload_url`, {
        method: "POST",
        headers: { Authorization: auth.authorizationToken, "Content-Type": "application/json" },
        body: JSON.stringify({ bucketId: cfg.bucketId }),
      });
      if (!upRes.ok) throw new Error(`B2 get_upload_url failed: ${upRes.status}`);
      const { uploadUrl, authorizationToken } = await upRes.json();

      const sha1 = (await import("crypto")).createHash("sha1").update(opts.buffer).digest("hex");
      const fileRes = await fetch(uploadUrl, {
        method: "POST",
        headers: {
          Authorization: authorizationToken,
          "X-Bz-File-Name": encodeURIComponent(key),
          "Content-Type": opts.contentType || "b2/x-auto",
          "Content-Length": String(opts.buffer.length),
          "X-Bz-Content-Sha1": sha1,
        },
        body: new Uint8Array(opts.buffer),
      });
      if (!fileRes.ok) throw new Error(`B2 upload failed: ${fileRes.status}`);

      // Public URL mapping (friendly bucket URL)
      const url = cfg.publicBase
        ? `${cfg.publicBase.replace(/\/$/, "")}/${key}`
        : `${auth.downloadUrl}/file/${cfg.bucketName}/${key}`;
      return { url, provider: "b2" };
    } catch (e) {
      console.error("B2 upload failed, falling back to inline storage:", e);
    }
  }

  // Fallback: inline data-URL (sandbox / missing credentials)
  return {
    url: `data:${opts.contentType};base64,${opts.buffer.toString("base64")}`,
    provider: "inline",
  };
}
