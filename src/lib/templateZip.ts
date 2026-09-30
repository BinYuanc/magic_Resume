/**
 * 极简 ZIP 读写（零依赖）。
 *
 * 为什么不用 jszip：项目当前依赖树里没有它，而本机 npm install 被沙箱策略挡住，
 * 更重要的是模板包只需要「读 3 个 JSON + 1 张 PNG」和「写同样 4 个文件」，
 * 使用内建压缩流；读取时校验结构、CRC 和解压资源上限。
 *
 * 支持：method 0 (stored) 与 method 8 (deflate raw)。
 */

const SIG_LOCAL = 0x04034b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_EOCD = 0x06054b50;

let crcTable: Uint32Array | null = null;
function getCrcTable(): Uint32Array {
  if (crcTable) return crcTable;
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c >>> 0;
  }
  crcTable = table;
  return table;
}

export function crc32(data: Uint8Array): number {
  const table = getCrcTable();
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc = table[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export interface UnzippedFile {
  name: string;
  size: number;
  bytes: (maxBytes?: number) => Promise<Uint8Array>;
  text: (maxBytes?: number) => Promise<string>;
}

async function inflateRaw(data: Uint8Array, maxBytes: number): Promise<Uint8Array> {
  const stream = new Blob([data]).stream().pipeThrough(
    new DecompressionStream("deflate-raw")
  );
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw new Error("ZIP 解压资源超过限制");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const result = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.length; }
  return result;
}

/** 解析 ZIP：返回按central directory 顺序的文件列表 */
export async function unzip(buffer: ArrayBuffer): Promise<UnzippedFile[]> {
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  const bounds = (offset: number, length: number, end = bytes.length) => {
    if (offset < 0 || length < 0 || offset + length > end) throw new Error("ZIP 结构越界");
  };

  // 从尾部倒着找 End Of Central Directory
  let eocd = -1;
  const minOffset = Math.max(0, bytes.length - 65558);
  for (let i = bytes.length - 22; i >= minOffset; i--) {
    if (view.getUint32(i, true) === SIG_EOCD &&
        i + 22 + view.getUint16(i + 20, true) === bytes.length &&
        (view.getUint16(i + 10, true) !== 0 || i === 0) &&
        (view.getUint32(i + 16, true) + view.getUint32(i + 12, true) === i ||
          view.getUint32(i + 16, true) === 0xffffffff || view.getUint32(i + 12, true) === 0xffffffff)) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("不是有效的 ZIP 文件（缺少结束标记）");

  const entryCount = view.getUint16(eocd + 10, true);
  let pointer = view.getUint32(eocd + 16, true);
  const centralSize = view.getUint32(eocd + 12, true);
  if (pointer === 0xffffffff || centralSize === 0xffffffff || entryCount === 0xffff) throw new Error("不支持 ZIP64 格式");
  if (view.getUint16(eocd + 4, true) || view.getUint16(eocd + 6, true) || view.getUint16(eocd + 8, true) !== entryCount) throw new Error("不支持多卷 ZIP");
  if (entryCount > 4096) throw new Error("ZIP 文件数量超过限制");
  bounds(pointer, centralSize, eocd);
  const centralEnd = pointer + centralSize;

  const files: UnzippedFile[] = [];
  for (let i = 0; i < entryCount; i++) {
    bounds(pointer, 46, centralEnd);
    if (view.getUint32(pointer, true) !== SIG_CENTRAL) {
      throw new Error("ZIP 中央目录损坏");
    }
    const method = view.getUint16(pointer + 10, true);
    const flags = view.getUint16(pointer + 8, true);
    const expectedCrc = view.getUint32(pointer + 16, true);
    const compressedSize = view.getUint32(pointer + 20, true);
    const uncompressedSize = view.getUint32(pointer + 24, true);
    const nameLength = view.getUint16(pointer + 28, true);
    const extraLength = view.getUint16(pointer + 30, true);
    const commentLength = view.getUint16(pointer + 32, true);
    const localOffset = view.getUint32(pointer + 42, true);
    if ([compressedSize, uncompressedSize, localOffset].includes(0xffffffff)) throw new Error("不支持 ZIP64 成员");
    if (view.getUint16(pointer + 34, true)) throw new Error("不支持多卷 ZIP");
    if (flags & 1) throw new Error("不支持加密 ZIP");
    bounds(pointer, 46 + nameLength + extraLength + commentLength, centralEnd);

    const rawName = bytes.subarray(pointer + 46, pointer + 46 + nameLength);
    // 旧 ZIP 的 ASCII 名称兼容；非 ASCII 必须明确声明 UTF-8，避免静默乱码。
    if (!(flags & 0x800) && rawName.some((b) => b > 127)) throw new Error("ZIP 文件名需要 UTF-8 编码");
    const name = new TextDecoder("utf-8", { fatal: true }).decode(rawName);

    bounds(localOffset, 30, view.getUint32(eocd + 16, true));
    if (view.getUint32(localOffset, true) !== SIG_LOCAL || view.getUint16(localOffset + 8, true) !== method || view.getUint16(localOffset + 6, true) !== flags) throw new Error("ZIP 本地文件头损坏");
    if (!(flags & 8) && (view.getUint32(localOffset + 14, true) !== expectedCrc || view.getUint32(localOffset + 18, true) !== compressedSize || view.getUint32(localOffset + 22, true) !== uncompressedSize)) throw new Error("ZIP 本地文件头与目录不一致");
    const localNameLength = view.getUint16(localOffset + 26, true);
    const localExtraLength = view.getUint16(localOffset + 28, true);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const dataEnd = dataStart + compressedSize;
    bounds(localOffset + 30, localNameLength + localExtraLength, view.getUint32(eocd + 16, true));
    const localName = bytes.subarray(localOffset + 30, localOffset + 30 + localNameLength);
    if (localName.length !== rawName.length || localName.some((b, n) => b !== rawName[n])) throw new Error("ZIP 文件名不一致");
    if (dataEnd > view.getUint32(eocd + 16, true)) throw new Error(`ZIP 成员 ${name} 数据越界`);
    const raw = bytes.subarray(dataStart, dataEnd);
    const read = async (maxBytes = 16 * 1024 * 1024) => {
      if (uncompressedSize > maxBytes) throw new Error(`ZIP 成员 ${name} 超过解压大小限制`);
      const data = method === 0 ? raw : method === 8 ? await inflateRaw(raw, maxBytes) : null;
      if (!data) throw new Error(`不支持的压缩方式 ${method}`);
      if (data.length > maxBytes || data.length !== uncompressedSize) throw new Error(`ZIP 成员 ${name} 长度错误`);
      if (crc32(data) !== expectedCrc) throw new Error(`ZIP 成员 ${name} CRC 校验失败`);
      return data;
    };

    files.push({
      name,
      size: uncompressedSize,
      bytes: read,
      text: async (maxBytes) => new TextDecoder("utf-8", { fatal: true }).decode(await read(maxBytes)),
    });

    pointer += 46 + nameLength + extraLength + commentLength;
  }
  if (pointer !== centralEnd) throw new Error("ZIP 中央目录长度错误");
  return files;
}

async function deflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data]).stream().pipeThrough(
    new CompressionStream("deflate-raw")
  );
  const buffer = await new Response(stream).arrayBuffer();
  return new Uint8Array(buffer);
}

/** 打包 ZIP：method 8（可用时），否则 0。返回字节数组。 */
export async function zipFiles(
  entries: { name: string; data: Uint8Array | string }[]
): Promise<Uint8Array> {
  if (entries.length > 4096) throw new Error("ZIP 文件数量超过限制");
  const encoder = new TextEncoder();
  const prepared: {
    nameBytes: Uint8Array;
    raw: Uint8Array;
    stored: Uint8Array;
    method: number;
    crc: number;
    offset: number;
  }[] = [];

  const useDeflate =
    typeof CompressionStream !== "undefined";

  for (const entry of entries) {
    if (encoder.encode(entry.name).length > 65535) throw new Error("ZIP 文件名过长");
    const raw =
      typeof entry.data === "string" ? encoder.encode(entry.data) : entry.data;
    let deflated = raw;
    if (useDeflate) {
      try { deflated = await deflateRaw(raw); } catch { /* 不支持 deflate-raw 时使用 stored */ }
    }
    const method = useDeflate && deflated.length < raw.length ? 8 : 0;
    const stored = method === 8 ? deflated : raw;
    prepared.push({
      nameBytes: encoder.encode(entry.name),
      raw,
      stored,
      method,
      crc: crc32(raw),
      offset: 0,
    });
  }

  const localParts: Uint8Array[] = [];
  let offset = 0;
  for (const item of prepared) {
    const header = new Uint8Array(30 + item.nameBytes.length);
    const view = new DataView(header.buffer);
    view.setUint32(0, SIG_LOCAL, true);
    view.setUint16(4, 20, true); // version needed
    view.setUint16(6, 0x800, true); // UTF-8 filenames
    view.setUint16(8, item.method, true);
    view.setUint16(10, 0, true); // mod time
    view.setUint16(12, 0, true); // mod date
    view.setUint32(14, item.crc, true);
    view.setUint32(18, item.stored.length, true);
    view.setUint32(22, item.raw.length, true);
    view.setUint16(26, item.nameBytes.length, true);
    view.setUint16(28, 0, true);
    header.set(item.nameBytes, 30);
    item.offset = offset;
    localParts.push(header, item.stored);
    offset += header.length + item.stored.length;
  }

  const centralParts: Uint8Array[] = [];
  let centralSize = 0;
  for (const item of prepared) {
    const header = new Uint8Array(46 + item.nameBytes.length);
    const view = new DataView(header.buffer);
    view.setUint32(0, SIG_CENTRAL, true);
    view.setUint16(4, 20, true);
    view.setUint16(6, 20, true);
    view.setUint16(8, 0x800, true);
    view.setUint16(10, item.method, true);
    view.setUint16(12, 0, true);
    view.setUint16(14, 0, true);
    view.setUint32(16, item.crc, true);
    view.setUint32(20, item.stored.length, true);
    view.setUint32(24, item.raw.length, true);
    view.setUint16(28, item.nameBytes.length, true);
    view.setUint16(30, 0, true);
    view.setUint16(32, 0, true);
    view.setUint16(34, 0, true);
    view.setUint16(36, 0, true);
    view.setUint32(38, 0, true);
    view.setUint32(42, item.offset, true);
    header.set(item.nameBytes, 46);
    centralParts.push(header);
    centralSize += header.length;
  }

  const eocd = new Uint8Array(22);
  const eocdView = new DataView(eocd.buffer);
  eocdView.setUint32(0, SIG_EOCD, true);
  eocdView.setUint16(8, prepared.length, true);
  eocdView.setUint16(10, prepared.length, true);
  eocdView.setUint32(12, centralSize, true);
  eocdView.setUint32(16, offset, true);

  const all = [...localParts, ...centralParts, eocd];
  const total = all.reduce((sum, part) => sum + part.length, 0);
  const result = new Uint8Array(total);
  let cursor = 0;
  for (const part of all) {
    result.set(part, cursor);
    cursor += part.length;
  }
  return result;
}
