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
