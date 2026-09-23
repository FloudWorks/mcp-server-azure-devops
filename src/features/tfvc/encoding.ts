/**
 * Text encoding helpers for TFVC files. TFVC stores a code page per file
 * (e.g. 65001 = UTF-8, 1200 = UTF-16LE, 1252 = Windows-1252). When editing a
 * file we decode with its code page and re-encode with the same one so the
 * file's encoding (and BOM) is preserved on check-in.
 */

export const CP_UTF8 = 65001;
export const CP_UTF16LE = 1200;
export const CP_UTF16BE = 1201;
export const CP_1252 = 1252;
/** TFVC reports -1 for binary files. */
export const CP_BINARY = -1;

export interface DecodedText {
  text: string;
  codePage: number;
  bom: boolean;
}

const BOM_UTF8 = [0xef, 0xbb, 0xbf];

function startsWith(buf: Buffer, bytes: number[]): boolean {
  return bytes.every((b, i) => buf[i] === b);
}

/** Detect a code page from a byte-order mark, if present. */
export function detectBom(buf: Buffer): number | undefined {
  if (startsWith(buf, BOM_UTF8)) return CP_UTF8;
  if (startsWith(buf, [0xff, 0xfe])) return CP_UTF16LE;
  if (startsWith(buf, [0xfe, 0xff])) return CP_UTF16BE;
  return undefined;
}

function swap16(buf: Buffer): Buffer {
  const out = Buffer.from(buf);
  for (let i = 0; i + 1 < out.length; i += 2) {
    const t = out[i];
    out[i] = out[i + 1];
    out[i + 1] = t;
  }
  return out;
}

export function decodeText(buf: Buffer, codePage?: number): DecodedText {
  const bomCp = detectBom(buf);
  const cp =
    codePage === undefined || codePage === 0 || codePage === CP_BINARY
      ? (bomCp ?? CP_UTF8)
      : codePage;

  switch (cp) {
    case CP_UTF8: {
      const bom = startsWith(buf, BOM_UTF8);
      return {
        text: buf.subarray(bom ? 3 : 0).toString('utf8'),
        codePage: cp,
        bom,
      };
    }
    case CP_UTF16LE: {
      const bom = startsWith(buf, [0xff, 0xfe]);
      return {
        text: buf.subarray(bom ? 2 : 0).toString('utf16le'),
        codePage: cp,
        bom,
      };
    }
    case CP_UTF16BE: {
      const bom = startsWith(buf, [0xfe, 0xff]);
      return {
        text: swap16(buf.subarray(bom ? 2 : 0)).toString('utf16le'),
        codePage: cp,
        bom,
      };
    }
    default: {
      // Single-byte Windows code pages (1250-1258 etc.)
      try {
        const decoder = new TextDecoder(`windows-${cp}`);
        return { text: decoder.decode(buf), codePage: cp, bom: false };
      } catch {
        throw new Error(
          `Unsupported TFVC file encoding (code page ${cp}). Provide contentBase64 instead of text.`,
        );
      }
    }
  }
}

let cp1252Reverse: Map<number, number> | undefined;

function encode1252(text: string): Buffer {
  if (!cp1252Reverse) {
    cp1252Reverse = new Map();
    const decoder = new TextDecoder('windows-1252');
    for (let b = 0; b < 256; b++) {
      const ch = decoder.decode(Buffer.from([b]));
      cp1252Reverse.set(ch.codePointAt(0)!, b);
    }
  }
  const out = Buffer.alloc(text.length);
  let i = 0;
  for (const ch of text) {
    const b = cp1252Reverse.get(ch.codePointAt(0)!);
    if (b === undefined) {
      throw new Error(
        `Character '${ch}' cannot be saved in this file's Windows-1252 encoding`,
      );
    }
    out[i++] = b;
  }
  return out.subarray(0, i);
}

export function encodeText(
  text: string,
  codePage: number,
  bom: boolean,
): Buffer {
  switch (codePage) {
    case CP_UTF8: {
      const body = Buffer.from(text, 'utf8');
      return bom ? Buffer.concat([Buffer.from(BOM_UTF8), body]) : body;
    }
    case CP_UTF16LE: {
      const body = Buffer.from(text, 'utf16le');
      return bom ? Buffer.concat([Buffer.from([0xff, 0xfe]), body]) : body;
    }
    case CP_UTF16BE: {
      const body = swap16(Buffer.from(text, 'utf16le'));
      return bom ? Buffer.concat([Buffer.from([0xfe, 0xff]), body]) : body;
    }
    case CP_1252:
      return encode1252(text);
    default:
      throw new Error(
        `Writing code page ${codePage} is not supported. Provide contentBase64 instead of text.`,
      );
  }
}
