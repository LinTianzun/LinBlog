import request from "../utils/request";
import type { ApiResult } from "./article";

export type NoteState = "draft" | "published";

export interface GardenNoteLink {
  id: number;
  title: string;
  slug: string;
}

// 公开花园：服务端已完成 Markdown 渲染与双链解析
export interface GardenNote {
  id: number;
  title: string;
  slug: string;
  excerpt?: string;
  html: string;
  publishedAt: string | null;
  updatedAt: string;
  outgoingLinks?: number;
  incomingLinks?: number;
  backlinks?: GardenNoteLink[];
  tags?: string[];
}

export interface GardenData {
  total: number;
  list: GardenNote[];
}

export function getPublicGarden() {
  return request.get<ApiResult<GardenData>>("/public/garden");
}

export function getPublicNote(id: number) {
  return request.get<ApiResult<GardenNote>>(`/public/garden/${id}`);
}

export interface GardenGraphNode {
  id: number;
  title: string;
  slug: string;
  tags: string[];
  publishedAt: string | null;
  updatedAt: string;
  outgoingLinks: number;
  incomingLinks: number;
}

export interface GardenGraphEdge {
  source: number;
  target: number;
}

export interface GardenGraph {
  nodes: GardenGraphNode[];
  edges: GardenGraphEdge[];
  tags: { name: string; count: number; degree: number }[];
}

export function getPublicGardenGraph() {
  return request.get<ApiResult<GardenGraph>>("/public/garden/graph");
}

export interface OwnedNote {
  id: number;
  title: string;
  slug: string;
  content: string;
  excerpt: string;
  state: NoteState;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  outgoingLinks: number;
  incomingLinks: number;
}

export interface OwnedNotePage {
  list: OwnedNote[];
  total: number;
  page: number;
  pageSize: number;
  totalPage: number;
}

export interface NoteSummary {
  all: number;
  draft: number;
  published: number;
}

export function getNotes(
  params: {
    page?: number;
    pageSize?: number;
    state?: NoteState;
    keyword?: string;
  } = {}
) {
  return request.get<ApiResult<OwnedNotePage>>("/note", { params });
}

export function getNoteById(id: number) {
  return request.get<ApiResult<OwnedNote>>(`/note/${id}`);
}

export function createNote(data: {
  title: string;
  content: string;
  state?: NoteState;
}) {
  return request.post<ApiResult<{ noteId: number }>>("/note", data);
}

export function updateNote(
  id: number,
  data: { title?: string; content?: string; state?: NoteState }
) {
  return request.put<ApiResult<{ found: boolean; state: NoteState }>>(
    `/note/${id}`,
    data
  );
}

export function deleteNote(id: number) {
  return request.delete<ApiResult<null>>(`/note/${id}`);
}

export function getNoteSummary() {
  return request.get<ApiResult<NoteSummary>>("/note/summary");
}

export interface TidySuggestion {
  id: number;
  title: string;
  excerpt: string;
  incomingLinks: number;
  score: number;
  reasons: string[];
}

export interface TidyNote {
  id: number;
  title: string;
  excerpt: string;
  tags: string[];
  outgoingLinks: number;
  incomingLinks: number;
  updatedAt: string;
  missingLinks: string[];
  suggestions: TidySuggestion[];
}

export interface TidyReport {
  orphans: TidyNote[];
  brokenLinks: TidyNote[];
  summary: { published: number; orphan: number; broken: number };
}

export function getNoteTidy(limit = 3) {
  return request.get<ApiResult<TidyReport>>("/note/tidy", {
    params: { limit },
  });
}
