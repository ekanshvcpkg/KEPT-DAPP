// MWA `sign_messages` answers with the *signed payload* for each message: the message bytes followed by the
// 64-byte ed25519 signature (the protocol library splits it the same way for sign-in payloads). The backend
// (POST /api/auth/verify) checks a bare 64-byte signature over the message, so the signature is cut off the end.
const SIGNATURE_BYTES = 64;

const sameBytes = (a: Uint8Array, b: Uint8Array): boolean => a.length === b.length && a.every((x, i) => x === b[i]);

/**
 * The raw ed25519 signature out of what a wallet returned for `message`: the signed payload (message +
 * signature), or a bare signature from a wallet that returns only that. Anything else is refused here, with
 * a clear error, instead of reaching the server as an opaque "invalid signature".
 */
export function signatureFromSigned(signed: Uint8Array, message: Uint8Array): Uint8Array {
  if (signed.length === SIGNATURE_BYTES) return signed;
  if (signed.length === message.length + SIGNATURE_BYTES && sameBytes(signed.subarray(0, message.length), message)) {
    return signed.slice(message.length);
  }
  throw new Error(`The wallet returned an unexpected message signature (${signed.length} bytes for a ${message.length}-byte message)`);
}
