export type PasswordPrompt = (question: string) => Promise<string>;

export interface PromptStreams {
  input: NodeJS.ReadStream;
  output: NodeJS.WriteStream;
}

/**
 * Read a password from the terminal without echoing it. Refuses to run without a TTY, so the
 * password can never come from a pipe, a file or an environment variable.
 */
export function promptPassword(question: string, streams: PromptStreams = { input: process.stdin, output: process.stdout }): Promise<string> {
  const { input, output } = streams;
  if (!input.isTTY || typeof input.setRawMode !== 'function') {
    return Promise.reject(new Error('ah init needs an interactive terminal to read the password'));
  }
  return new Promise((resolve, reject) => {
    let value = '';
    output.write(question);
    input.setRawMode(true);
    input.resume();
    input.setEncoding('utf8');
    const done = (err?: Error) => {
      input.setRawMode(false);
      input.pause();
      input.removeListener('data', onData);
      output.write('\n');
      if (err) reject(err);
      else resolve(value);
    };
    const onData = (chunk: string) => {
      for (const ch of chunk) {
        if (ch === '\r' || ch === '\n') return done();
        if (ch === '\u0003') return done(new Error('Cancelled'));
        if (ch === '\u007f' || ch === '\b') value = value.slice(0, -1);
        else if (ch >= ' ') value += ch;
      }
    };
    input.on('data', onData);
  });
}
