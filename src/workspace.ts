import { invoke } from '@tauri-apps/api/core';

export interface ProjectInfo {
  id: number;
  name: string;
  root: string;
}

export interface DirectoryEntry {
  name: string;
  path: string;
  isDirectory: boolean;
}

export interface DocumentInfo {
  path: string;
  content: string;
  lineEnding: 'LF' | 'CRLF';
  hasBom: boolean;
}

export type DiskStatus = 'changed' | 'missing' | 'unreadable';

export interface OpenDocument extends DocumentInfo {
  savedContent: string;
  saving: boolean;
  diskStatus?: DiskStatus;
}

export function errorMessage(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'message' in error) return String(error.message);
  return String(error);
}

export function errorCode(error: unknown): string | undefined {
  if (typeof error === 'object' && error !== null && 'code' in error) return String(error.code);
}

export const chooseProject = () => invoke<ProjectInfo | null>('choose_project');
export const listDirectory = (projectId: number, path: string) =>
  invoke<DirectoryEntry[]>('list_directory', { projectId, path });
export const readDocument = (projectId: number, path: string) =>
  invoke<DocumentInfo>('read_document', { projectId, path });
export const saveDocument = (projectId: number, path: string, content: string) =>
  invoke<void>('save_document', { projectId, path, content });
export const checkDocuments = (projectId: number) =>
  invoke<{ path: string; status: DiskStatus }[]>('check_documents', { projectId });
export const closeDocument = (projectId: number, path: string) =>
  invoke<void>('close_document', { projectId, path });
export const readMarkdownImage = (projectId: number, path: string, imagePath: string) =>
  invoke<number[]>('read_markdown_image', { projectId, path, imagePath });
export const fileName = (path: string) => path.split(/[\\/]/).pop() || path;
export const isDirty = (document: OpenDocument) => document.content !== document.savedContent;
