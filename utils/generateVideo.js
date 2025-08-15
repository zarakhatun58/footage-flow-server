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


const createImageListFile = (imagePaths, perImageDuration, tmpFilePath) => {
  const lines = [];
  imagePaths.forEach((img) => {
    lines.push(`file '${img.replace(/'/g, "'\\''")}'`);
    lines.push(`duration ${perImageDuration}`);
  });
  lines.push(`file '${imagePaths[imagePaths.length - 1].replace(/'/g, "'\\''")}'`);
  fs.writeFileSync(tmpFilePath, lines.join('\n'), 'utf-8');
};

export const generateVideo = async (
  imagePaths,
  audioPath,
  outputPath,
  perImageDuration = 2,
  targetWidth = 1280,
  title = '',
  emotion = '',
  story = '',
  tag = ''
) => {
  return new Promise(async (resolve, reject) => {
    try {
      // Fallback image
      if (!Array.isArray(imagePaths) || imagePaths.length === 0) {
        imagePaths = [path.join(process.cwd(), 'assets', 'default.jpg')];
        if (!fs.existsSync(imagePaths[0]))
          return reject(new Error('No images provided and default image missing.'));
      }

      imagePaths = imagePaths.filter((img) => fs.existsSync(img));
      if (imagePaths.length === 0)
        imagePaths = [path.join(process.cwd(), 'assets', 'default.jpg')];

      if (!audioPath || !fs.existsSync(audioPath))
        audioPath = path.join(process.cwd(), 'assets', 'default.mp3');

      const audioDuration = await getAudioDuration(audioPath);
      const neededImages = Math.ceil(audioDuration / perImageDuration);
      if (imagePaths.length < neededImages) {
        const repeats = Math.ceil(neededImages / imagePaths.length);
        imagePaths = Array(repeats).fill(imagePaths).flat().slice(0, neededImages);
      }

      const outputDir = path.dirname(outputPath);
      if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

      const tmpListPath = path.join(outputDir, 'images.txt');
      createImageListFile(imagePaths, perImageDuration, tmpListPath);

      // Build overlays
      const drawText = [];
      const escapeFF = (txt) => txt.replace(/'/g, "\\'");

      if (title) drawText.push(`drawtext=text='${escapeFF(title)}':fontcolor=white:fontsize=48:box=1:boxcolor=black@0.5:boxborderw=10:x=(w-text_w)/2:y=50`);
      if (emotion) drawText.push(`drawtext=text='${escapeFF(emotion)}':fontcolor=yellow:fontsize=36:box=1:boxcolor=black@0.5:x=w-tw-20:y=50`);
      if (story) drawText.push(`drawtext=text='${escapeFF(story)}':fontcolor=white:fontsize=32:box=1:boxcolor=black@0.5:x=(w-text_w)/2:y=h-th-100`);
      if (tag) drawText.push(`drawtext=text='${escapeFF(tag)}':fontcolor=cyan:fontsize=28:box=1:boxcolor=black@0.5:x=20:y=h-th-20`);

      drawText.push(`drawtext=text='%{pts\\:hms}':fontcolor=white:fontsize=32:box=1:boxcolor=black@0.5:x=w-tw-20:y=h-th-20`);

      const scaleFilter = targetWidth ? `scale=${targetWidth}:-2` : 'scale=trunc(iw/2)*2:trunc(ih/2)*2';
      const complexFilter = [`${scaleFilter}`, ...drawText];

      ffmpeg()
        .input(tmpListPath)
        .inputOptions(['-f concat', '-safe 0'])
        .input(audioPath)
        .complexFilter(complexFilter)
        .videoCodec('libx264')
        .audioCodec('aac')
        .outputOptions(['-preset ultrafast', '-pix_fmt yuv420p', '-movflags +faststart', '-shortest'])
        .on('start', (cmd) => console.log('FFmpeg command:', cmd))
        .on('error', (err, stdout, stderr) => {
          console.error('❌ FFmpeg error:', err?.message || err);
          console.error(stderr);
          reject(err);
        })
        .on('end', () => {
          console.log('✅ Video generated at', outputPath);
          fs.unlinkSync(tmpListPath);
          resolve(outputPath);
        })
        .save(outputPath);
    } catch (err) {
      console.error('❌ Unexpected error in generateVideo:', err);
      reject(err);
    }
  });
};


// export const generateVideo = async (
//   imagePaths,
//   audioPath,
//   outputPath,
//   perImageDuration = 2,
//   targetWidth = 1280,
//   title = "", // New: overlay title
// ) => {
//   return new Promise(async (resolve, reject) => {
//     try {
//       // Default image
//       if (!Array.isArray(imagePaths) || imagePaths.length === 0) {
//         imagePaths = [path.join(process.cwd(), 'assets', 'default.jpg')];
//         if (!fs.existsSync(imagePaths[0])) {
//           return reject(new Error('No images provided and default image missing.'));
//         }
//       }

//       const outputDir = path.dirname(outputPath);
//       if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

//       // Filter missing images
//       imagePaths = imagePaths.filter(img => fs.existsSync(img));
//       if (imagePaths.length === 0) {
//         imagePaths = [path.join(process.cwd(), 'assets', 'default.jpg')];
//       }

//       // Fallback audio
//       if (!audioPath || !fs.existsSync(audioPath)) {
//         audioPath = path.join(process.cwd(), 'assets', 'default.mp3');
//       }

//       const audioDuration = await getAudioDuration(audioPath);
//       const neededImages = Math.ceil(audioDuration / perImageDuration);
//       if (imagePaths.length < neededImages) {
//         const repeats = Math.ceil(neededImages / imagePaths.length);
//         imagePaths = Array(repeats).fill(imagePaths).flat().slice(0, neededImages);
//       }

//       const command = ffmpeg();

//       imagePaths.forEach(img => {
//         command.input(img).inputOptions(['-loop 1', `-t ${perImageDuration}`]);
//       });

//       if (fs.existsSync(audioPath)) command.input(audioPath);

//       const scaleFilter = targetWidth
//         ? `scale=${targetWidth}:-2`
//         : 'scale=trunc(iw/2)*2:trunc(ih/2)*2';

//       // Overlay text: title + timestamp
//       const drawText = [];
//       if (title) {
//         drawText.push(
//           `drawtext=text='${title}':fontcolor=white:fontsize=48:box=1:boxcolor=black@0.5:boxborderw=10:x=(w-text_w)/2:y=50`
//         );
//       }
//       drawText.push(
//         `drawtext=text='%{pts\\:hms}':fontcolor=white:fontsize=32:box=1:boxcolor=black@0.5:boxborderw=5:x=w-tw-20:y=h-th-20`
//       );

//       command
//         .complexFilter([`${scaleFilter},${drawText.join(',')}`])
//         .videoCodec('libx264')
//         .audioCodec('aac')
//         .outputOptions(['-preset ultrafast', '-pix_fmt yuv420p', '-movflags +faststart', '-shortest'])
//         .on('start', (cmd) => console.log('FFmpeg command:', cmd))
//         .on('end', () => {
//           console.log('✅ Video generated at', outputPath);
//           resolve(outputPath);
//         })
//         .on('error', (err, stdout, stderr) => {
//           console.error('❌ FFmpeg error:', err?.message || err);
//           console.error('FFmpeg stderr:', stderr);
//           resolve(outputPath);
//         })
//         .save(outputPath);

//     } catch (err) {
//       console.error('❌ Unexpected error in generateVideo:', err);
//       resolve(outputPath);
//     }
//   });
// };


// export const generateVideo = async (
//   imagePaths,
//   audioPath,
//   outputPath,
//   perImageDuration = 2,
//   targetWidth = 1280 // optional downscale for speed
// ) => {
//   return new Promise(async (resolve, reject) => {
//     try {
//       // Ensure at least one image
//       if (!Array.isArray(imagePaths) || imagePaths.length === 0) {
//         imagePaths = [path.join(process.cwd(), 'assets', 'default.jpg')];
//         if (!fs.existsSync(imagePaths[0])) {
//           return reject(new Error('No images provided and default image missing.'));
//         }
//       }

//       // Ensure output directory exists
//       const outputDir = path.dirname(outputPath);
//       if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

//       // Filter out missing images
//       imagePaths = imagePaths.filter(img => fs.existsSync(img));
//       if (imagePaths.length === 0) {
//         imagePaths = [path.join(process.cwd(), 'assets', 'default.jpg')];
//       }

//       // Fallback audio
//       if (!audioPath || !fs.existsSync(audioPath)) {
//         audioPath = path.join(process.cwd(), 'assets', 'default.mp3');
//       }

//       const audioDuration = await getAudioDuration(audioPath);
//       const neededImages = Math.ceil(audioDuration / perImageDuration);

//       // Repeat images if less than needed
//       if (imagePaths.length < neededImages) {
//         const repeats = Math.ceil(neededImages / imagePaths.length);
//         imagePaths = Array(repeats).fill(imagePaths).flat().slice(0, neededImages);
//       }

//       const command = ffmpeg();

//       imagePaths.forEach(img => {
//         command.input(img).inputOptions(['-loop 1', `-t ${perImageDuration}`]);
//       });

//       if (fs.existsSync(audioPath)) command.input(audioPath);

//       // Optional scaling to reduce resolution for speed
//       const scaleFilter = targetWidth
//         ? `scale=${targetWidth}:-2`
//         : 'scale=trunc(iw/2)*2:trunc(ih/2)*2';

//       command
//         .videoFilters(scaleFilter)
//         .videoCodec('libx264')
//         .audioCodec('aac')
//         .outputOptions(['-preset ultrafast', '-pix_fmt yuv420p', '-movflags +faststart', '-shortest'])
//         .on('start', (cmd) => console.log('FFmpeg command:', cmd))
//         .on('end', () => {
//           console.log('✅ Video generated at', outputPath);
//           resolve(outputPath);
//         })
//         .on('error', (err, stdout, stderr) => {
//           console.error('❌ FFmpeg error:', err?.message || err);
//           console.error('FFmpeg stderr:', stderr);
//           // Resolve anyway to avoid crashing
//           resolve(outputPath);
//         })
//         .save(outputPath);

//     } catch (err) {
//       console.error('❌ Unexpected error in generateVideo:', err);
//       resolve(outputPath); // Always resolve, never throw
//     }
//   });
// };

// export const generateVideo = async (
//   imagePaths,
//   audioPath,
//   outputPath,
//   perImageDuration = 2
// ) => {
//   return new Promise(async (resolve, reject) => {
//     try {
//       // Ensure at least one image
//       if (!Array.isArray(imagePaths) || imagePaths.length === 0) {
//         imagePaths = [path.join(process.cwd(), 'assets', 'default.jpg')];
//         if (!fs.existsSync(imagePaths[0])) {
//           return reject(new Error('No images provided and default image missing.'));
//         }
//       }

//       // Ensure output directory exists
//       const outputDir = path.dirname(outputPath);
//       if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

//       // Filter out missing images
//       imagePaths = imagePaths.filter(img => fs.existsSync(img));
//       if (imagePaths.length === 0) {
//         imagePaths = [path.join(process.cwd(), 'assets', 'default.jpg')];
//       }

//       // Fallback audio
//       if (!audioPath || !fs.existsSync(audioPath)) {
//         audioPath = path.join(process.cwd(), 'assets', 'default.mp3');
//       }

//       const audioDuration = await getAudioDuration(audioPath);
//       const neededImages = Math.ceil(audioDuration / perImageDuration);

//       // Repeat images if less than needed
//       if (imagePaths.length < neededImages) {
//         const repeats = Math.ceil(neededImages / imagePaths.length);
//         imagePaths = Array(repeats).fill(imagePaths).flat().slice(0, neededImages);
//       }

//       const command = ffmpeg();

//       imagePaths.forEach((img) => {
//         command.input(img).inputOptions(['-loop 1', `-t ${perImageDuration}`]);
//       });

//       if (fs.existsSync(audioPath)) command.input(audioPath);

//       command
//         .videoFilters('scale=trunc(iw/2)*2:trunc(ih/2)*2')
//         .videoCodec('libx264')
//         .audioCodec('aac')
//         .outputOptions(['-preset veryfast', '-pix_fmt yuv420p', '-movflags +faststart', '-shortest'])
//         .on('start', (cmd) => console.log('FFmpeg command:', cmd))
//         .on('end', () => {
//           console.log('✅ Video generated at', outputPath);
//           resolve(outputPath);
//         })
//         .on('error', (err, stdout, stderr) => {
//           console.error('❌ FFmpeg error:', err?.message || err);
//           console.error('FFmpeg stderr:', stderr);
//           // Resolve anyway to avoid crashing
//           resolve(outputPath);
//         })
//         .save(outputPath);

//     } catch (err) {
//       console.error('❌ Unexpected error in generateVideo:', err);
//       resolve(outputPath); // Always resolve, never throw
//     }
//   });
// };


// export const generateVideo = async (
//   imagePaths,
//   audioPath,
//   outputPath,
//    perImageDuration = 10 
// ) => {
//   return new Promise(async (resolve, reject) => {
//     try {
//       if (!Array.isArray(imagePaths) || imagePaths.length === 0) {
//         return reject(new Error('At least one image is required'));
//       }

//       // Ensure output directory exists
//       const outputDir = path.dirname(outputPath);
//       if (!fs.existsSync(outputDir)) {
//         fs.mkdirSync(outputDir, { recursive: true });
//       }

//       // Validate all image files exist
//       for (const img of imagePaths) {
//         if (!fs.existsSync(img)) {
//           return reject(new Error(`Image file not found: ${img}`));
//         }
//       }

//       // Fallback audio if missing
//       if (!audioPath || !fs.existsSync(audioPath)) {
//         audioPath = path.join(process.cwd(), 'assets', 'default.mp3');
//         if (!fs.existsSync(audioPath)) {
//           return reject(new Error('No audio found and default audio missing.'));
//         }
//       }

//       // Get audio duration to calculate needed images
//       const audioDuration = await getAudioDuration(audioPath);
//       const neededImages = Math.ceil(audioDuration / perImageDuration);

//       // Repeat images if less than needed
//       if (imagePaths.length < neededImages) {
//         const repeats = Math.ceil(neededImages / imagePaths.length);
//         imagePaths = Array(repeats).fill(imagePaths).flat().slice(0, neededImages);
//       }

//       const command = ffmpeg();

//       imagePaths.forEach((img) => {
//         command.input(img).inputOptions(['-loop 1', `-t ${perImageDuration}`]);
//       });

//       command
//         .videoFilters('scale=trunc(iw/2)*2:trunc(ih/2)*2')
//         .input(audioPath)
//         .on('start', (cmd) => console.log('FFmpeg command:', cmd))
//         .on('end', () => {
//           console.log('✅ Video generated at', outputPath);
//           resolve(outputPath);
//         })
//         .on('error', (err, stdout, stderr) => {
//           console.error('❌ FFmpeg error:', err.message);
//           console.error('FFmpeg stderr:', stderr);
//           reject(err);
//         })
//         .videoCodec('libx264')
//         .audioCodec('aac')
//         .outputOptions([
//           '-preset veryfast',
//           '-pix_fmt yuv420p',
//           '-movflags +faststart',
//           '-shortest'
//         ])
//         .save(outputPath);
//     } catch (err) {
//       reject(err);
//     }
//   });
// };

