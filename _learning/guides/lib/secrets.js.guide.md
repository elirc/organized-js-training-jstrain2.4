# Guide: lib/secrets.js

## Purpose

This file provides encryption and decryption for secret values (like database passwords, API keys) stored in the database. Instead of storing secrets in plaintext (which would be a major security vulnerability), this module encrypts them using AES-256-GCM — a military-grade encryption algorithm. Only someone with the encryption key can read the actual values.

## Line-by-Line Walkthrough

```js
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
```
Imports from Node.js's built-in cryptography module:
- `createCipheriv` — creates an encryption object
- `createDecipheriv` — creates a decryption object
- `createHash` — creates a hash function (used to derive the encryption key)
- `randomBytes` — generates cryptographically secure random bytes

```js
const SECRET_KEY = process.env.SECRET_ENCRYPTION_KEY || "development-key-change-me";
const ALGORITHM = "aes-256-gcm";
```
- `SECRET_KEY` — the master encryption key, read from an environment variable. In production, this would be a long random string stored securely. The fallback `"development-key-change-me"` is only for local development.
- `"aes-256-gcm"` — the encryption algorithm:
  - **AES** = Advanced Encryption Standard
  - **256** = key size in bits (very strong)
  - **GCM** = Galois/Counter Mode (provides both encryption AND authentication — it verifies the data hasn't been tampered with)

```js
function getKey() {
  return createHash("sha256").update(SECRET_KEY).digest();
}
```
AES-256 requires exactly 32 bytes (256 bits) as a key. The `SECRET_KEY` environment variable can be any length, so we hash it with SHA-256 to get exactly 32 bytes. This is called **key derivation**.

### Encryption

```js
export function encryptSecret(value) {
  const iv = randomBytes(12);
```
**IV (Initialization Vector)** — 12 random bytes used to ensure that encrypting the same text twice produces different ciphertext. Without an IV, identical secrets would produce identical encrypted values, which leaks information.

```js
  const cipher = createCipheriv(ALGORITHM, getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
```
1. Create the encryption cipher with the algorithm, key, and IV
2. `cipher.update(value, "utf8")` — encrypts the input text
3. `cipher.final()` — finalizes encryption (handles any remaining data)
4. `Buffer.concat([...])` — joins the encrypted chunks into one buffer
5. `cipher.getAuthTag()` — gets the GCM authentication tag (16 bytes that prove the data wasn't tampered with)

```js
  return `${iv.toString("hex")}:${tag.toString("hex")}:${encrypted.toString("hex")}`;
}
```
Returns a string with three parts separated by colons: `IV:TAG:ENCRYPTED_DATA`. All three are needed for decryption. Each is converted to hex (a string of characters 0-9 and a-f).

Example output: `"a1b2c3d4e5f6a1b2c3d4e5f6:1234567890abcdef1234567890abcdef:9f8e7d6c5b4a"`

### Decryption

```js
export function decryptSecret(payload) {
  const [ivHex, tagHex, encryptedHex] = payload.split(":");
```
Splits the stored string back into its three parts using array destructuring.

```js
  const decipher = createDecipheriv(ALGORITHM, getKey(), Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedHex, "hex")),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}
```
1. Create the decryption cipher with the same algorithm, key, and original IV
2. Set the authentication tag — if the data was tampered with, `decipher.final()` will throw an error
3. Decrypt the data and convert the buffer back to a UTF-8 string

## Concepts Taught
- **Symmetric encryption** — the same key encrypts and decrypts (vs. asymmetric where you have public/private keys)
- **AES-256-GCM** — authenticated encryption that protects both confidentiality and integrity
- **Initialization Vector (IV)** — randomness that prevents identical inputs from producing identical outputs
- **Authentication tag** — proof that encrypted data hasn't been modified
- **Key derivation** — transforming a human-readable password into a fixed-length cryptographic key
- **Hex encoding** — representing binary data as readable text
- **Buffer** — Node.js's type for working with raw binary data

**Extra example:** A simpler (but less secure) approach without authentication:
```js
// DON'T DO THIS — no authentication, vulnerable to tampering
function simpleEncrypt(text, key) {
  const cipher = crypto.createCipher("aes-256-cbc", key);
  return cipher.update(text, "utf8", "hex") + cipher.final("hex");
}
```
GCM is better because it detects if someone modifies the encrypted data.

## Common Mistakes
- Using the same IV for multiple encryptions — this completely breaks the security of GCM mode. Each encryption MUST use a fresh random IV.
- Hardcoding the encryption key in source code — the key should come from an environment variable or a secrets manager, never committed to git.
- Not storing the IV with the ciphertext — you need the same IV to decrypt. That's why this function combines IV + tag + data into one string.
- Logging decrypted values — defeats the purpose of encryption. The `decryptSecret` function exists but is never called from API routes (secrets are always masked in responses).

## Mini Exercises
1. What would happen if you used `randomBytes(16)` instead of `randomBytes(12)` for the IV? (Hint: GCM has specific IV length requirements.)
2. If two users store the same secret value `"my-password"`, will the encrypted output be identical? Why or why not?
3. What error would you get if you tried to decrypt a value with a different `SECRET_ENCRYPTION_KEY` than the one used to encrypt it?

## Further Reading
- Search: "AES-256-GCM encryption explained"
- Search: "Node.js crypto module documentation"
- Search: "why use initialization vectors in encryption"
