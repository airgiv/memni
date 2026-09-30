/** A failure the user should read. `status` maps to the HTTP code. */
export class UserError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
