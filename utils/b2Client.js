// utils/b2Client.js
import { S3Client } from "@aws-sdk/client-s3";

export const b2Client = new S3Client({
  region: process.env.B2_REGION || 'us-west-002',
  endpoint: process.env.B2_ENDPOINT, // e.g. https://s3.us-west-002.backblazeb2.com
  credentials: {
    accessKeyId: process.env.B2_KEY_ID,
    secretAccessKey: process.env.B2_APPLICATION_KEY
  },
  forcePathStyle: false
});
