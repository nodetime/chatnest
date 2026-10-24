// Reject instead of queueing arbitrary buffered multipart/decode work in memory.
export class UploadCapacityError extends Error {
  readonly status = 429;
  constructor() {
    super("图片服务繁忙，请稍后重试。");
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
