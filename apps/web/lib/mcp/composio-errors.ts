export class ComposioAccountNotFoundError extends Error {
  constructor(message = "Connected Composio account not found for this user.") {
    super(message);
    this.name = "ComposioAccountNotFoundError";
  }
}
