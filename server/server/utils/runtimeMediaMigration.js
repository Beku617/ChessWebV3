import { migrateLegacyBotAvatarMedia } from "./botMedia.js";
import { migrateLegacyCommunityMediaPosts } from "./communityPosts.js";
import { migrateLegacyMessageAttachmentMedia } from "./messageMedia.js";

export async function migrateLegacyRuntimeMedia() {
  const [community, messages, bots] = await Promise.all([
    migrateLegacyCommunityMediaPosts(),
    migrateLegacyMessageAttachmentMedia(),
    migrateLegacyBotAvatarMedia(),
  ]);

  return {
    community,
    messages,
    bots,
  };
}
