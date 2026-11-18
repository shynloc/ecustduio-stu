export function uid() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const v = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${v.slice(0, 8)}-${v.slice(8, 12)}-${v.slice(12, 16)}-${v.slice(16, 20)}-${v.slice(20)}`;
}
export async function copyText(text: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const node = document.createElement("textarea");
  node.value = text;
  node.style.position = "fixed";
  node.style.opacity = "0";
  document.body.append(node);
  node.select();
  const success = document.execCommand("copy");
  node.remove();
  if (!success) throw new Error("浏览器不支持自动复制，请选择内容手动复制");
}

// Use the rendered, frozen article for both clipboard formats. The text flavor
// must include the whole article, even when pasted into a plain text editor.
export async function copyRichHtml(source: string): Promise<"rich" | "text"> {
  const doc = new DOMParser().parseFromString(source, "text/html");
  doc.querySelectorAll("script,style,iframe,object,embed").forEach(n => n.remove());
  const html = doc.body.innerHTML, plain = doc.body.cloneNode(true) as HTMLElement;
  plain.querySelectorAll("br").forEach(n => n.replaceWith("\n"));
  plain.querySelectorAll("p,h1,h2,h3,h4,h5,h6,li,tr,blockquote,section,div").forEach(n => n.append("\n"));
  plain.querySelectorAll("td,th").forEach(n => n.append("\t"));
  const text = (plain.textContent || "").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  if (navigator.clipboard?.write && typeof ClipboardItem !== "undefined") {
    try {
      await navigator.clipboard.write([new ClipboardItem({
        "text/html": new Blob([html], {type: "text/html"}),
        "text/plain": new Blob([text], {type: "text/plain"}),
      })]);
      return "rich";
    } catch { /* LAN HTTP and some browser permissions need the copy-event path. */ }
  }
  const node = document.createElement("div"), focus = document.activeElement as HTMLElement | null;
  const selection = window.getSelection(), ranges: Range[] = [];
  if (selection) for (let i = 0; i < selection.rangeCount; i++) ranges.push(selection.getRangeAt(i).cloneRange());
  node.contentEditable = "true";
  node.setAttribute("aria-hidden", "true");
  node.style.cssText = "position:fixed;top:0;left:0;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none";
  node.innerHTML = html;
  const onCopy = (event: ClipboardEvent) => {
    if (!event.clipboardData) return;
    event.clipboardData.setData("text/html", html);
    event.clipboardData.setData("text/plain", text);
    event.preventDefault();
  };
  let copied = false;
  try {
    document.body.append(node);
    node.focus({preventScroll:true});
    const range = document.createRange(); range.selectNodeContents(node);
    selection?.removeAllRanges(); selection?.addRange(range);
    document.addEventListener("copy", onCopy);
    copied = document.execCommand("copy");
  } catch { /* Last fallback retains the complete readable body. */ }
  finally {
    document.removeEventListener("copy", onCopy);
    node.remove();
    focus?.focus({preventScroll:true});
    selection?.removeAllRanges();
    for (const range of ranges) selection?.addRange(range);
  }
  if (copied) return "rich";
  await copyText(text);
  return "text";
}
