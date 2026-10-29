import request from "../utils/request";

export type MessageType = "system" | "private" | "notice";

export interface MessageItem {
  id: number;
  senderId: number | null;
  senderName: string | null;
  senderAvatar: string | null;
  receiverId: number;
  receiverName: string | null;
  type: MessageType;
  content: string;
  isRead: number;
  createdAt: string;
}

export interface MessagePageData {
  total: number;
  page: number;
  pageSize: number;
  totalPage: number;
  list: MessageItem[];
}

export interface ApiResult<T> {
  code: number;
  message: string;
  data?: T;
}

export function getRequestErrorMessage(
  error: unknown,
  fallback = "请求失败，请稍后重试"
): string {
  if (typeof error !== "object" || error === null) return fallback;

  const response = (error as {
    response?: { data?: { message?: unknown } };
  }).response;
  const message = response?.data?.message;

  return typeof message === "string" && message ? message : fallback;
}

// 收件箱（私信抽屉）
export function getInboxMessages(
  params: { page?: number; pageSize?: number; type?: MessageType } = {}
) {
  return request.get<ApiResult<MessagePageData>>("/message/inbox", { params });
}

// 未读消息数量（type 传 private 即未读私信）
export function getUnreadCount(type?: MessageType) {
  return request.get<ApiResult<{ unreadCount: number; type: string }>>(
    "/message/unread/count",
    { params: type ? { type } : undefined }
  );
}

// 标记消息已读（支持单个 ID 或 ID 数组）
export function markMessagesRead(messageIds: number | number[]) {
  return request.patch<ApiResult<{ markedCount: number }>>("/message/read", {
    messageIds,
  });
}

// 删除消息（后端校验：仅收件人或管理员）
export function deleteMessage(id: number) {
  return request.delete<ApiResult<never>>(`/message/${id}`);
}

export interface ConversationUser {
  id: number;
  name: string;
  avatar: string | null;
}

export interface ConversationSummary {
  userId: number;
  name: string;
  avatar: string | null;
  lastContent: string;
  lastAt: string | null;
  lastSenderId: number | null;
  unreadCount: number;
  total: number;
  isOwner: boolean;
}

export interface ConversationListData {
  owner: ConversationUser | null;
  conversations: ConversationSummary[];
}

export interface ConversationMessagesData {
  target: ConversationUser;
  list: MessageItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPage: number;
}

// 私信会话列表：博主看全部读者，其他账号只看与博主的会话
export function getConversations() {
  return request.get<ApiResult<ConversationListData>>("/message/conversations");
}

// 单个会话的消息（按时间正序返回当前页）
export function getConversation(
  userId: number,
  params: { page?: number; pageSize?: number } = {}
) {
  return request.get<ApiResult<ConversationMessagesData>>(
    `/message/conversation/${userId}`,
    { params }
  );
}

// 发送私信（后端限制：博主可回复任意用户，其他账号只能发给博主）
export function sendMessage(data: {
  receiverId: number;
  type: "private" | "system" | "notice";
  content: string;
}) {
  return request.post<ApiResult<{ messageId: number; createAt: string }>>(
    "/message",
    data
  );
}
