import crypto from "crypto";

const ALGORITHM = "aes-256-cbc"; // AES256 with CBC mode
const INPUT_ENCODING = "utf8";
const OUTPUT_ENCODING = "hex";
const IV_LENGTH = 16; // AES blocksize

/**
 * Encrypt text using AES-256-CBC
 * @param text Value to be encrypted
 * @param key Key used to encrypt value must be 32 bytes
 * @returns Encrypted value as string
 */
export const symmetricEncrypt = function (text: string, key: string) {
    const _key = new Uint8Array(Buffer.from(key, "latin1")); // convert Buffer -> Uint8Array
    const iv = crypto.randomBytes(IV_LENGTH);
    const ivUint8 = new Uint8Array(iv);

    const cipher = crypto.createCipheriv(ALGORITHM, _key, ivUint8);
    let ciphered = cipher.update(text, INPUT_ENCODING, OUTPUT_ENCODING);
    ciphered += cipher.final(OUTPUT_ENCODING);
    const ciphertext = `${iv.toString(OUTPUT_ENCODING)}:${ciphered}`;
    return ciphertext;
};

/**
 * Decrypt text using AES-256-CBC
 * @param text Encrypted value
 * @param key Key used to decrypt value must be 32 bytes
 * @returns Decrypted plaintext
 */
export const symmetricDecrypt = function (text: string, key: string) {
    const _key = new Uint8Array(Buffer.from(key, "latin1"));
    const components = text.split(":");
    const iv_from_ciphertext = new Uint8Array(Buffer.from(components.shift() ?? "", OUTPUT_ENCODING));

    const decipher = crypto.createDecipheriv(ALGORITHM, _key, iv_from_ciphertext);
    let deciphered = decipher.update(components.join(":"), OUTPUT_ENCODING, INPUT_ENCODING);
    deciphered += decipher.final(INPUT_ENCODING);
    return deciphered;
};

/**
 * Generate a random password
 */
export function generatePassword(): string {
    const lowercase = "abcdefghijklmnopqrstuvwxyz";
    const uppercase = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    const numbers = "0123456789";
    const special = "^$*.[]{}()?\"-!@#%&/,><':;|_~`+=";

    const randomUppercase = uppercase[Math.floor(Math.random() * uppercase.length)];
    const fourRandomLowercase =
        lowercase.charAt(Math.floor(Math.random() * lowercase.length)) +
        lowercase.charAt(Math.floor(Math.random() * lowercase.length)) +
        lowercase.charAt(Math.floor(Math.random() * lowercase.length)) +
        lowercase.charAt(Math.floor(Math.random() * lowercase.length));
    const twoRandomNumbers =
        numbers.charAt(Math.floor(Math.random() * numbers.length)) +
        numbers.charAt(Math.floor(Math.random() * numbers.length));
    const randomSpecial = special[Math.floor(Math.random() * special.length)];
    return randomUppercase + fourRandomLowercase + randomSpecial + twoRandomNumbers;
}

/**
 * Generate a random 6-digit TOTP code
 */
export function generateTotp(): number {
    return Math.floor(100000 + Math.random() * 900000);
}
