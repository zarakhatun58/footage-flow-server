import fs from "fs/promises";
import path from "path";
import textToSpeech from '@google-cloud/text-to-speech';
import os from "os";
import { v4 as uuidv4 } from "uuid";
import ffmpegPkg from "fluent-ffmpeg";
import ffmpegPath from "ffmpeg-static";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const ffmpeg = ffmpegPkg;
if (ffmpegPath) ffmpeg.setFfmpegPath(ffmpegPath);

const s3 = new S3Client({
    region: process.env.AWS_REGION,
    
});

if (process.env.GOOGLE_CREDS_JSON && !process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    const credsPath = process.env.NODE_ENV === 'production'
        ? '/tmp/google-creds.json' // ✅ Writable on Render
        : path.resolve('./config/google-creds.json');

    fs.writeFileSync(credsPath, process.env.GOOGLE_CREDS_JSON);
    process.env.GOOGLE_APPLICATION_CREDENTIALS = credsPath;
}

const ttsClient = new textToSpeech.TextToSpeechClient();

/**
 * Generate voice-over from text
 */
async function generateVoiceOver(text) {
    const request = {
        input: { text },
        voice: { languageCode: "en-US", ssmlGender: "FEMALE" },
        audioConfig: { audioEncoding: "MP3" },
    };

    const [response] = await ttsClient.synthesizeSpeech(request);

    const audioFile = path.join(os.tmpdir(), `voice-${uuidv4()}.mp3`);
    await fs.writeFile(audioFile, response.audioContent, "binary");

    return audioFile;
}

/**
 * Generate story video with FFmpeg (black screen + voice-over)
 */
async function generateStoryVideo(text) {
    const audioFile = await generateVoiceOver(text);

    const videoFile = path.join(os.tmpdir(), `story-${uuidv4()}.mp4`);

    return new Promise((resolve, reject) => {
        ffmpeg()
            .input(`color=black:s=1280x720:d=10`)
            .inputOptions(["-f lavfi"])
            .input(audioFile)
            .videoCodec("libx264")
            .audioCodec("aac")
            .outputOptions("-shortest")
            .save(videoFile)
            .on("end", () => resolve({ audioFile, videoFile }))
            .on("error", (err) => reject(err));
    });
}

/**
 * Upload story video to S3
 */
async function uploadStoryToS3(localFile) {
    const fileStream = await fs.readFile(localFile);
    const key = `stories/${path.basename(localFile)}`;

    await s3.send(
        new PutObjectCommand({
            Bucket: process.env.AWS_BUCKET_NAME,
            Key: key,
            Body: fileStream,
            ContentType: "video/mp4",
        })
    );

    return `https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;
}

/**
 * Main flow
 */
export async function createStoryVideo(text) {
    try {
        const { videoFile, audioFile } = await generateStoryVideo(text);

        console.log("🎥 Story video created:", videoFile);

        const url = await uploadStoryToS3(videoFile);

        console.log("✅ Story uploaded to S3:", url);

        // cleanup temp files
        await fs.unlink(videoFile).catch(() => { });
        await fs.unlink(audioFile).catch(() => { });

        return { success: true, url };
    } catch (err) {
        console.error("❌ Story video generation failed:", err);
        return { success: false, error: err.message };
    }
}
