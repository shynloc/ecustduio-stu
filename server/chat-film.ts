import { mkdtemp, rm, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { get, run, parse, json, tx, err, requireRow, dataDir } from "./db.js";
import { asset, assetBuffer } from "./domain.js";
import { grantMediaAsset, checkMediaAsset } from "./media-access.js";
import { officePage } from "./chat-preview.js";
import { cardMessage } from "./chat-adaptations.js";
import { visualNarration } from "./visual-audio.js";
import { command, ffmpegPath } from "./visual-runtime.js";
import { workflowActor } from "./workflow-agent.js";
import { storeWorkflowArtifact } from "./workflows.js";
import { makeWav, readWav } from "./wav.js";

const ts = (n: number) =>
  new Date(Math.round(n * 1000)).toISOString().slice(11, 23).replace(".", ",");
export async function runChatFilmTask(
  kind: string,
  input: any,
  jobId: string,
  progress: any,
  signal: AbortSignal,
  transport: typeof fetch,
) {
  const user = workflowActor(input.actorId, false);
  const { card } = cardMessage(
    input.conversationId,
    input.messageId,
    user,
    true,
  );
  if (card.kind !== "video") return err("WRONG_CARD", "找不到原视频讲稿", 409);
  const meta = {
    ownerId: user.id,
    conversationId: input.conversationId,
    sourceArtifactId: card.sourceId,
    sourceVersion: card.sourceVersion,
    messageId: input.messageId,
  };
  const check = () => {
    signal.throwIfAborted();
    workflowActor(user.id, false);
  };
  const dir = await mkdtemp(join(dataDir, "staging", "chat-film-"));
  function save(bytes: Buffer, name: string, format: string) {
    check();
    return tx(() => {
      const f = storeWorkflowArtifact(
        bytes,
        name,
        format,
        jobId,
        input.conversationId,
        meta,
      );
      grantMediaAsset(f.asset_id, user.id);
      return { id: f.id, assetId: f.asset_id, name: f.name, format };
    });
  }
  try {
    if (kind === "chat-narration") {
      const clips = [];
      for (const scene of card.scenes) {
        check();
        progress("narration", {
          message: "正在准备第 " + scene.page + " 页试听",
        });
        const part = await visualNarration(
          {
            scenes: [
              {
                id: String(scene.page),
                title: scene.title,
                narration: scene.text,
                hold: 0,
              },
            ],
          },
          { voice: "stella", speed: scene.speed, subtitles: "scene" },
          {
            input,
            dir,
            signal,
            transport,
            check,
            progress,
            metadata: {
              ownerId: user.id,
              versionId: card.sourceId,
              internalChatAudio: true,
            },
          },
        );
        const file = asset(
          part.bytes,
          scene.title + ".wav",
          "audio/wav",
          "media",
        );
        grantMediaAsset(file.id, user.id);
        clips.push({
          page: scene.page,
          text: scene.text,
          assetId: file.id,
          pcm: readWav(part.bytes).pcm,
        });
      }
      const spoken = clips.reduce((n, c) => n + c.pcm.length / 2, 0);
      const total = Math.max(Math.round(card.seconds * 16000), spoken);
      if (total > 600 * 16000)
        err("VIDEO_TOO_LONG", "实际配音超过十分钟，请缩短讲稿", 422);
      const chunks = [];
      const timeline = [];
      let pos = 0;
      for (const [i, c] of clips.entries()) {
        const begin = pos;
        chunks.push(c.pcm);
        pos += c.pcm.length / 2;
        const audioEnd = pos;
        const padding =
          Math.floor(((total - spoken) * (i + 1)) / clips.length) -
          Math.floor(((total - spoken) * i) / clips.length);
        chunks.push(Buffer.alloc(padding * 2));
        pos += padding;
        timeline.push({
          page: c.page,
          start: begin / 16000,
          audioEnd: audioEnd / 16000,
          end: pos / 16000,
          text: c.text,
          audioAssetId: c.assetId,
        });
      }
      const wav = save(
        makeWav(Buffer.concat(chunks)),
        card.title + "_试听.wav",
        "wav",
      );
      return {
        wav,
        timeline,
        duration: pos / 16000,
        speechSeconds: spoken / 16000,
        conversationId: input.conversationId,
      };
    }
    const audio = requireRow(
      get(
        "SELECT type,input,state,result FROM jobs WHERE id=?",
        input.audioJobId,
      ),
    );
    if (
      audio.type !== "chat-narration" ||
      parse(audio.input).messageId !== input.messageId ||
      audio.state !== "succeeded"
    )
      err("AUDIO_REQUIRED", "已确认的试听版本不可用", 409);
    const { timeline, wav, duration } = parse(audio.result);
    checkMediaAsset(wav.assetId, user);
    await writeFile(join(dir, "audio.wav"), assetBuffer(wav.assetId).data);
    const cached = parse(
      requireRow(get("SELECT checkpoint FROM jobs WHERE id=?", jobId))
        .checkpoint,
    );
    const frames: Record<string, string> = cached.frames || {};
    const priorVideo = get(
      "SELECT a.id,a.asset_id AS assetId,s.name,a.format FROM artifacts a JOIN assets s ON s.id=a.asset_id WHERE a.job_id=? AND a.format='mp4'",
      jobId,
    );
    const concat = [],
      subtitles = [];
    for (const [i, c] of timeline.entries()) {
      check();
      progress("render", {
        message: "正在合成原演示第 " + c.page + " 页 / " + timeline.length,
      });
      const file = "slide-" + i + ".png";
      if (!priorVideo) {
        let image: Buffer;
        if (frames[c.page]) {
          checkMediaAsset(frames[c.page], user);
          image = assetBuffer(frames[c.page]).data;
        } else {
          const frame = await officePage(
            input.conversationId,
            card.slideId,
            c.page,
            user,
          );
          if (frame.pageCount !== timeline.length)
            err("PAGE_MISMATCH", "预览页数和确认的讲稿不一致", 409);
          progress("render", {
            message: "正在保存第 " + c.page + " 页画面检查点",
          });
          image = frame.bytes;
          tx(() => {
            const a = asset(image, file, "image/png", "media");
            grantMediaAsset(a.id, user.id);
            frames[c.page] = a.id;
            run(
              "UPDATE jobs SET checkpoint=? WHERE id=?",
              json({ ...cached, frames }),
              jobId,
            );
          });
        }
        await writeFile(join(dir, file), image);
      }
      concat.push(
        "file '" + file + "'",
        "duration " + (c.end - c.start).toFixed(6),
      );
      subtitles.push(
        i +
          1 +
          "\n" +
          ts(c.start) +
          " --> " +
          ts(c.audioEnd) +
          "\n" +
          c.text +
          "\n",
      );
    }
    concat.push("file 'slide-" + (timeline.length - 1) + ".png'");
    await writeFile(join(dir, "frames.txt"), concat.join("\n"));
    progress("encode", { message: "正在编码有声 MP4 和同步字幕" });
    if (!priorVideo)
      await command(
        ffmpegPath(),
        [
          "-v",
          "error",
          "-y",
          "-f",
          "concat",
          "-safe",
          "1",
          "-i",
          join(dir, "frames.txt"),
          "-i",
          join(dir, "audio.wav"),
          "-vf",
          "scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,fps=25",
          "-c:v",
          "libx264",
          "-pix_fmt",
          "yuv420p",
          "-preset",
          "veryfast",
          "-threads",
          "2",
          "-c:a",
          "aac",
          "-movflags",
          "+faststart",
          "-t",
          String(duration),
          join(dir, "video.mp4"),
        ],
        signal,
        600000,
      );
    check();
    const mp4 =
      priorVideo ||
      save(await readFile(join(dir, "video.mp4")), card.title + ".mp4", "mp4");
    const srt = save(
      Buffer.from(subtitles.join("\n")),
      card.title + ".srt",
      "srt",
    );
    return {
      artifacts: [mp4, srt],
      duration,
      frames: timeline.length,
      conversationId: input.conversationId,
    };
  } finally {
    await rm(dir, { recursive: true, force: true, maxRetries: 3 });
  }
}
