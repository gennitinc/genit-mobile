import { router } from 'expo-router';

/** Opens a new chat, with `prompt` ready in the message box (not sent). */
export function openNewChat(prompt?: string, category?: 'automation') {
  router.push({ pathname: '/chat', params: { ...(prompt ? { prompt } : {}), ...(category ? { category } : {}) } });
}

export function openChatById(id: string, preview?: 'automation') {
  router.push({ pathname: '/chat/[id]', params: { id, ...(preview ? { preview } : {}) } });
}
