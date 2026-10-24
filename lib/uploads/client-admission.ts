import { MAX_IMAGES } from "@/lib/uploads/limits";
export type UploadTicket = {
  generation: number;
  count: number;
  controller: AbortController;
};
export class UploadAdmission {
  private generation = 0;
  private readonly controllers = new Set<AbortController>();
  pending = 0;
  private chatId: string;
  constructor(chatId: string) {
    this.chatId = chatId;
  }
  switchChat(chatId: string) {
    if (chatId !== this.chatId) {
      this.cancel();
      this.chatId = chatId;
    }
  }
  cancel() {
    this.generation += 1;
    for (const controller of this.controllers) {
      controller.abort();
    }
    this.controllers.clear();
    this.pending = 0;
  }
  admit(current: number, count: number): UploadTicket | null {
    if (count < 1 || this.pending || current + count > MAX_IMAGES) {
      return null;
    }
    const controller = new AbortController();
    this.controllers.add(controller);
    this.pending += count;
    return { controller, count, generation: this.generation };
  }
  isCurrent(ticket: UploadTicket) {
    return (
      ticket.generation === this.generation && !ticket.controller.signal.aborted
    );
  }
  finish(ticket: UploadTicket) {
    if (this.isCurrent(ticket)) {
      this.pending -= ticket.count;
      this.controllers.delete(ticket.controller);
    }
  }
}
export async function completeDraftSubmission(
  send: () => Promise<unknown>,
  getError: () => Error | undefined,
  isCurrent: () => boolean,
  clear: () => void
) {
  await send();
  if (!isCurrent()) {
    return;
  }
  const error = getError();
  if (error) {
    throw error;
  }
  clear();
}
