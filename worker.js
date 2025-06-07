const MASTER_BOT_TOKEN = "8139678579:AAEc338z-0Gt45ZPsf35DJSCbaKm8JLvju4";
const MASTER_BOT_USERNAME = "hostingphprobot";
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

    if (await env.DISABLED_BOTS_KV.get(botToken)) {
      return new Response("This bot is disabled.");
    }

    await env.USERS_KV.put(`user-${chatId}`, "1");

    // admin & deployment commands
    // [kept unchanged — skipping for brevity]

    // /start
    if (text === "/start") {
      await sendMessage(botToken, chatId, `👋 <b>Welcome!</b>\n\n🤖 This bot allows you to download TeraBox videos easily by sending the link.\n\n📥 Just send a <i>TeraBox file URL</i> or use the <code>/reel &lt;url&gt;</code> command.\n\n🚀 Powered by <a href="https://t.me/${MASTER_BOT_USERNAME}">@${MASTER_BOT_USERNAME}</a>`, "HTML");
      return new Response("Start handled");
    }

    // /help
    if (text === "/help") {
      await sendMessage(botToken, chatId, `❓ <b>How to use this bot:</b>\n\n• Send any <i>TeraBox file URL</i>\n• Or use <code>/reel &lt;url&gt;</code>\n• The bot will fetch and send you the video\n\n🔧 For support or updates, visit <a href="https://t.me/${MASTER_BOT_USERNAME}">@${MASTER_BOT_USERNAME}</a>`, "HTML");
      return new Response("Help shown");
    }

    // /id
    if (text === "/id") {
      await sendMessage(botToken, chatId, `🆔 <b>Your Chat ID:</b> <code>${chatId}</code>`, "HTML");
      return new Response("ID shown");
    }

    // TeraBox handler (replacing instagram reel)
    const isTeraUrl = text.includes("terabox.com/s/") || text.startsWith("/reel");
    if (!isTeraUrl) return new Response("Ignored");

    let fileUrl = text;
    if (text.startsWith("/reel")) {
      fileUrl = text.split(" ").slice(1).join(" ").trim();
    }

    if (!fileUrl.startsWith("http")) {
      await sendMessage(botToken, chatId, "❌ Invalid TeraBox URL.");
      return new Response("Invalid URL");
    }

    const statusMsg = await sendMessage(botToken, chatId, "📥 Downloading TeraBox video...");
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

      await sendVideo(botToken, chatId, videoUrl);

      const caption =
        `🎬 <b>TER FILE DETAILS</b>\n\n` +
        `📝 <b>Name:</b> ${name}\n` +
        `📊 <b>Size:</b> ${sizeMB} MB\n` +
        `🟢 <b>Server:</b> 1 (Direct)\n` +
        `🎞️ <b>File Type:</b> Video File\n\n` +
        `<b>Playback Options:</b>\n` +
        `• Download for offline viewing\n` +
        `• Browser player with full-screen support\n` +
        `• Quick in-app player for convenience\n\n` +
        `✅ Powered by @JerryCoder`;

      await sendMessage(botToken, chatId, caption, "HTML");
    } catch (err) {
      await sendMessage(botToken, chatId, "❌ Error downloading the TeraBox file.");
      console.error(err);
    }

    if (msgId) await deleteMessage(botToken, chatId, msgId);
    return new Response("OK");
  }
};

// Utility functions (unchanged)
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
      caption: "🎬 Here's your TeraBox video!"
    })
  }).then(r => r.json());
}

async function deleteMessage(botToken, chatId, messageId) {
  await fetch(`https://api.telegram.org/bot${botToken}/deleteMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, message_id: messageId }),
  });
}
