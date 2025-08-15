import fs from "fs";
import path from "path";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import ffmpegPkg from 'fluent-ffmpeg';
import ffmpegPath from 'ffmpeg-static';
import { PassThrough } from "stream";

const ffmpeg = ffmpegPkg;
if (ffmpegPath) ffmpeg.setFfmpegPath(ffmpegPath);

const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const getAudioDuration = (audioPath) =>
  new Promise((resolve, reject) => {
    ffmpeg.ffprobe(audioPath, (err, metadata) => {
      if (err) return reject(err);
      resolve(metadata.format?.duration || 0);
    });
  });
const uploadStreamToS3 = (Bucket, Key) => {
  const pass = new PassThrough();
  s3.send(new PutObjectCommand({ Bucket, Key, Body: pass }))
    .then(() => console.log(`✅ Uploaded to s3://${Bucket}/${Key}`))
    .catch((err) => console.error('❌ S3 Upload error:', err));
  return pass;
};

export const generateVideoStreamToS3 = async ({
  imagePaths,
  audioPath,
  s3Bucket,
  s3Key,
  perImageDuration = 2,
  targetWidth = 1280,
  title = '',
  emotion = '',
  story = '',
  tag = ''
}) => {
  return new Promise(async (resolve, reject) => {
    try {
      if (!Array.isArray(imagePaths) || imagePaths.length === 0) {
        throw new Error('No images provided.');
      }

      imagePaths = imagePaths.filter((img) => fs.existsSync(img));
      if (imagePaths.length === 0) throw new Error('No valid images exist.');

      if (!audioPath || !fs.existsSync(audioPath)) {
        throw new Error('Audio file not found.');
      }

      const audioDuration = await getAudioDuration(audioPath);
      const neededImages = Math.ceil(audioDuration / perImageDuration);
      if (imagePaths.length < neededImages) {
        const repeats = Math.ceil(neededImages / imagePaths.length);
        imagePaths = Array(repeats).fill(imagePaths).flat().slice(0, neededImages);
      }

      const drawText = [];
      const escapeFF = (txt) => txt.replace(/'/g, "\\'");

      if (title) drawText.push(`drawtext=text='${escapeFF(title)}':fontcolor=white:fontsize=48:box=1:boxcolor=black@0.5:boxborderw=10:x=(w-text_w)/2:y=50`);
      if (emotion) drawText.push(`drawtext=text='${escapeFF(emotion)}':fontcolor=yellow:fontsize=36:box=1:boxcolor=black@0.5:x=w-tw-20:y=50`);
      if (story) drawText.push(`drawtext=text='${escapeFF(story)}':fontcolor=white:fontsize=32:box=1:boxcolor=black@0.5:x=(w-text_w)/2:y=h-th-100`);
      if (tag) drawText.push(`drawtext=text='${escapeFF(tag)}':fontcolor=cyan:fontsize=28:box=1:boxcolor=black@0.5:x=20:y=h-th-20`);

      drawText.push(`drawtext=text='%{pts\\:hms}':fontcolor=white:fontsize=32:box=1:boxcolor=black@0.5:x=w-tw-20:y=h-th-20`);

      const scaleFilter = targetWidth ? `scale=${targetWidth}:-2` : 'scale=trunc(iw/2)*2:trunc(ih/2)*2';

      const command = ffmpeg();

      imagePaths.forEach((img) => {
        command.input(img).inputOptions([`-loop 1`, `-t ${perImageDuration}`]);
      });

      command.input(audioPath);

      command
        .complexFilter([`${scaleFilter},${drawText.join(',')}`])
        .videoCodec('libx264')
        .audioCodec('aac')
        .outputOptions(['-preset ultrafast', '-pix_fmt yuv420p', '-movflags +faststart', '-shortest'])
        .format('mp4');

      const passThrough = uploadStreamToS3(s3Bucket, s3Key);

      command
        .on('start', (cmd) => console.log('FFmpeg command:', cmd))
        .on('error', (err, stdout, stderr) => {
          console.error('❌ FFmpeg error:', err);
          console.error(stderr);
          reject(err);
        })
        .on('end', () => resolve(`s3://${s3Bucket}/${s3Key}`))
        .pipe(passThrough, { end: true });
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