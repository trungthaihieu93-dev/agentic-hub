/** Base class for expected failures that carry a stable code for the API and CLI. */
export class AhError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class AlreadyInitializedError extends AhError {
  constructor(where: string) {
    super('already_initialized', `ah is already initialised at ${where}; use --reset to change the password`);
  }
}

export class NotInitializedError extends AhError {
  constructor(where: string) {
    super('not_initialized', `ah is not initialised at ${where}; run \`ah init\` first`);
  }
}

export class ConcurrentModificationError extends AhError {
  constructor(file: string) {
    super('concurrent_modification', `${file} kept changing while ah edited it; try again`);
  }
}

export class LockBusyError extends AhError {
  constructor() {
    super('lock_busy', 'Another ah operation is in progress; try again in a moment');
  }
}

export class ValidationError extends AhError {
  constructor(message: string) {
    super('invalid_input', message);
  }
}

export class NotFoundError extends AhError {
  constructor(message: string) {
    super('not_found', message);
  }
}

export class ConflictError extends AhError {
  constructor(message: string) {
    super('conflict', message);
  }
}
