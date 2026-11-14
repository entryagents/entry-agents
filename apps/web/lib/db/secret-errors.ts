export class InvalidSecretValueError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidSecretValueError";
  }
}
