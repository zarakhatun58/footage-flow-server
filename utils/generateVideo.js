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

      // Ensure output directory
      const outputDir = path.dirname(outputPath);
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      // Validate images
      for (const img of imagePaths) {
        if (!fs.existsSync(img)) {
          return reject(new Error(`Image file not found: ${img}`));
        }
      }

      // Fallback audio if missing
      if (!audioPath || !fs.existsSync(audioPath)) {
        audioPath = path.join(process.cwd(), 'assets', 'default.mp3');
        if (!fs.existsSync(audioPath)) {
          return reject(
            new Error('No audio found and default audio missing.')
          );
        }
      }

      // Get audio duration
      const audioDuration = await getAudioDuration(audioPath);

      // Repeat images until total length >= audio length
      const neededImages = Math.ceil(audioDuration / perImageDuration);
      if (imagePaths.length < neededImages) {
        const repeats = Math.ceil(neededImages / imagePaths.length);
        imagePaths = Array(repeats)
          .fill(imagePaths)
          .flat()
          .slice(0, neededImages);
      }

      const command = ffmpeg();

      // Add images
      imagePaths.forEach((img) => {
        command.input(img).inputOptions(['-loop 1', `-t ${perImageDuration}`]);
      });

      // Add audio
      command.input(audioPath);

      // Run ffmpeg
      command
        .on('start', (cmd) => console.log('FFmpeg:', cmd))
        .on('end', () => {
          console.log('✅ Video generated at', outputPath);
          resolve(outputPath);
        })
        .on('error', (err) => {
          console.error('❌ FFmpeg error:', err.message);
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
