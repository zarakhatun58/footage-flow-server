import fs from "fs";
import path from "path";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import mime from "mime";

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
const getMimeType = (filePath) => {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case ".mp4":
      return "video/mp4";
    case ".mp3":
      return "audio/mpeg";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".png":
      return "image/png";
    default:
      return mime.getType(filePath) || "application/octet-stream";
  }
};


export const uploadFileToS3 = async (filePath, key) => {
  const bucketName = process.env.AWS_BUCKET_NAME;
  if (!bucketName) throw new Error("AWS_BUCKET_NAME not set in environment variables");

  if (!fs.existsSync(filePath)) {
    throw new Error(`File does not exist: ${filePath}`);
  }

  const contentType = getMimeType(filePath);
  const fileStream = fs.createReadStream(filePath);

  const params = {
    Bucket: bucketName,
    Key: key,
    Body: fileStream,
    ContentType: contentType,
  };

  try {
    await s3.send(new PutObjectCommand(params));
    return `https://${bucketName}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;
  } catch (err) {
    console.error("❌ S3 Upload Error:", err);
    throw new Error("Failed to upload file to S3");
  }
};

