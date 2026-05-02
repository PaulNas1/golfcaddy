/**
 * profileActions
 *
 * Re-exports the Firestore and Storage functions needed by profile
 * components, so those components don't need to import directly from
 * the large firestore.ts / storageUploads.ts files.
 */
export { updateUser } from "@/lib/firestore";
export {
  uploadUserAvatarImage,
  deleteStoredImage,
  validateImageFile,
} from "@/lib/storageUploads";
