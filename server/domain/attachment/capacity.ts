import { MAX_DOCUMENT_BYTES } from "@/server/domain/attachment/document-types";

// Reject instead of queueing arbitrary buffered multipart/decode work in memory.
export class UploadCapacityError extends Error {
  readonly status = 429;
  constructor(message = "附件上传繁忙，请稍后重试。") {
    super(message);
  }
}
export class UploadCapacity {
  private active = 0;
  private readonly maximum: number;
  constructor(maximum: number) {
    this.maximum = maximum;
  }
  async run<T>(work: () => Promise<T>): Promise<T> {
    if (this.active >= this.maximum) {
      throw new UploadCapacityError();
    }
    this.active += 1;
    try {
      return await work();
    } finally {
      this.active -= 1;
    }
  }
}
export const uploadCapacity = new UploadCapacity(4);
export const decodeCapacity = new UploadCapacity(2);

// Count retained verified bytes, not files: small previews can use remaining space.
export class DownloadCapacity {
  private used = 0;
  private readonly maxBytes: number;
  constructor(maxBytes: number) {
    this.maxBytes = maxBytes;
  }

  take(bytes: number): () => void {
    if (!Number.isSafeInteger(bytes) || bytes < 1) {
      throw new Error("invalid download size");
    }
    if (this.used + bytes > this.maxBytes) {
      throw new UploadCapacityError("附件下载繁忙，请稍后重试。");
    }
    this.used += bytes;
    let released = false;
    return () => {
      if (!released) {
        released = true;
        this.used -= bytes;
      }
    };
  }
}
export const downloadCapacity = new DownloadCapacity(2 * MAX_DOCUMENT_BYTES);

export function downloadBody(
  bytes: Uint8Array,
  release: () => void,
  signal?: AbortSignal
) {
  let source: Uint8Array | undefined = bytes;
  let offset = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let abort: (() => void) | undefined;
  const finish = () => {
    if (!source) {
      return;
    }
    source = undefined;
    clearTimeout(timer);
    if (abort) {
      signal?.removeEventListener("abort", abort);
    }
    release();
  };
  const arm = (controller: ReadableStreamDefaultController<Uint8Array>) => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      controller.error(new Error("附件下载超时。"));
      finish();
    }, 30_000);
  };
  return new ReadableStream<Uint8Array>(
    {
      cancel: finish,
      pull(controller) {
        if (!source) {
          return;
        }
        // An outstanding socket chunk must not pin the entire snapshot after release.
        const chunk = Uint8Array.from(
          source.subarray(offset, offset + 64 * 1024)
        );
        offset += chunk.length;
        controller.enqueue(chunk);
        if (offset === source.length) {
          controller.close();
          finish();
        } else {
          arm(controller);
        }
      },
      start(controller) {
        abort = () => {
          controller.error(new Error("附件下载已取消。"));
          finish();
        };
        if (signal?.aborted) {
          abort();
          return;
        }
        signal?.addEventListener("abort", abort, { once: true });
        arm(controller);
      },
    },
    { highWaterMark: 0 }
  );
}
