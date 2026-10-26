import request from "./request";

export interface UploadTicket {
  ticket: string;
  expiresAt: string;
  expiresInMs: number;
  uses: number;
}

/**
 * 换取一张一次性短期上传票据。
 * yk-upload 自行发起 XHR 且无法附加请求头，凭证只能拼在 URL 上；
 * 用 5 分钟失效的一次性票据代替登录 JWT，避免长期凭证进入访问日志。
 */
export async function createUploadTicket(): Promise<UploadTicket> {
  const result = await request.post<{ code: number; data?: UploadTicket }>(
    "/upload/ticket"
  );
  const data = result.data;
  if (!data?.ticket) throw new Error("上传票据获取失败，请重新登录后再试");
  return data;
}

/**
 * 拼装图片上传地址。每次上传前调用，确保使用的是新票据。
 */
export async function buildImageUploadUrl(): Promise<string> {
  const { ticket } = await createUploadTicket();
  return `/api/upload/image?ticket=${encodeURIComponent(ticket)}`;
}
