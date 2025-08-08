import path from 'path';
import fs from 'fs';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegPath from 'ffmpeg-static';

if (ffmpegPath) {
  ffmpeg.setFfmpegPath(ffmpegPath);
}

/**
 * Get audio duration in seconds
 */
const getAudioDuration = (audioPath) => {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(audioPath, (err, metadata) => {
      if (err) return reject(err);
      resolve(metadata.format?.duration || 0);
    });
  });
};

/**
 * Generate video from images + audio.
 * 
 * imagePaths: array of local image file paths
 * audioPath: local audio file path
 * outputPath: full path to output video file
 * perImageDuration: seconds each image shows, default 2
 */
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

      // Validate images exist
      for (const img of imagePaths) {
        if (!fs.existsSync(img)) {
          return reject(new Error(`Image file not found: ${img}`));
        }
      }

      // Validate or fallback audio
      if (!audioPath || !fs.existsSync(audioPath)) {
        audioPath = path.join(process.cwd(), 'assets', 'default.mp3');
        if (!fs.existsSync(audioPath)) {
          return reject(new Error('No audio found and default audio missing.'));
        }
      }

      const audioDuration = await getAudioDuration(audioPath);

      // Repeat images if needed to cover full audio duration
      const neededImages = Math.ceil(audioDuration / perImageDuration);
      if (imagePaths.length < neededImages) {
        const repeats = Math.ceil(neededImages / imagePaths.length);
        imagePaths = Array(repeats)
          .fill(imagePaths)
          .flat()
          .slice(0, neededImages);
      }

      const command = ffmpeg();

      // Add each image input with looping and duration
      imagePaths.forEach((img) => {
        command.input(img).inputOptions(['-loop 1', `-t ${perImageDuration}`]);
      });

      // Add audio input
      command.input(audioPath);

      console.log('FFmpeg command input images:', imagePaths);
      console.log('FFmpeg command audio:', audioPath);
      console.log('FFmpeg command output:', outputPath);

      command
        .on('start', (cmd) => console.log('FFmpeg started:', cmd))
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
          '-shortest',
        ])
        .save(outputPath);
    } catch (err) {
      reject(err);
    }
  });
};
