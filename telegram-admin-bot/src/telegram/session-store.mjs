export class SessionStore {
  constructor() {
    this.sessions = new Map();
  }

  get(chatId) {
    return this.sessions.get(String(chatId)) || null;
  }

  set(chatId, state) {
    this.sessions.set(String(chatId), {
      ...state,
      updatedAt: Date.now()
    });
    return state;
  }

  clear(chatId) {
    this.sessions.delete(String(chatId));
  }
}
