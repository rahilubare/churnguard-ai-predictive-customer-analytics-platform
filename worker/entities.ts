/**
 * Entities for ChurnGuard AI and the original demo.
 */
import { IndexedEntity } from "./core-utils";
import type { User, Chat, ChatMessage, ModelArtifact } from "@shared/types";
import { MOCK_CHAT_MESSAGES, MOCK_CHATS, MOCK_USERS } from "@shared/mock-data";
// USER ENTITY: one DO instance per user
export class UserEntity extends IndexedEntity<User> {
  static readonly entityName = "user";
  static readonly indexName = "users";
  static readonly initialState: User = { id: "", name: "" };
  static seedData = MOCK_USERS;
}
// CHAT BOARD ENTITY: one DO instance per chat board, stores its own messages
export type ChatBoardState = Chat & { messages: ChatMessage[] };
const SEED_CHAT_BOARDS: ChatBoardState[] = MOCK_CHATS.map(c => ({
  ...c,
  messages: MOCK_CHAT_MESSAGES.filter(m => m.chatId === c.id),
}));
export class ChatBoardEntity extends IndexedEntity<ChatBoardState> {
  static readonly entityName = "chat";
  static readonly indexName = "chats";
  static readonly initialState: ChatBoardState = { id: "", title: "", messages: [] };
  static seedData = SEED_CHAT_BOARDS;
  async listMessages(): Promise<ChatMessage[]> {
    const { messages } = await this.getState();
    return messages;
  }
  async sendMessage(userId: string, text: string): Promise<ChatMessage> {
    const msg: ChatMessage = { id: crypto.randomUUID(), chatId: this.id, userId, text, ts: Date.now() };
    await this.mutate(s => ({ ...s, messages: [...s.messages, msg] }));
    return msg;
  }
}
// MODEL ENTITY: Stores trained model artifacts
export class ModelEntity extends IndexedEntity<ModelArtifact> {
  static readonly entityName = "model";
  static readonly indexName = "models";
  static readonly initialState: ModelArtifact = {
    id: "",
    name: "",
    createdAt: 0,
    targetVariable: "",
    features: [],
    performance: {
      accuracy: 0,
      precision: 0,
      recall: 0,
      f1: 0,
      rocAuc: 0,
      confusionMatrix: {
        truePositive: 0,
        trueNegative: 0,
        falsePositive: 0,
        falseNegative: 0,
      },
    },
    encodingMap: {},
    modelJson: "{}",
  };
}