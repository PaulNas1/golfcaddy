"use client";

import { deleteObject, getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { storage } from "./firebase";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

function getFileExtension(file: File) {
  const nameExtension = file.name.split(".").pop()?.trim().toLowerCase();
  if (nameExtension) return nameExtension;

  const mimeExtension = file.type.split("/").pop()?.trim().toLowerCase();
  return mimeExtension || "jpg";
}

function buildStoragePath(basePath: string, file: File) {
  return `${basePath}/${Date.now()}-${crypto.randomUUID()}.${getFileExtension(file)}`;
}

export function validateImageFile(file: File | null | undefined) {
  if (!file) return "Select an image file.";
  if (!file.type.startsWith("image/")) return "Only image files are supported.";
  if (file.size > MAX_IMAGE_BYTES) return "Images must be smaller than 5 MB.";
  return null;
}

export async function uploadUserAvatarImage(uid: string, file: File) {
  const path = buildStoragePath(`users/${uid}/avatar`, file);
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, file, { contentType: file.type });
  const url = await getDownloadURL(storageRef);
  return { path, url };
}

export async function uploadGroupLogoImage(groupId: string, file: File) {
  const path = buildStoragePath(`groups/${groupId}/logo`, file);
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, file, { contentType: file.type });
  const url = await getDownloadURL(storageRef);
  return { path, url };
}

export async function deleteStoredImage(path: string | null | undefined) {
  if (!path) return;

  try {
    await deleteObject(ref(storage, path));
  } catch (error) {
    console.warn("Unable to delete stored image", error);
  }
}
