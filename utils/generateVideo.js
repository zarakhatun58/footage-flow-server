import path from 'path';
import fs from 'fs';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegPath from 'ffmpeg-static';

if (ffmpegPath) {
  ffmpeg.setFfmpegPath(ffmpegPath);
}

/**
 * Generate a video from images + audio.
 * imageUrls: array of image URLs or local paths (string also allowed)
 * audioUrl: audio URL or local path
 * outputName: output filename (e.g. "video-123.mp4")
 * perImageDuration: seconds each image is shown (default 2)
 */
export const generateVideo = (
  imageUrls = [],
  audioUrl,
  outputName = `out-${Date.now()}.mp4`,
  perImageDuration = 2
) => {
  return new Promise((resolve, reject) => {
    try {
      if (!audioUrl) return reject(new Error('audioUrl is required'));

      // 🔹 Normalize to array
      if (!Array.isArray(imageUrls)) {
        imageUrls = [imageUrls];
      }
      if (!imageUrls.length) {
        return reject(new Error('At least one image is required'));
      }

      const audioPath = path.join(process.cwd(), 'uploads', 'audio', path.basename(audioUrl));
      const imagePaths = imageUrls.map(u =>
        path.join(process.cwd(), 'uploads', path.basename(u))
      );

      if (!fs.existsSync(audioPath)) {
        return reject(new Error(`Audio file not found: ${audioPath}`));
      }
      for (const ip of imagePaths) {
        if (!fs.existsSync(ip)) return reject(new Error(`Image file not found: ${ip}`));
      }

      const outputDir = path.join(process.cwd(), 'output');
      if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

      const outputPath = path.join(outputDir, outputName);

      const command = ffmpeg();

      // 🔹 Add each image and loop it
      imagePaths.forEach(img => {
        command.input(img).inputOptions(['-loop 1']);
      });

      // Add audio input
      command.input(audioPath);

      command
        .on('start', cmd => console.log('FFmpeg command:', cmd))
        .on('end', () => {
          console.log('✅ Video generated at', outputPath);
          resolve(outputPath);
        })
        .on('error', err => {
          console.error('❌ FFmpeg error:', err);
          reject(err);
        })
        .videoCodec('libx264')
        .audioCodec('aac')
        .outputOptions([
          '-preset veryfast',
          '-pix_fmt yuv420p',
          '-movflags +faststart',
          '-shortest'
        ])
        .output(outputPath)
        .run();
    } catch (err) {
      reject(err);
    }
  });
};
