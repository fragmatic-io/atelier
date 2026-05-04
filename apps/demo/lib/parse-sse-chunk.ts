// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors

export interface ParsedFrame {
  event: string;
  data: string;
}

/**
 * Pull `event: X` / `data: Y` blocks out of an SSE chunk.
 */
export function parseSseChunk(buffer: string): { frames: ParsedFrame[]; remainder: string } {
  const frames: ParsedFrame[] = [];
  let lastTerminator = 0;
  let idx = buffer.indexOf('\n\n');
  while (idx !== -1) {
    const block = buffer.slice(lastTerminator, idx);
    let evt = 'message';
    const dataLines: string[] = [];
    for (const line of block.split('\n')) {
      if (line.startsWith('event: ')) evt = line.slice(7);
      else if (line.startsWith('data: ')) dataLines.push(line.slice(6));
    }
    if (dataLines.length > 0) frames.push({ event: evt, data: dataLines.join('\n') });
    lastTerminator = idx + 2;
    idx = buffer.indexOf('\n\n', lastTerminator);
  }
  return { frames, remainder: buffer.slice(lastTerminator) };
}
