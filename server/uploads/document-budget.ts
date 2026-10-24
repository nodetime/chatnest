import { UploadError } from "@/server/uploads/validation";
// One trusted server-owned budget per model round. Source previews and reads share it.
export class AttachmentRoundBudget {
  private remaining = 100_000;
  get remainingCharacters() {
    return this.remaining;
  }
  consume(characters: number) {
    if (
      !Number.isSafeInteger(characters) ||
      characters < 0 ||
      characters > this.remaining
    ) {
      throw new UploadError(
        429,
        "本轮附件来源文字预算（100,000 字符）已用尽，请新建会话或减少附件。"
      );
    }
    this.remaining -= characters;
  }
}
