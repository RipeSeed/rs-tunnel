export const logger = {
  info: (message: string, meta?: unknown) => {
    if (meta !== undefined) {
      console.log(message, meta);
      return;
    }

    console.log(message);
  },
  error: (message: string, meta?: unknown) => {
    if (meta !== undefined) {
      console.error(message, meta);
      return;
    }

    console.error(message);
  },
};
