import {Base64Url, UuidCodec} from "../encoding";

export namespace WebauthnUserHandleDecoder {

  /**
   * Decodes a WebAuthn userHandle (base64url-encoded) back to a UUID string.
   */
  export function decodeToUuid(base64Url: string): string {
    return UuidCodec.fromBytes(Base64Url.decode(base64Url));
  }

}
