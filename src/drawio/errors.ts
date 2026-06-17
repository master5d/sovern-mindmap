/** Thrown when a .drawio payload cannot be unwrapped or parsed. */
export class DrawioParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DrawioParseError';
  }
}
