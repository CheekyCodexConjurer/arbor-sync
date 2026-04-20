export class TelegramClient {
  constructor(config) {
    this.apiBaseUrl = `https://api.telegram.org/bot${config.telegramBotToken}`;
    this.fileBaseUrl = `https://api.telegram.org/file/bot${config.telegramBotToken}`;
  }

  async request(method, body = {}) {
    const response = await fetch(`${this.apiBaseUrl}/${method}`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify(body)
    });

    const payload = await response.json();
    if (!payload.ok) {
      const error = new Error(payload.description || `Telegram API error on ${method}`);
      error.payload = payload;
      throw error;
    }

    return payload.result;
  }

  async getUpdates(offset = 0, timeout = 30) {
    return this.request("getUpdates", {
      offset,
      timeout,
      allowed_updates: ["message", "callback_query"]
    });
  }

  async sendMessage(chatId, text, extra = {}) {
    return this.request("sendMessage", {
      chat_id: chatId,
      text,
      ...extra
    });
  }

  async editMessage(chatId, messageId, text, extra = {}) {
    try {
      return await this.request("editMessageText", {
        chat_id: chatId,
        message_id: messageId,
        text,
        ...extra
      });
    } catch (error) {
      if (String(error.message).includes("message is not modified")) {
        return null;
      }

      throw error;
    }
  }

  async answerCallbackQuery(callbackQueryId, text = "") {
    try {
      return await this.request("answerCallbackQuery", {
        callback_query_id: callbackQueryId,
        text: text || undefined
      });
    } catch (error) {
      const message = String(error?.message || "");
      if (
        message.includes("query is too old")
        || message.includes("query ID is invalid")
      ) {
        return null;
      }

      throw error;
    }
  }

  async getFile(fileId) {
    return this.request("getFile", {
      file_id: fileId
    });
  }

  async downloadFile(filePath) {
    const response = await fetch(`${this.fileBaseUrl}/${filePath}`);
    if (!response.ok) {
      throw new Error(`Falha ao baixar arquivo do Telegram (${response.status})`);
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }
}
