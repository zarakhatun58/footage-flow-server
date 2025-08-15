import fs from "fs";
import path from "path";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { ffmpeg } from 'fluent-ffmpeg';
import ffmpegPath from "ffmpeg-static";
import { PassThrough } from "stream";

if (ffmpegPath) ffmpeg.setFfmpegPath(ffmpegPath);

const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

/**
 * Streams video generated from images + audio directly to S3.
 * @param {string[]} imagePaths - Array of local image paths.
 * @param {string} audioPath - Path to local audio file.
 * @param {string} s3Key - S3 key (path + filename) for the video.
 * @param {number} perImageDuration - Duration of each image in seconds.
 * @returns {Promise<string>} - URL of the uploaded video.
 */
export const uploadFileToS3 = async (imagePaths, audioPath, s3Key, perImageDuration = 2) => {
  return new Promise(async (resolve, reject) => {
    try {
      const bucketName = process.env.AWS_BUCKET_NAME;
      if (!bucketName) throw new Error("AWS_BUCKET_NAME not set");

      const passThrough = new PassThrough();

      // Start S3 upload in parallel
      const uploadPromise = s3.send(
        new PutObjectCommand({
          Bucket: bucketName,
          Key: s3Key,
          Body: passThrough,
          ContentType: "video/mp4",
        })
      );

      // Start ffmpeg process
      const command = ffmpeg();

      imagePaths.forEach(img => {
        if (fs.existsSync(img)) {
          command.input(img).inputOptions([`-loop 1`, `-t ${perImageDuration}`]);
        }
      });

      if (fs.existsSync(audioPath)) command.input(audioPath);

      command
        .videoCodec("libx264")
        .audioCodec("aac")
        .outputOptions(["-preset ultrafast", "-pix_fmt yuv420p", "-movflags +faststart", "-shortest"])
        .format("mp4")
        .on("start", cmd => console.log("FFmpeg command:", cmd))
        .on("error", (err, stdout, stderr) => {
          console.error("❌ FFmpeg error:", err.message);
          console.error(stderr);
          reject(err);
        })
        .on("end", async () => {
          console.log("✅ Video streaming finished");
          const videoUrl = `https://${bucketName}.s3.${process.env.AWS_REGION}.amazonaws.com/${s3Key}`;
          resolve(videoUrl);
        })
        .pipe(passThrough, { end: true });

      await uploadPromise; // ensure S3 upload completes
    } catch (err) {
      reject(err);
    }
  });
};

// export const uploadFileToS3 = async (imagePaths, audioPath, s3Key, perImageDuration = 2) => {
//   return new Promise((resolve, reject) => {
//     try {
//       const passThrough = new PassThrough();
//       const bucketName = process.env.AWS_BUCKET_NAME;
//       if (!bucketName) throw new Error("AWS_BUCKET_NAME not set");

//       // Start S3 upload
//       const uploadPromise = s3.send(
//         new PutObjectCommand({
//           Bucket: bucketName,
//           Key: s3Key,
//           Body: passThrough,
//           ContentType: "video/mp4",
//         })
//       );

//       // Start FFmpeg
//       const command = ffmpeg();

//       imagePaths.forEach((img) => {
//         command.input(img).inputOptions([`-loop 1`, `-t ${perImageDuration}`]);
//       });

//       if (fs.existsSync(audioPath)) command.input(audioPath);

//       command
//         .videoCodec("libx264")
//         .audioCodec("aac")
//         .outputOptions(["-preset ultrafast", "-pix_fmt yuv420p", "-movflags +faststart", "-shortest"])
//         .format("mp4")
//         .on("start", (cmd) => console.log("FFmpeg command:", cmd))
//         .on("error", (err, stdout, stderr) => {
//           console.error("❌ FFmpeg error:", err.message);
//           console.error(stderr);
//           reject(err);
//         })
//         .on("end", () => console.log("✅ FFmpeg finished streaming"))
//         .pipe(passThrough, { end: true });

//       // Wait for S3 upload to complete
//       uploadPromise
//         .then(() => {
//           const videoUrl = `https://${bucketName}.s3.${process.env.AWS_REGION}.amazonaws.com/${s3Key}`;
//           resolve(videoUrl);
//         })
//         .catch((err) => reject(err));

//     } catch (err) {
//       reject(err);
//     }
//   });
// };