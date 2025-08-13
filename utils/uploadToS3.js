import fs from "fs";
import path from "path";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const s3 = new S3Client({
  region: process.env.AWS_REGION, // e.g., "eu-north-1"
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  }
});

/**
 * Uploads a file to AWS S3.
 * @param {string} filePath - Local path to the file to upload.
 * @param {string} key - The S3 key (path/filename) inside the bucket.
 * @returns {string} - Public URL of the uploaded file.
 */
export const uploadFileToS3 = async (filePath, key) => {
  const bucketName = process.env.AWS_BUCKET_NAME;
  if (!bucketName) throw new Error("AWS_BUCKET_NAME not set in environment variables");

  // Read file as a stream
  const fileStream = fs.createReadStream(filePath);

  const params = {
    Bucket: bucketName,
    Key: key,
    Body: fileStream,
    ContentType: "video/mp4" // You can make this dynamic if needed
    // No ACL needed — bucket policy makes files public
  };

  try {
    await s3.send(new PutObjectCommand(params));

    // Return the public URL (works because of the public bucket policy)
    return `https://${bucketName}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;
  } catch (err) {
    console.error("❌ S3 Upload Error:", err);
    throw new Error("Failed to upload file to S3");
  }
};
