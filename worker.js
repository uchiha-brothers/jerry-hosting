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

    if (text === "/start") {
      await sendMessage(botToken, chatId, `👋 <b>Welcome!</b>\n\n🤖 This bot allows you to download Instagram Reels easily by sending the link.\n\n📥 Just send a <i>reel URL</i> or use the <code>/reel &lt;url&gt;</code> command.\n\n🚀 Powered by <a href=\"https://t.me/${MASTER_BOT_USERNAME}\">@${MASTER_BOT_USERNAME}</a>`, "HTML");
      return new Response("Start handled");
    }

    if (text === "/help") {
      await sendMessage(botToken, chatId, `❓ <b>How to use this bot:</b>\n\n• Send any <i>Instagram reel URL</i>\n• Or use <code>/reel &lt;url&gt;</code>\n• The bot will fetch and send you the video\n\n🔧 For support or updates, visit <a href=\"https://t.me/${MASTER_BOT_USERNAME}\">@${MASTER_BOT_USERNAME}</a>`, "HTML");
      return new Response("Help shown");
    }

    if (text === "/id") {
      await sendMessage(botToken, chatId, `🆔 <b>Your Chat ID:</b> <code>${chatId}</code>`, "HTML");
      return new Response("ID shown");
    }

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

      const gofileUpload = await uploadToGofile(videoUrl, name);
      if (gofileUpload.status !== "ok") {
        await sendMessage(botToken, chatId, "❌ Failed to upload the video to Gofile.io.");
        return new Response("Gofile upload failed");
      }

      const directLink = gofileUpload.data.downloadPage;

      await sendMessage(botToken, chatId,
        `🎬 <b>${name}</b>\n📦 Size: ${sizeMB} MB\n\n🔗 <a href=\"${directLink}\">Click here to download</a>`,
        "HTML"
      );
    } catch (err) {
      await sendMessage(botToken, chatId, "❌ Error processing the reel.");
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

async function deleteMessage(botToken, chatId, messageId) {
  await fetch(`https://api.telegram.org/bot${botToken}/deleteMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, message_id: messageId })
  });
}

async function uploadToGofile(videoUrl, filename) {
  const serverRes = await fetch("https://api.gofile.io/getServer").then(r => r.json());
  const server = serverRes.data.server;
  const videoBlob = await fetch(videoUrl).then(r => r.blob());

  const formData = new FormData();
  formData.append("file", videoBlob, filename);

  const uploadRes = await fetch(`https://${server}.gofile.io/uploadFile`, {
    method: "POST",
    body: formData
  }).then(r => r.json());

  return uploadRes;
}
