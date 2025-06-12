const MASTER_BOT_TOKEN = "7470975644:AAFHIIItLD6BnXnNZ2Co07Ge2ShPCKS1Mls";
const MASTER_BOT_USERNAME = "hostingphprobot";
const TERA_API = "https://teraboxvideodl.pages.dev/api/?url=";
const MASTER_ADMIN_ID = "7485643534";

export default {
  async fetch(request, env) {
    if (request.method !== "POST") return new Response("Only POST allowed");
    const url = new URL(request.url);
    const update = await request.json();
    const message = update.message || update.edited_message;
    const text = message?.text?.trim() || "";
    const chatId = message?.chat?.id;

    if (!chatId || !text) return new Response("No message");

    const botToken = url.searchParams.get("token") || MASTER_BOT_TOKEN;
    const isMaster = botToken === MASTER_BOT_TOKEN;
    const isAdmin = String(chatId) === MASTER_ADMIN_ID;

    // Prevent disabled bots from working
    if (await env.DISABLE_BOTS_KV.get(botToken)) return new Response("Bot disabled");

    // Register user
    env.USER_KV.put(`user-${chatId}`, "1").catch(() => {});

    // ========== ADMIN COMMANDS ========== //
    if (isMaster && text.startsWith("/deletebot")) {
      const tokenToDelete = text.split(" ")[1]?.trim();
      if (!tokenToDelete) return sendMessage(botToken, chatId, "❌ Please provide a bot token to delete.");

      if (tokenToDelete === MASTER_BOT_TOKEN)
        return sendMessage(botToken, chatId, "❌ You cannot disable the master bot.");

      const deployed = await env.DEPLOYE_BOTS_KV.get(tokenToDelete);
      if (!deployed) return sendMessage(botToken, chatId, "❌ Bot token not found or not deployed.");

      const res = await fetch(`https://api.telegram.org/bot${tokenToDelete}/deleteWebhook`, { method: "POST" }).then(r => r.json());
      if (res.ok) {
        await env.DISABLE_BOTS_KV.put(tokenToDelete, "1");
        await env.DEPLOYE_BOTS_KV.delete(tokenToDelete);
        return sendMessage(botToken, chatId, `🗑️ Bot <code>${tokenToDelete}</code> disabled.`, "HTML");
      } else {
        return sendMessage(botToken, chatId, `❌ Failed to delete webhook:\n${res.description}`);
      }
    }

    if (isMaster && text === "/stats") {
      const [users, bots, disabled] = await Promise.all([
        env.USER_KV.list(),
        env.DEPLOYE_BOTS_KV.list(),
        env.DISABLE_BOTS_KV.list(),
      ]);

      return sendMessage(botToken, chatId,
        `<b>📊 Stats:</b>\n• Users: <code>${users.keys.length}</code>\n• Bots: <code>${bots.keys.length + disabled.keys.length}</code>\n• Active: <code>${bots.keys.length}</code>\n• Disabled: <code>${disabled.keys.length}</code>`, "HTML"
      );
    }

    if (isMaster && isAdmin && text === "/botlist") {
      const all = await env.DEPLOYE_BOTS_KV.list();
      const grouped = {};

      const fetchBots = all.keys.map(async key => {
        const val = await env.DEPLOYE_BOTS_KV.get(key.name);
        if (!val?.startsWith("creator:")) return;

        const creatorId = val.split(":")[1];
        if (!grouped[creatorId]) grouped[creatorId] = [];

        const info = await fetch(`https://api.telegram.org/bot${key.name}/getMe`).then(r => r.json()).catch(() => null);
        grouped[creatorId].push({ username: info?.ok ? info.result.username : "(unknown)", token: key.name });
      });
      await Promise.all(fetchBots);

      let output = "<b>🤖 All Deployed Bots:</b>\n\n";
      for (const creator in grouped) {
        const info = await fetch(`https://api.telegram.org/bot${MASTER_BOT_TOKEN}/getChat?chat_id=${creator}`).then(r => r.json()).catch(() => null);
        const userTag = info?.ok ? `@${info.result.username || "(no username)"}` : "(unknown user)";
        output += `${creator} (${userTag}):\n`;
        for (const bot of grouped[creator]) {
          output += `• @${bot.username}\n<code>${bot.token}</code>\n`;
        }
        output += "\n";
      }
      return sendMessage(botToken, chatId, output.trim(), "HTML");
    }

    if (isMaster && text.startsWith("/newbot")) {
      const newToken = text.split(" ")[1]?.trim();
      if (!newToken?.match(/^\d+:[\w-]{30,}$/))
        return sendMessage(botToken, chatId, "❌ Invalid bot token.");

      const loading = await sendMessage(botToken, chatId, "🛠️ Cloning bot...");
      const webhookUrl = `https://${url.hostname}/?token=${newToken}`;
      const setWebhook = await fetch(`https://api.telegram.org/bot${newToken}/setWebhook?url=${webhookUrl}`).then(r => r.json());

      if (loading?.result?.message_id) deleteMessage(botToken, chatId, loading.result.message_id).catch(() => {});

      if (setWebhook.ok) {
        await env.DEPLOYE_BOTS_KV.put(newToken, `creator:${chatId}`);
        await env.DISABLE_BOTS_KV.delete(newToken);

        const info = await fetch(`https://api.telegram.org/bot${newToken}/getMe`).then(r => r.json());
        return sendMessage(botToken, chatId,
          `✅ <b>New bot deployed!</b>\n\n@${info?.result?.username || "(username not found)"}\n\n🔐 <b>Bot Token:</b>\n<code>${newToken}</code>`, "HTML"
        );
      } else {
        return sendMessage(botToken, chatId, `❌ Webhook failed.\n${setWebhook.description}`);
      }
    }

    if (isMaster && text === "/mybots") {
      const all = await env.DEPLOYE_BOTS_KV.list();
      const bots = all.keys.filter(k => k.name).map(async k => {
        const val = await env.DEPLOYE_BOTS_KV.get(k.name);
        if (val === `creator:${chatId}`) {
          const info = await fetch(`https://api.telegram.org/bot${k.name}/getMe`).then(r => r.json()).catch(() => null);
          return `• @${info?.result?.username || "unknown"}\n<code>${k.name}</code>`;
        }
      });
      const results = (await Promise.all(bots)).filter(Boolean);

      return sendMessage(botToken, chatId,
        results.length ? `<b>🤖 Your Bots:</b>\n\n${results.join("\n\n")}` : "🤖 You haven't deployed any bots yet.", "HTML"
      );
    }

    if (text === "/start") {
      return sendMessage(botToken, chatId,
        `👋 <b>Welcome!</b>\n\nSend a Terabox link or use <code>/reel &lt;url&gt;</code>\n\n🚀 Powered by <a href="https://t.me/${MASTER_BOT_USERNAME}">@${MASTER_BOT_USERNAME}</a>`, "HTML");
    }

    if (text === "/help") {
      return sendMessage(botToken, chatId,
        `❓ <b>How to use:</b>\n\n• Send a Terabox link\n• Or use <code>/reel &lt;url&gt;</code>\n• Bot replies with download link\n\n🔧 Help: <a href="https://t.me/${MASTER_BOT_USERNAME}">@${MASTER_BOT_USERNAME}</a>`, "HTML");
    }

    if (text === "/id") {
      return sendMessage(botToken, chatId, `🆔 <b>Your Chat ID:</b> <code>${chatId}</code>`, "HTML");
    }

    // ========== TERA LINK HANDLER ========== //
    const isTeraUrl = text.includes("https://") || text.startsWith("/reel");
    if (!isTeraUrl) return new Response("Not Tera URL");

    let fileUrl = text.startsWith("/reel") ? text.split(" ").slice(1).join(" ").trim() : text;
    if (!fileUrl.startsWith("http")) return sendMessage(botToken, chatId, "❌ Invalid URL");

    const statusMsg = await sendMessage(botToken, chatId, "📥 Downloading...");
    const msgId = statusMsg?.result?.message_id;

    try {
      const json = await fetch(TERA_API + encodeURIComponent(fileUrl)).then(r => r.json());
      if (!json?.download_url) return sendMessage(botToken, chatId, "❌ Failed to fetch video.");

      const caption = `🎬 <b>${json.name || "Video"}</b>\n📦 Size: ${(parseInt(json.size || 0) / 1048576).toFixed(2)} MB\n\n🔗 <a href="${json.download_url}">Click to Download</a>\n⚠️ <i>This link expires after one use.</i>`;
      await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: caption,
          parse_mode: "HTML",
          reply_markup: {
            inline_keyboard: [
              [{ text: "▶️ Play Server 1", url: `https://www.teraboxfast.com/p/playserver2.html?q=${encodeURIComponent(fileUrl)}` }],
              [{ text: "🎬 Full-Screen", url: `https://jerrystream.vercel.app/?video=${json.download_url}` }],
              [{ text: "📥 Download", url: json.download_url }]
            ]
          }
        })
      });
    } catch (err) {
      console.error("Error fetching TeraBox:", err);
      await sendMessage(botToken, chatId, "❌ Error fetching video.");
    }

    if (msgId) deleteMessage(botToken, chatId, msgId).catch(() => {});
    return new Response("OK");
  }
};

// Utility functions
async function sendMessage(token, chatId, text, mode = "HTML") {
  return await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: mode }),
  }).then(r => r.json()).catch(() => null);
}

async function deleteMessage(token, chatId, msgId) {
  await fetch(`https://api.telegram.org/bot${token}/deleteMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, message_id: msgId }),
  }).catch(() => {});
}
