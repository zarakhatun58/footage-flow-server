// utils/s3Client.js
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export const s3Client = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  }
});


export const getSignedUrlFromS3 = async (key, expiresIn = 3600) => {
  if (!key) {
    throw new Error("S3 key is required to generate signed URL");
  }

  const command = new GetObjectCommand({
    Bucket: process.env.AWS_S3_BUCKET,
    Key: key
  });

  return await getSignedUrl(s3Client, command, { expiresIn });
};