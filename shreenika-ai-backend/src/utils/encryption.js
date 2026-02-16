import crypto from 'crypto';

const ALGORITHM = 'aes-256-cbc';
const IV_LENGTH = 16;
const ENCRYPTION_KEY = process.env.VOIP_ENCRYPTION_KEY || 'default_key_32_bytes_long_123456'; // 32 bytes

// Startup validation
if (!ENCRYPTION_KEY || ENCRYPTION_KEY.length < 32) {
  console.error('❌ CRITICAL: VOIP_ENCRYPTION_KEY is missing or too short (must be 32+ chars)');
  console.error('   Current length:', ENCRYPTION_KEY?.length);
  console.error('   Value set:', !!process.env.VOIP_ENCRYPTION_KEY ? 'from ENV' : 'DEFAULT');
} else {
  console.log('✅ VOIP_ENCRYPTION_KEY loaded successfully (' + ENCRYPTION_KEY.length + ' chars)');
}

export function encrypt(text) {
  if (!text) return text;
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY), iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

export function decrypt(text) {
  if (!text) return text;
  const [ivHex, encrypted] = text.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const decipher = crypto.createDecipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY), iv);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}
