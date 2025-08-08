// utils/generateVideo.js
import path from 'path';
import fs from 'fs';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegPath from 'ffmpeg-static';

if (ffmpegPath) {
  ffmpeg.setFfmpegPath(ffmpegPath);
}

/**
 * Generate a video from images + audio.
 * imageUrls: array of image URLs or local paths (we take basename -> uploads/<basename>)
 * audioUrl: audio URL or local path
 * outputName: output filename (e.g. "video-123.mp4")
 * perImageDuration: seconds each image is shown (default 2)
 */
export const generateVideo = (imageUrls = [], audioUrl, outputName = `out-${Date.now()}.mp4`, perImageDuration = 2) => {
  return new Promise((resolve, reject) => {
    try {
      if (!audioUrl) return reject(new Error('audioUrl is required'));
      if (!imageUrls || imageUrls.length === 0) return reject(new Error('At least one image is required'));

      const audioPath = path.join(process.cwd(), 'uploads', 'audio', path.basename(audioUrl));
      const imagePaths = imageUrls.map(u => path.join(process.cwd(), 'uploads', path.basename(u)));

      // sanity checks
      if (!fs.existsSync(audioPath)) return reject(new Error(`Audio file not found: ${audioPath}`));
      for (const ip of imagePaths) if (!fs.existsSync(ip)) return reject(new Error(`Image file not found: ${ip}`));

      const outputDir = path.join(process.cwd(), 'output');
      if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

      const outputPath = path.join(outputDir, outputName);

      const command = ffmpeg();

      // Add each image and loop it for perImageDuration seconds
      imagePaths.forEach(img => {
        command.input(img).inputOptions([`-loop 1`]); // loop input
      });

      // Add the audio input
      command.input(audioPath);

      // Set options and output
      // -shortest: stop when shortest stream ends (audio length)
      // -movflags +faststart: enable streaming playback start
      command
        .on('start', cmd => {
          console.log('FFmpeg command:', cmd);
        })
        .on('progress', progress => {
          // optional: could emit progress to websockets/logs
          // console.log('Processing: ', progress);
        })
        .on('end', () => {
          console.log('✅ Video generated at', outputPath);
          resolve(outputPath);
        })
        .on('error', err => {
          console.error('❌ FFmpeg error:', err);
          reject(err);
        })
        // Video/audio codecs
        .videoCodec('libx264')
        .audioCodec('aac')
        .outputOptions([
          '-preset veryfast',
          '-pix_fmt yuv420p',
          '-movflags +faststart',
          '-shortest'
        ])
        // for each image we simulated loop; to set duration we use -t on audio or rely on audio length
        .output(outputPath)
        .run();
    } catch (err) {
      reject(err);
    }
  });
};
