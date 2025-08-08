// utils/uploadToB2.js
import fs from 'fs';
import path from 'path';
import { PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { b2Client } from './b2Client.js';

export const uploadToB2 = async (filePath, key) => {
  const bucket = process.env.B2_BUCKET;
  if (!bucket) throw new Error('B2_BUCKET not set in env');

  const stream = fs.createReadStream(filePath);

  const put = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: stream,
    ContentType: 'video/mp4'
  });

  await b2Client.send(put);

  // return a signed get URL (private by default) — expiresIn seconds from env or default
  const getCmd = new GetObjectCommand({ Bucket: bucket, Key: key });
  const expires = Number(process.env.SIGNED_URL_EXPIRES || 3600);
  const signedUrl = await getSignedUrl(b2Client, getCmd, { expiresIn: expires });

  return signedUrl;
};
