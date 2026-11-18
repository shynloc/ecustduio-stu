import { err } from "./db.js";

export function readWav(data: Buffer, streamed = false) {
  if (
    data.length < 44 ||
    data.toString("ascii", 0, 4) !== "RIFF" ||
    data.toString("ascii", 8, 12) !== "WAVE"
  )
    err(
      "AUDIO_FORMAT",
      "音频需要为16位 PCM WAV；请在页面上传录音，由浏览器自动转换",
      422,
    );
  const declared = data.readUInt32LE(4);
  if (declared !== 0xffffffff && declared + 8 > data.length)
    err("AUDIO_TRUNCATED", "音频传输不完整，请重新生成或上传", 422);
  let format: any, pcm: Buffer | undefined;
  for (let offset = 12; offset + 8 <= data.length;) {
    const kind = data.toString("ascii", offset, offset + 4),
      size = data.readUInt32LE(offset + 4),
      start = offset + 8;
    const actual =
      streamed && kind === "data" && size === 0xffffffff
        ? data.length - start
        : size;
    if (start + actual > data.length)
      err("AUDIO_TRUNCATED", "音频数据不完整，未保存为成果", 422);
    if (kind === "fmt " && actual >= 16)
      format = {
        encoding: data.readUInt16LE(start),
        channels: data.readUInt16LE(start + 2),
        sampleRate: data.readUInt32LE(start + 4),
        byteRate: data.readUInt32LE(start + 8),
        blockAlign: data.readUInt16LE(start + 12),
        bits: data.readUInt16LE(start + 14),
      };
    if (kind === "data") pcm = data.subarray(start, start + actual);
    offset = start + actual + (actual % 2);
  }
  if (
    !format ||
    !pcm?.length ||
    format.encoding !== 1 ||
    format.bits !== 16 ||
    ![1, 2].includes(format.channels) ||
    ![8000, 16000, 22050, 24000, 32000, 44100, 48000].includes(
      format.sampleRate,
    ) ||
    format.blockAlign !== format.channels * 2 ||
    format.byteRate !== format.sampleRate * format.blockAlign ||
    pcm.length % format.blockAlign
  )
    err(
      "AUDIO_FORMAT",
      "音频格式不受支持，请在页面重新上传并自动转换为 PCM WAV",
      422,
    );
  return {
    ...format,
    pcm,
    durationMs: Math.round((pcm.length / format.byteRate) * 1000),
  };
}

export function makeWav(pcm: Buffer, sampleRate = 16000, channels = 1) {
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(pcm.length + 36, 4);
  header.write("WAVEfmt ", 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * channels * 2, 28);
  header.writeUInt16LE(channels * 2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

export function splitWav(data: Buffer) {
  const wav = readWav(data);
  if (wav.durationMs > 1200000)
    err("AUDIO_TOO_LONG", "单次录音最长20分钟，请拆分后上传", 422);
  // DeepSeek only reads the left channel. Normalize explicitly to mono first.
  const pcm = wav.channels === 1 ? wav.pcm : Buffer.alloc(wav.pcm.length / 2);
  if (wav.channels === 2)
    for (let i = 0; i < pcm.length; i += 2)
      wav.pcm.copy(pcm, i, i * 2, i * 2 + 2);
  const step = wav.sampleRate * 2 * 110;
  const parts: { bytes: Buffer; startMs: number; endMs: number }[] = [];
  for (let offset = 0; offset < pcm.length; offset += step) {
    const end = Math.min(offset + step, pcm.length);
    parts.push({
      bytes: makeWav(pcm.subarray(offset, end), wav.sampleRate),
      startMs: Math.round((offset / (wav.sampleRate * 2)) * 1000),
      endMs: Math.round((end / (wav.sampleRate * 2)) * 1000),
    });
  }
  if (parts.some((p) => p.bytes.length > 8 * 1024 * 1024))
    err("AUDIO_TOO_LARGE", "音频分段超过接口限制，请降低采样率", 422);
  return { parts, durationMs: wav.durationMs };
}
