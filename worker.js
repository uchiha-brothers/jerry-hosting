const MASTER_BOT_TOKEN = "7470975644:AAFHIIItLD6BnXnNZ2Co07Ge2ShPCKS1Mls";
const MASTER_BOT_USERNAME = "moonrobot";
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

    // Handle /deletebot
    if (isMaster && text.startsWith("/deletebot")) {
      const tokenToDelete = text.split(" ")[1]?.trim();
      if (!tokenToDelete) {
        await sendMessage(botToken, chatId, "❌ Please provide a bot token to delete.");
        return new Response("No token to delete");
      }
      if (tokenToDelete === MASTER_BOT_TOKEN) {
        await sendMessage(botToken, chatId, "❌ You cannot disable the master bot.");
        return new Response("Attempt to disable master bot");
      }

      const deployed = await env.DEPLOYE_BOTS_KV.get(tokenToDelete);
      if (!deployed) {
        await sendMessage(botToken, chatId, "❌ Bot token not found or not deployed.");
        return new Response("Unknown token");
      }

      const deleteRes = await fetch(`https://api.telegram.org/bot${tokenToDelete}/deleteWebhook`, { method: "POST" }).then(r => r.json());
      if (deleteRes.ok) {
        await env.DISABLE_BOTS_KV.put(tokenToDelete, "1");
        await env.DEPLOYE_BOTS_KV.delete(tokenToDelete);
        await sendMessage(botToken, chatId, `🗑️ Bot with token <code>${tokenToDelete}</code> has been disabled and webhook removed.`, "HTML");
      } else {
        await sendMessage(botToken, chatId, `❌ Failed to delete webhook:\n${deleteRes.description}`);
      }

      return new Response("Bot disabled");
    }

    // /stats
    if (isMaster && text === "/stats") {
      const listUsers = await env.USER_KV.list();
      const listBots = await env.DEPLOYE_BOTS_KV.list();
      const listDisabled = await env.DISABLE_BOTS_KV.list();

      const statsMsg =
        `<b>📊 Stats:</b>\n` +
        `• Total unique users: <code>${listUsers.keys.length}</code>\n` +
        `• Total bots deployed: <code>${listBots.keys.length + listDisabled.keys.length}</code>\n` +
        `• Active bots: <code>${listBots.keys.length}</code>\n` +
        `• Disabled bots: <code>${listDisabled.keys.length}</code>`;

      await sendMessage(botToken, chatId, statsMsg, "HTML");
      return new Response("Stats shown");
    }

    // /botlist
    if (isMaster && isAdmin && text === "/botlist") {
      const all = await env.DEPLOYE_BOTS_KV.list();
      const grouped = {};

      for (const key of all.keys) {
        const value = await env.DEPLOYE_BOTS_KV.get(key.name);
        if (!value?.startsWith("creator:")) continue;

        const creatorId = value.split(":")[1];
        if (!grouped[creatorId]) grouped[creatorId] = [];

        const botInfo = await fetch(`https://api.telegram.org/bot${key.name}/getMe`).then(r => r.json());
        const username = botInfo.ok ? botInfo.result.username : "(unknown)";
        grouped[creatorId].push({ username, token: key.name });
      }

      let output = "<b>🤖 All Deployed Bots:</b>\n\n";
      for (const creator in grouped) {
        const userInfo = await fetch(`https://api.telegram.org/bot${MASTER_BOT_TOKEN}/getChat?chat_id=${creator}`).then(r => r.json());
        const userTag = userInfo.ok ? `@${userInfo.result.username || "(no username)"}` : "(unknown user)";
        output += `${creator} (${userTag}):\n\n`;
        for (const bot of grouped[creator]) {
          output += `• @${bot.username}\n<code>${bot.token}</code>\n\n`;
        }
      }

      await sendMessage(botToken, chatId, output.trim(), "HTML");
      return new Response("Bot list shown");
    }

    // /newbot
    if (isMaster && text.startsWith("/newbot")) {
      const newToken = text.split(" ")[1]?.trim();
      if (!newToken || !newToken.match(/^\d+:[\w-]{30,}$/)) {
        await sendMessage(botToken, chatId, "❌ Invalid bot token.");
        return new Response("Invalid token");
      }

      const cloningMsg = await sendMessage(botToken, chatId, "🛠️ Cloning bot...");
      const cloningMsgId = cloningMsg.result?.message_id;

      const webhookUrl = `https://${url.hostname}/?token=${newToken}`;
      const setWebhook = await fetch(`https://api.telegram.org/bot${newToken}/setWebhook?url=${webhookUrl}`).then(r => r.json());

      if (setWebhook.ok) {
        await env.DEPLOYE_BOTS_KV.put(newToken, `creator:${chatId}`);
        await env.DISABLE_BOTS_KV.delete(newToken);

        const botInfo = await fetch(`https://api.telegram.org/bot${newToken}/getMe`).then(r => r.json());
        const newBotUsername = botInfo.ok ? botInfo.result.username : null;

        if (cloningMsgId) {
          await deleteMessage(botToken, chatId, cloningMsgId);
        }

        const replyMessage =
          `✅ <b>New bot deployed!</b>\n\n` +
          `All features cloned! Here is bot ${newBotUsername ? `(@${newBotUsername})` : "(username not found)"}\n\n` +
          `🔐 <b>Bot Token:</b>\n<code>${newToken}</code>`;

        await sendMessage(botToken, chatId, replyMessage, "HTML");
      } else {
        if (cloningMsgId) await deleteMessage(botToken, chatId, cloningMsgId);
        await sendMessage(botToken, chatId, `❌ Failed to set webhook.\n${setWebhook.description}`);
      }

      return new Response("Cloning done");
    }

    // /mybots
    if (isMaster && text === "/mybots") {
      const allBots = await env.DEPLOYE_BOTS_KV.list();
      const myBots = [];

      for (const entry of allBots.keys) {
        const val = await env.DEPLOYE_BOTS_KV.get(entry.name);
        if (val === `creator:${chatId}`) {
          const botInfo = await fetch(`https://api.telegram.org/bot${entry.name}/getMe`).then(r => r.json());
          const username = botInfo.ok ? botInfo.result.username : null;
          myBots.push(`• ${username ? `@${username}` : "(unknown username)"}\n<code>${entry.name}</code>`);
        }
      }

      if (myBots.length === 0) {
        await sendMessage(botToken, chatId, "🤖 You haven't deployed any bots yet.");
      } else {
        const msg = `<b>🤖 Your Bots:</b>\n\n` + myBots.join("\n\n");
        await sendMessage(botToken, chatId, msg, "HTML");
      }

      return new Response("Mybots listed");
    }

    // /start
    if (text === "/start") {
      await sendMessage(botToken, chatId, `👋 <b>Welcome!</b>\n\n🤖 This bot allows you to download Instagram Reels easily by sending the link.\n\n📥 Just send a <i>reel URL</i> or use the <code>/reel &lt;url&gt;</code> command.\n\n🚀 Powered by <a href="https://t.me/${MASTER_BOT_USERNAME}">@${MASTER_BOT_USERNAME}</a>`, "HTML");
      return new Response("Start handled");
    }

    // /help
    if (text === "/help") {
      await sendMessage(botToken, chatId, `❓ <b>How to use this bot:</b>\n\n• Send any <i>Instagram reel URL</i>\n• Or use <code>/reel &lt;url&gt;</code>\n• The bot will fetch and send you the video\n\n🔧 For support or updates, visit <a href="https://t.me/${MASTER_BOT_USERNAME}">@${MASTER_BOT_USERNAME}</a>`, "HTML");
      return new Response("Help shown");
    }

    // /id
    if (text === "/id") {
      await sendMessage(botToken, chatId, `🆔 <b>Your Chat ID:</b> <code>${chatId}</code>`, "HTML");
      return new Response("ID shown");
    }

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
      // Fetch info from TeraBox API
      const json = await fetch(TERA_API + encodeURIComponent(fileUrl)).then(r => r.json());
      const videoUrl = json.download_url;
      const name = json.name || "video.mp4";
      const sizeBytes = parseInt(json.size || "0");
      const sizeMB = (sizeBytes / 1024 / 1024).toFixed(2);

      if (!videoUrl) {
        await sendMessage(botToken, chatId, "❌ Failed to fetch the video.");
        if (msgId) await deleteMessage(botToken, chatId, msgId);
        return new Response("No video");
      }

      // Download the video file as arrayBuffer
      const videoResponse = await fetch(videoUrl);
      if (!videoResponse.ok) throw new Error("Failed to download video file");
      const videoBuffer = await videoResponse.arrayBuffer();

      // Upload to gofile.io
      const gofileLink = await uploadToGofile(videoBuffer, name);

      // Try sending video from gofile.io direct link
      const sendResult = await sendVideo(botToken, chatId, gofileLink);

      if (!sendResult.ok) {
        // fallback: send link message if sending video fails
        await sendMessage(botToken, chatId,
          `🎬 <b>${name}</b>\n📦 Size: ${sizeMB} MB\n\n🔗 <a href="${gofileLink}">Download your video here</a>`,
          "HTML"
        );
      }

    } catch (err) {
      await sendMessage(botToken, chatId, "❌ Error downloading or uploading the reel.");
      console.error("Error:", err);
    }

    if (msgId) await deleteMessage(botToken, chatId, msgId);
    return new Response("OK");
  }
};

// Upload video buffer to gofile.io
async function uploadToGofile(fileBuffer, fileName) {
  // Get server URL for upload
  const serverRes = await fetch("https://api.gofile.io/getServer").then(r => r.json());
  if (!serverRes.status || !serverRes.data.server) throw new Error("Failed to get gofile server");

  const uploadUrl = `https://${serverRes.data.server}.gofile.io/uploadFile`;

  // Prepare FormData
  const formData = new FormData();
  formData.append("file", new Blob([fileBuffer]), fileName);

  // Upload file
  const uploadRes = await fetch(uploadUrl, {
    method: "POST",
    body: formData
  }).then(r => r.json());

  if (uploadRes.status !== "ok") throw new Error("Gofile upload failed: " + uploadRes.message);

  return uploadRes.data.downloadPage; // link to download page
}

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
    body: JSON.stringify({ chat_id: chatId, message_id: messageId }),
  });
}
