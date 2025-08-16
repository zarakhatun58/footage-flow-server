import fs from "fs";
import path from "path";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import ffmpegPkg from 'fluent-ffmpeg';
import ffmpegPath from 'ffmpeg-static';
import { PassThrough } from "stream";
import os from "os";

const ffmpeg = ffmpegPkg;
if (ffmpegPath) ffmpeg.setFfmpegPath(ffmpegPath);

const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});


const escapeFF = (txt = "") =>
  txt.replace(/'/g, "\\'").replace(/:/g, "\\:").replace(/\\/g, "\\\\");

const getAudioDuration = (audioPath) =>
  new Promise((resolve, reject) => {
    ffmpeg.ffprobe(audioPath, (err, metadata) => {
      if (err) return reject(err);
      resolve(metadata.format?.duration || 0);
    });
  });

const downloadFile = (url, dest) =>
  new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https
      .get(url, (response) => {
        if (response.statusCode !== 200) {
          return reject(new Error(`Failed to download: ${url}`));
        }
        response.pipe(file);
        file.on("finish", () => file.close(resolve));
      })
      .on("error", reject);
  });

export const generateVideoToS3 = async ({
  imagePaths,
  audioPath,
  s3Bucket,
  s3Key,
  perImageDuration = 2,
  targetWidth = 1280,
  title = "",
  emotion = "",
  story = "",
  tag = "",
}) => {
  imagePaths = imagePaths.filter((img) => fs.existsSync(img));
  if (imagePaths.length === 0) throw new Error("No valid images found.");

  let localAudioPath = audioPath;
  if (/^https?:\/\//.test(audioPath)) {
    const audioDir = path.join(process.cwd(), "tmp-audio");
    await fs.promises.mkdir(audioDir, { recursive: true });
    localAudioPath = path.join(audioDir, path.basename(audioPath));
    await downloadFile(audioPath, localAudioPath);
  }
  if (!fs.existsSync(localAudioPath)) {
    throw new Error(`Audio file not found at ${localAudioPath}`);
  }

  const audioDuration = await getAudioDuration(localAudioPath);
  const neededImages = Math.max(1, Math.ceil(audioDuration / perImageDuration));
  if (imagePaths.length < neededImages) {
    const repeats = Math.ceil(neededImages / imagePaths.length);
    imagePaths = Array(repeats).fill(imagePaths).flat().slice(0, neededImages);
  }

  const drawTextFilters = [];
  if (title)
    drawTextFilters.push(
      `drawtext=text='${escapeFF(title)}':fontcolor=white:fontsize=48:box=1:boxcolor=black@0.5:boxborderw=10:x=(w-text_w)/2:y=50`
    );
  if (emotion)
    drawTextFilters.push(
      `drawtext=text='${escapeFF(emotion)}':fontcolor=yellow:fontsize=36:box=1:boxcolor=black@0.5:x=w-tw-20:y=50`
    );
  if (story)
    drawTextFilters.push(
      `drawtext=text='${escapeFF(story)}':fontcolor=white:fontsize=32:box=1:boxcolor=black@0.5:x=(w-text_w)/2:y=h-th-100`
    );
  if (tag)
    drawTextFilters.push(
      `drawtext=text='${escapeFF(tag)}':fontcolor=cyan:fontsize=28:box=1:boxcolor=black@0.5:x=20:y=h-th-20`
    );
  drawTextFilters.push(
    `drawtext=text='%{pts\\:hms}':fontcolor=white:fontsize=32:box=1:boxcolor=black@0.5:x=w-tw-20:y=h-th-20`
  );

  const scalePadFilter = `
scale=${targetWidth}:-2:force_original_aspect_ratio=decrease
,scale=trunc(iw/2)*2:trunc(ih/2)*2
`;

  const finalFilters = [scalePadFilter, ...drawTextFilters];

  const tmpFile = path.join(os.tmpdir(), `video-${Date.now()}.mp4`);

  await new Promise((resolve, reject) => {
    const command = ffmpeg();

    imagePaths.forEach((img) =>
      command.input(img).inputOptions([`-loop 1`, `-t ${perImageDuration}`])
    );
    command.input(localAudioPath);

    command
      .complexFilter(finalFilters)
      .videoCodec("libx264")
      .audioCodec("aac")
      .outputOptions([
        "-preset ultrafast",
        "-pix_fmt yuv420p",
        "-movflags +faststart",
        "-shortest",
      ])
      .format("mp4")
      .on("start", (cmd) => console.log("🎬 FFmpeg:", cmd))
      .on("error", (err, stdout, stderr) => {
        console.error("❌ FFmpeg error:", err);
        console.error(stderr);
        reject(err);
      })
      .on("end", resolve)
      .save(tmpFile);
  });

  await s3.send(
    new PutObjectCommand({
      Bucket: s3Bucket,
      Key: s3Key,
      Body: fs.createReadStream(tmpFile),
      ContentType: "video/mp4",
    })
  );

  fs.unlink(tmpFile, () => { });
  console.log(`✅ Uploaded to s3://${s3Bucket}/${s3Key}`);
  return `https://${s3Bucket}.s3.amazonaws.com/${s3Key}`;
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