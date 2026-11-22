import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { ApiError, apiUrl, authHeaders } from './api';

/** Picked or captured media, ready to upload. */
export type LocalFile = { uri: string; name?: string; mimeType?: string; size?: number };

export function uploadForm(field: string, file: LocalFile) {
  // The global fetch is expo/fetch, which rejects React Native's { uri, name, type } parts.
  const form = new FormData();
  form.append(field, new File(file.uri));
  return form;
}

function downloadsDirectory() {
  const directory = new Directory(Paths.cache, 'downloads');
  if (!directory.exists) directory.create({ intermediates: true });
  return directory;
}

function safeName(name: string) {
  return name.replace(/[^\w.\- ]+/g, '_').slice(0, 120) || 'download';
}

/**
 * Downloads an API resource that needs the session token (exports, private
 * attachments) and opens the share sheet so the user can save or send it.
 */
export async function downloadAndShare(path: string, fileName: string) {
  const destination = new File(downloadsDirectory(), safeName(fileName));
  if (destination.exists) destination.delete();
  try {
    await File.downloadFileAsync(apiUrl(path), destination, { headers: authHeaders() });
  } catch {
    throw new ApiError(0, "We couldn't download that file. Please try again.");
  }
  await shareFile(destination.uri);
}

/** Saves a public URL (like a library asset) locally, then opens the share sheet. */
export async function shareRemoteFile(url: string, fileName: string) {
  const destination = new File(downloadsDirectory(), safeName(fileName));
  if (destination.exists) destination.delete();
  try {
    await File.downloadFileAsync(url, destination);
  } catch {
    throw new ApiError(0, "We couldn't download that file. Please try again.");
  }
  await shareFile(destination.uri);
}

async function shareFile(uri: string) {
  if (!(await Sharing.isAvailableAsync())) {
    throw new ApiError(0, 'Sharing is not available on this device.');
  }
  await Sharing.shareAsync(uri);
}

export function formatBytes(bytes = 0) {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[unit]}`;
}
