export class InvalidMcpServerConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidMcpServerConfigError";
  }
}
