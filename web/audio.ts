// Normalize locally so LAN clients need neither FFmpeg nor a local AI runtime.
export async function normalizeRecording(file: Blob, filename = "录音.wav") {
  if (file.size > 50 * 1024 * 1024)
    throw new Error("录音文件最多50MB，请先裁剪或压缩");
  if (typeof OfflineAudioContext === "undefined")
    throw new Error("此浏览器不支持音频转换，请使用新版Chrome、Edge或Safari");
  const decoder = new OfflineAudioContext(1, 1, 16000);
  let source: AudioBuffer;
  try {
    source = await decoder.decodeAudioData(await file.arrayBuffer());
  } catch {
    throw new Error("浏览器无法读取此录音，请换用MP3、M4A或PCM WAV");
  }
  if (!source.duration || source.duration > 1200)
    throw new Error("录音最长20分钟，请先拆分");
  const ctx = new OfflineAudioContext(
    1,
    Math.ceil(source.duration * 16000),
    16000,
  );
  const node = ctx.createBufferSource();
  node.buffer = source;
  node.connect(ctx.destination);
  node.start();
  const audio = await ctx.startRendering(),
    samples = audio.getChannelData(0);
  const bytes = new ArrayBuffer(44 + samples.length * 2),
    view = new DataView(bytes);
  const string = (offset: number, value: string) =>
    [...value].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)));
  string(0, "RIFF");
  view.setUint32(4, bytes.byteLength - 8, true);
  string(8, "WAVEfmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, 16000, true);
  view.setUint32(28, 32000, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  string(36, "data");
  view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const sample = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(
      44 + i * 2,
      Math.round(sample * (sample < 0 ? 32768 : 32767)),
      true,
    );
  }
  return new File([bytes], filename.replace(/\.[^.]+$/, "") + ".wav", {
    type: "audio/wav",
  });
}
