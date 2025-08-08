import path from 'path';
import fs from 'fs';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegPath from 'ffmpeg-static';

if (ffmpegPath) {
  ffmpeg.setFfmpegPath(ffmpegPath);
}

const getAudioDuration = (audioPath) => {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(audioPath, (err, metadata) => {
      if (err) return reject(err);
      resolve(metadata.format?.duration || 0);
    });
  });
};

export const generateVideo = async (
  imagePaths,
  audioPath,
  outputPath,
  perImageDuration = 2
) => {
  return new Promise(async (resolve, reject) => {
    try {
      if (!Array.isArray(imagePaths) || imagePaths.length === 0) {
        return reject(new Error('At least one image is required'));
      }

      // Ensure output directory exists
      const outputDir = path.dirname(outputPath);
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      // Validate all image files exist
      for (const img of imagePaths) {
        if (!fs.existsSync(img)) {
          return reject(new Error(`Image file not found: ${img}`));
        }
      }

      // Fallback audio if missing
      if (!audioPath || !fs.existsSync(audioPath)) {
        audioPath = path.join(process.cwd(), 'assets', 'default.mp3');
        if (!fs.existsSync(audioPath)) {
          return reject(new Error('No audio found and default audio missing.'));
        }
      }

      // Get audio duration to calculate needed images
      const audioDuration = await getAudioDuration(audioPath);
      const neededImages = Math.ceil(audioDuration / perImageDuration);

      // Repeat images if less than needed
      if (imagePaths.length < neededImages) {
        const repeats = Math.ceil(neededImages / imagePaths.length);
        imagePaths = Array(repeats).fill(imagePaths).flat().slice(0, neededImages);
      }

      const command = ffmpeg();

      imagePaths.forEach((img) => {
        command.input(img).inputOptions(['-loop 1', `-t ${perImageDuration}`]);
      });

      command
        .videoFilters('scale=trunc(iw/2)*2:trunc(ih/2)*2')
        .input(audioPath)
        .on('start', (cmd) => console.log('FFmpeg command:', cmd))
        .on('end', () => {
          console.log('✅ Video generated at', outputPath);
          resolve(outputPath);
        })
        .on('error', (err, stdout, stderr) => {
          console.error('❌ FFmpeg error:', err.message);
          console.error('FFmpeg stderr:', stderr);
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
        .save(outputPath);
    } catch (err) {
      reject(err);
    }
  });
};
