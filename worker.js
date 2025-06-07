const MASTER_BOT_TOKEN = "7470975644:AAFHIIItLD6BnXnNZ2Co07Ge2ShPCKS1Mls";
const MASTER_BOT_USERNAME = "phprobot";
const TERA_API = "https://teraboxvideodl.pages.dev/api/?url=";
const MASTER_ADMIN_ID = "7485643534";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method !== "POST") return new Response("Only POST allowed");

    const update = await request.json();
    const message = update.message || update.edited_message;
    const text = message?.text || "";
    const chatId = message?.chat?.id;

    if (!chatId || !text) return new Response("No message");

    const botToken = url.searchParams.get("token") || MASTER_BOT_TOKEN;
    const isMaster = botToken === MASTER_BOT_TOKEN;
    const isAdmin = String(chatId) === MASTER_ADMIN_ID;

    if (await env.DISABLE_BOTS_KV.get(botToken)) {
      return new Response("This bot is disabled.");
    }

    await env.USER_KV.put(`user-${chatId}`, "1");

    // ... (unchanged admin commands and /start, /help, /id, etc.)

    // TeraBox or /reel handler
    const isTeraUrl = text.includes("https://") || text.startsWith("/reel");
    if (!isTeraUrl) return new Response("Ignored");

    let fileUrl = text;
    if (text.startsWith("/reel")) {
      fileUrl = text.split(" ").slice(1).join(" ").trim();
    }

    if (!fileUrl.startsWith("http")) {
      await sendMessage(botToken, chatId, "❌ Invalid Instagram URL.");
      return new Response("Invalid URL");
    }

    const statusMsg = await sendMessage(botToken, chatId, "📥 Downloading Instagram reel...");
    const msgId = statusMsg.result?.message_id;

    try {
      const json = await fetch(TERA_API + encodeURIComponent(fileUrl)).then(r => r.json());
      const videoUrl = json.download_url;
      const name = json.name;
      const sizeBytes = parseInt(json.size || "0");
      const sizeMB = (sizeBytes / 1024 / 1024).toFixed(2);

      if (!videoUrl) {
        await sendMessage(botToken, chatId, "❌ Failed to fetch the video.");
        return new Response("No video");
      }

      const blob = await fetch(videoUrl).then(res => res.blob());
      const form = new FormData();
      form.append("file", blob, name || "video.mp4");

      const uploadRes = await fetch("https://file.io/?expires=1d", {
        method: "POST",
        body: form
      }).then(r => r.json());

      if (uploadRes.success) {
        const fileioUrl = uploadRes.link;
        await sendMessage(botToken, chatId, `🎬 <b>${name}</b>\n📦 Size: ${sizeMB} MB\n\n🔗 <a href="${fileioUrl}">Click here to download</a>`, "HTML");
      } else {
        await sendMessage(botToken, chatId, `❌ Failed to upload to file.io.`);
      }
    } catch (err) {
      await sendMessage(botToken, chatId, "❌ Error downloading the reel.");
      console.error(err);
    }

    if (msgId) await deleteMessage(botToken, chatId, msgId);
    return new Response("OK");
  }
};

async function sendMessage(botToken, chatId, text, parse_mode = "HTML") {
  return await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode })
  }).then(r => r.json());
}

async function sendVideo(botToken, chatId, videoUrl) {
  return await fetch(`https://api.telegram.org/bot${botToken}/sendVideo`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      video: videoUrl,
      caption: "🎬 Here's your Instagram reel!"
    })
  }).then(r => r.json());
}

async function deleteMessage(botToken, chatId, messageId) {
  await fetch(`https://api.telegram.org/bot${botToken}/deleteMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, messa
