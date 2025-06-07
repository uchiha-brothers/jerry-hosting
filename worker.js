const MASTER_BOT_TOKEN = "7470975644:AAFHIIItLD6BnXnNZ2Co07Ge2ShPCKS1Mls";
const MASTER_BOT_USERNAME = "ppobot";
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
      await sendMessage(botToken, chatId, `👋 <b>Welcome!</b>\n\nSend an Instagram Reel link and I'll fetch the video.\nUse /reel <url> or just paste the URL.`, "HTML");
      return new Response("Start");
    }

    if (text.startsWith("/reel") || text.includes("instagram.com")) {
      const fileUrl = text.startsWith("/reel") ? text.split(" ").slice(1).join(" ") : text;

      if (!fileUrl.startsWith("http")) {
        await sendMessage(botToken, chatId, "❌ Invalid Instagram URL.");
        return new Response("Invalid URL");
      }

      const statusMsg = await sendMessage(botToken, chatId, "📥 Downloading Instagram reel...");
      const msgId = statusMsg.result?.message_id;

      try {
        const res = await fetch(TERA_API + encodeURIComponent(fileUrl));
        const json = await res.json();
        const videoUrl = json.download_url;
        const name = json.name || "Instagram_Reel";

        if (!videoUrl) {
          await sendMessage(botToken, chatId, "❌ Failed to fetch the video.");
          return new Response("No video");
        }

        // Upload to gofile.io
        const uploadRes = await fetch("https://api.gofile.io/getServer").then(r => r.json());
        const server = uploadRes.data.server;

        const fileBlob = await fetch(videoUrl).then(r => r.blob());

        const form = new FormData();
        form.append("file", fileBlob, `${name}.mp4`);

        const gofileResp = await fetch(`https://${server}.gofile.io/uploadFile`, {
          method: "POST",
          body: form,
        }).then(r => r.json());

        const directLink = gofileResp.data.downloadPage;

        // Send download link as fallback and attempt to send video
        const sendResult = await sendVideo(botToken, chatId, gofileResp.data.downloadPage);
        if (!sendResult.ok) {
          await sendMessage(botToken, chatId, `🎬 ${name}\n🔗 <a href="${directLink}">Download Video</a>`, "HTML");
        }

        if (msgId) await deleteMessage(botToken, chatId, msgId);
        return new Response("Done");
      } catch (err) {
        console.error(err);
        await sendMessage(botToken, chatId, "❌ Error processing the reel.");
        return new Response("Error");
      }
    }

    return new Response("Ignored");
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
  return await fetch(`https://api.telegram.org/bot${botToken}/deleteMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, message_id: messageId }),
  });
}
