import { api } from '@/lib/api';

export type ChatProject = {
  _id: string;
  title: string;
  status: string;
  category?: string;
  type?: string;
  messages?: { role: string; parts?: { type: string; text?: string }[]; createdAt: string }[];
  imageData?: { prompt?: string };
  videoData?: { prompt?: string };
  presentationData?: { outline?: unknown[] };
  createdAt: string;
  updatedAt: string;
};

type Page = {
  projects: ChatProject[];
  pagination: { currentPage: number; hasNextPage: boolean; totalCount: number };
};

export const historyKey = (search: string) => ['history', search] as const;

export const listChats = (page: number, search: string) =>
  api<Page>('project/myprojects', { query: { type: 'chat', page, limit: 10, search: search || undefined } });

export const archiveChat = (id: string) => api(`project/${id}/archive`, { method: 'PATCH', body: { archive: true } });
export const deleteChat = (id: string) => api(`project/${id}`, { method: 'DELETE' });

const kind = (project: ChatProject) => project.type || project.category;

/** The line under the title: a prompt, a slide count, or the last message. */
export function preview(project: ChatProject) {
  if (kind(project) === 'ai-image-gen' && project.imageData?.prompt) return project.imageData.prompt;
  if (kind(project) === 'ai-video-gen' && project.videoData?.prompt) return project.videoData.prompt;
  if (kind(project) === 'presentations' || kind(project) === 'presentation') {
    return `Presentation with ${project.presentationData?.outline?.length ?? 0} slides`;
  }
  const last = project.messages?.[project.messages.length - 1];
  // Chats run by the agent keep their messages elsewhere, so there may be nothing to show.
  return last?.parts?.find((part) => part.type === 'text' && part.text)?.text ?? '';
}

export function kindLabel(project: ChatProject) {
  const value = kind(project);
  if (value === 'ai-image-gen') return 'Image';
  if (value === 'ai-video-gen') return 'Video';
  if (value === 'presentations' || value === 'presentation') return 'Presentation';
  if (value === 'automation') return 'Automation';
  return 'Chat';
}
