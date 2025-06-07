const TELEGRAM_TOKEN = "7470975644:AAFHIIItLD6BnXnNZ2Co07Ge2ShPCKS1Mls";
const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_TOKEN}`;
const GOFILE_TOKEN = "JWxxgPZt3Twt5OQGgAv7OQSY6I0a1VSP"; // your Gofile API token

// Terabox API URL (replace with your actual Terabox video URL)
const TERABOX_API_BASE = "https://teraboxvideodl.pages.dev/api/?url=";

async function telegramApi(method, params, isMultipart = false) {
  const url = `${TELEGRAM_API}/${method}`;
  let options;

  if (isMultipart) {
    options = { method: "POST", body: params };
  } else {
    options = {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    };
  }

  const res = await fetch(url, options);
  return res.json();
}

async function handleMessage(message) {
  const chatId = message.chat.id;
  const text = message.text || "";

  if (!text) {
    return telegramApi("sendMessage", {
      chat_id: chatId,
      text: "Please send a Terabox video URL or command.",
    });
  }

  // Check if message contains Terabox URL
  if (!text.includes("terabox")) {
    return telegramApi("sendMessage", {
      chat_id: chatId,
      text: "Please send a valid Terabox video URL.",
    });
  }

  // Step 1: Call Terabox API with user URL
  let teraboxDownloadUrl;
  let videoName = "video.mp4";
  try {
    const teraboxApiUrl = TERABOX_API_BASE + encodeURIComponent(text.trim());
    const teraboxResp = await fetch(teraboxApiUrl);
    if (!teraboxResp.ok) throw new Error("Failed to fetch Terabox API");
    const teraboxJson = await teraboxResp.json();

    // Check if download_url is present
    if (!teraboxJson || !teraboxJson.download_url) {
      throw new Error("Terabox API did not returnu a download URL");
    }
    teraboxDownloadUrl = teraboxJson.download_url;
    videoName = teraboxJson.name || "video.mp4";
  } catch (err) {
    return telegramApi("sendMessage", {
      chat_id: chatId,
      text: `Error getting Terabox video URL: ${err.message}`,
    });
  }

  // Step 2: Download video from Terabox URL
  let videoArrayBuffer;
  try {
    const videoResp = await fetch(teraboxDownloadUrl);
    if (!videoResp.ok) throw new Error("Failed to download video from Terabox URL");
    videoArrayBuffer = await videoResp.arrayBuffer();
  } catch (err) {
    return telegramApi("sendMessage", {
      chat_id: chatId,
      text: `Error downloading video: ${err.message}`,
    });
  }

  // Step 3: Upload video to Gofile.io
  let gofileUploadResult;
  try {
    const formData = new FormData();
    const fileBlob = new Blob([videoArrayBuffer]);
    formData.append("file", fileBlob, videoName);

    const uploadResp = await fetch("https://upload.gofile.io/uploadFile", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GOFILE_TOKEN}`,
      },
      body: formData,
    });

    if (!uploadResp.ok) throw new Error("Upload to Gofile failed");

    gofileUploadResult = await uploadResp.json();

    if (gofileUploadResult.status !== "ok") {
      throw new Error("Gofile API error: " + (gofileUploadResult.data?.message || "Unknown error"));
    }
  } catch (err) {
    return telegramApi("sendMessage", {
      chat_id: chatId,
      text: `Error uploading video to Gofile: ${err.message}`,
    });
  }

  // Step 4: Send Gofile link to user
  try {
    const downloadPage = gofileUploadResult.data.downloadPage;
    const directLink = gofileUploadResult.data.downloadUrl;
    const messageText = `🎉 Video uploaded successfully!\n\nDownload page: ${downloadPage}\nDirect link: ${directLink}`;

    return telegramApi("sendMessage", {
      chat_id: chatId,
      text: messageText,
      disable_web_page_preview: false,
    });
  } catch (err) {
    return telegramApi("sendMessage", {
      chat_id: chatId,
      text: `Error sending result: ${err.message}`,
    });
  }
}

export default {
  async fetch(request, env, ctx) {
    if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

    let update;
    try {
      update = await request.json();
    } catch {
      return new Response("Bad Request", { status: 400 });
    }

    if (!update.message) return new Response("No message", { status: 200 });

    const result = await handleMessage(update.message);

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  },
};
