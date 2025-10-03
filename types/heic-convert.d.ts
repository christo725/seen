declare module 'heic-convert' {
  interface ConvertOptions {
    buffer: Buffer;
    format: string;
    quality?: number;
  }

  function convert(options: ConvertOptions): Promise<Buffer>;
  export default convert;
}