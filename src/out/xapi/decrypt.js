import crypto from 'crypto'

/**
 *
 * @param encryptedObj
 * @param secret
 */
export default function decryptStr(encryptedObj, secret) {
  // Decode the base64-encoded text
  const encryptedText = Buffer.from(encryptedObj, 'base64');

  // Extract salt (bytes 8 to 15) and ciphertext (the rest)
  // the first 8 bytes are reserved for OpenSSL's 'Salted__' magic prefix
  const salt = encryptedText.subarray(8, 16);
  const ciphertext = encryptedText.subarray(16);

  // Derive the key and IV using PBKDF2
  const keyIVBuffer = crypto.pbkdf2Sync(secret, salt, 10000, 48, 'sha256');
  const key = keyIVBuffer.subarray(0, 32);
  const iv = keyIVBuffer.subarray(32);

  // Create a decipher object with IV
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);

  // Update the decipher with the ciphertext
  let decrypted = decipher.update(ciphertext, 'binary', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}
