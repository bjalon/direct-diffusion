const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

let crcTable = null;

function getCrcTable() {
  if (crcTable) return crcTable;
  crcTable = Array.from({ length: 256 }, (_, index) => {
    let c = index;
    for (let k = 0; k < 8; k += 1) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    return c >>> 0;
  });
  return crcTable;
}

function crc32(bytes) {
  let crc = 0xffffffff;
  const table = getCrcTable();
  for (let i = 0; i < bytes.length; i += 1) {
    crc = table[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function writeUint16(view, offset, value) {
  view.setUint16(offset, value, true);
}

function writeUint32(view, offset, value) {
  view.setUint32(offset, value, true);
}

export function createSingleFileZip(filename, content) {
  const nameBytes = textEncoder.encode(filename);
  const contentBytes = typeof content === 'string' ? textEncoder.encode(content) : new Uint8Array(content);
  const checksum = crc32(contentBytes);

  const localHeader = new Uint8Array(30 + nameBytes.length);
  const localView = new DataView(localHeader.buffer);
  writeUint32(localView, 0, 0x04034b50);
  writeUint16(localView, 4, 20);
  writeUint16(localView, 6, 0);
  writeUint16(localView, 8, 0);
  writeUint16(localView, 10, 0);
  writeUint16(localView, 12, 0);
  writeUint32(localView, 14, checksum);
  writeUint32(localView, 18, contentBytes.length);
  writeUint32(localView, 22, contentBytes.length);
  writeUint16(localView, 26, nameBytes.length);
  writeUint16(localView, 28, 0);
  localHeader.set(nameBytes, 30);

  const centralHeader = new Uint8Array(46 + nameBytes.length);
  const centralView = new DataView(centralHeader.buffer);
  writeUint32(centralView, 0, 0x02014b50);
  writeUint16(centralView, 4, 20);
  writeUint16(centralView, 6, 20);
  writeUint16(centralView, 8, 0);
  writeUint16(centralView, 10, 0);
  writeUint16(centralView, 12, 0);
  writeUint16(centralView, 14, 0);
  writeUint32(centralView, 16, checksum);
  writeUint32(centralView, 20, contentBytes.length);
  writeUint32(centralView, 24, contentBytes.length);
  writeUint16(centralView, 28, nameBytes.length);
  writeUint16(centralView, 30, 0);
  writeUint16(centralView, 32, 0);
  writeUint16(centralView, 34, 0);
  writeUint16(centralView, 36, 0);
  writeUint32(centralView, 38, 0);
  writeUint32(centralView, 42, 0);
  centralHeader.set(nameBytes, 46);

  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  writeUint32(endView, 0, 0x06054b50);
  writeUint16(endView, 4, 0);
  writeUint16(endView, 6, 0);
  writeUint16(endView, 8, 1);
  writeUint16(endView, 10, 1);
  writeUint32(endView, 12, centralHeader.length);
  writeUint32(endView, 16, localHeader.length + contentBytes.length);
  writeUint16(endView, 20, 0);

  return new Blob([localHeader, contentBytes, centralHeader, end], { type: 'application/zip' });
}

export async function readSingleFileZip(fileOrBlob) {
  const buffer = await fileOrBlob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);

  if (view.getUint32(0, true) !== 0x04034b50) {
    throw new Error('archive-invalid-signature');
  }

  const compressionMethod = view.getUint16(8, true);
  if (compressionMethod !== 0) {
    throw new Error('archive-unsupported-compression');
  }

  const fileNameLength = view.getUint16(26, true);
  const extraLength = view.getUint16(28, true);
  const compressedSize = view.getUint32(18, true);
  const nameStart = 30;
  const dataStart = nameStart + fileNameLength + extraLength;
  const dataEnd = dataStart + compressedSize;

  return {
    filename: textDecoder.decode(bytes.slice(nameStart, nameStart + fileNameLength)),
    content: textDecoder.decode(bytes.slice(dataStart, dataEnd)),
  };
}
