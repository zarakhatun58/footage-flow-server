import path from 'path';
import fs from 'fs';
import ffmpeg from 'fluent-ffmpeg';

export const generateVideo = async (audioUrl, imageUrls, outputName = 'output.mp4') => {
  const audioPath = path.join('uploads/audio', path.basename(audioUrl)); // Extract just the file name
  const imagePaths = imageUrls.map(url => path.join('uploads', path.basename(url)));

  // ✅ Check if files exist before proceeding
  if (!fs.existsSync(audioPath)) throw new Error(`Audio file not found: ${audioPath}`);
  imagePaths.forEach(img => {
    if (!fs.existsSync(img)) throw new Error(`Image not found: ${img}`);
  });

  const outputPath = path.join('output', outputName);

  return new Promise((resolve, reject) => {
    const command = ffmpeg();

    // Add images
    imagePaths.forEach(img => command.input(img).loop(3)); // Each image shows for ~3 seconds

    // Add audio
    command.input(audioPath);

    command
      .on('end', () => resolve(outputPath))
      .on('error', reject)
      .outputOptions('-shortest')
      .output(outputPath)
      .run();
  });
};
