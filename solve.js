// A fast csv-reader 1.0.0-compatible parser, written from the published policy
// (RULES.txt): one left-to-right pass over the text, answering
// {columns, rows, errors} exactly as csv-reader 1.0.0 does.
//
// How it stays fast while the reference stays plain:
//   - one tight pass with charCodeAt (never text[pos] string indexing);
//   - fields are cut out with slice, never built a character at a time;
//   - quoted fields jump to the next quote with indexOf, and only the
//     segments that hold a newline or a doubled quote pay for a transform;
//   - no per-field function calls: the whole reader is one inlined loop;
//   - errors are pushed with the record's start line/row, as the policy says.
//
// Pure: no clock, no randomness, no locale, nothing kept between calls.

/** Field endings: 0 = comma (the record goes on), 1 = line break, 2 = end of text. */

/** csv-reader 1.0.0's answer for one case's input, {text, header}. */
export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const len = text.length;
  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;

  let pos = 0; // the next character to read
  let line = 1; // the line that character is on
  if (text.charCodeAt(0) === 0xFEFF) pos = 1;

  // The record being read: the line it starts on and the index in rows it takes.
  let recordLine = 1;
  let recordRow = null;

  // The value of a quoted-field segment [start, end): it holds no quote, so
  // only line breaks need work. A CR or CRLF inside it is read as LF and
  // counts one line; a lone LF counts one line; anything else is copied as is.
  // Returns the segment text and advances `line` past its breaks.
  const segValue = (start, end) => {
    const cr = text.indexOf('\r', start);
    if (cr === -1 || cr >= end) {
      // No CR in the segment: the value is the slice as it stands; count LFs.
      let i = text.indexOf('\n', start);
      while (i !== -1 && i < end) {
        line += 1;
        i = text.indexOf('\n', i + 1);
      }
      return text.slice(start, end);
    }
    // A CR is in the segment: scan it once, turning every CR and CRLF into LF.
    let out = '';
    let s = start;
    let i = start;
    while (i < end) {
      const c = text.charCodeAt(i);
      if (c === 13) {
        out += text.slice(s, i) + '\n';
        line += 1;
        i += text.charCodeAt(i + 1) === 10 ? 2 : 1;
        s = i;
      } else if (c === 10) {
        out += text.slice(s, i) + '\n';
        line += 1;
        i += 1;
        s = i;
      } else {
        i += 1;
      }
    }
    return out + text.slice(s, end);
  };

  while (true) {
    // Lines with no characters are no records.
    while (pos < len) {
      const c = text.charCodeAt(pos);
      if (c === 10) {
        pos += 1;
        line += 1;
      } else if (c === 13 && text.charCodeAt(pos + 1) === 10) {
        pos += 2;
        line += 1;
      } else {
        break;
      }
    }
    if (pos >= len) break;

    recordLine = line;
    recordRow = header && columns === null ? null : rows.length;
    const fields = [];
    let ended; // the field just read: 0 comma, 1 line break, 2 end
    let quoted = false;

    do {
      let value;
      ended = undefined; // fresh for this field; the reader below must set it
      let prefix = '';
      let fromJunk = false;

      if (text.charCodeAt(pos) === 34) {
        // A field that opens with a quote runs to the next quote that is not
        // doubled. Jump quote to quote; "" inside it is one quote.
        quoted = true;
        const open = pos;
        const openLine = line;
        let segStart = pos + 1;
        let segments = null;
        let closedAt = -1;
        while (true) {
          const q = text.indexOf('"', segStart);
          if (q === -1) break;
          if (text.charCodeAt(q + 1) === 34) {
            (segments ??= []).push(segValue(segStart, q), '"');
            segStart = q + 2;
            continue;
          }
          closedAt = q;
          break;
        }
        if (closedAt === -1) {
          // The quote never closes: it is a literal character, and the text
          // after it is read again as unquoted.
          pos = open + 1;
          line = openLine;
          errors.push({ code: 'unterminated_quote', line: recordLine, row: recordRow });
          prefix = '"';
        } else {
          const tail = segValue(segStart, closedAt);
          value = segments === null ? tail : segments.join('') + tail;
          pos = closedAt + 1;
          if (pos >= len) {
            ended = 2;
          } else {
            const c = text.charCodeAt(pos);
            if (c === 44) {
              pos += 1;
              ended = 0;
            } else if (c === 10) {
              pos += 1;
              line += 1;
              ended = 1;
            } else if (c === 13 && text.charCodeAt(pos + 1) === 10) {
              pos += 2;
              line += 1;
              ended = 1;
            } else {
              // What follows the closing quote is appended as it stands, up
              // to the next comma or line break: read it as unquoted.
              prefix = value;
              fromJunk = true;
            }
          }
        }
      } else {
        quoted = false;
      }

      if (ended === undefined) {
        // Unquoted reading onto `prefix`: commas and line breaks end it, a CR
        // not followed by LF is dropped (stray_cr), anything else is kept.
        // `added` counts the characters kept here (not the prefix).
        let added = 0;
        let start = pos;
        let acc = prefix;
        let v;
        let e;
        while (pos < len) {
          const c = text.charCodeAt(pos);
          if (c === 44) {
            v = acc + text.slice(start, pos);
            e = 0;
            pos += 1;
            break;
          }
          if (c === 10) {
            v = acc + text.slice(start, pos);
            e = 1;
            pos += 1;
            line += 1;
            break;
          }
          if (c === 13) {
            if (text.charCodeAt(pos + 1) === 10) {
              v = acc + text.slice(start, pos);
              e = 1;
              pos += 2;
              line += 1;
              break;
            }
            errors.push({ code: 'stray_cr', line: recordLine, row: recordRow });
            acc += text.slice(start, pos);
            pos += 1;
            start = pos;
            continue;
          }
          added += 1;
          pos += 1;
        }
        if (e === undefined) {
          v = acc + text.slice(start, pos);
          e = 2;
        }
        value = v;
        ended = e;
        if (fromJunk && added > 0) {
          errors.push({ code: 'quote_junk', line: recordLine, row: recordRow });
        }
      }
      fields.push(value);
    } while (ended === 0);

    // A line that held only stray CRs is left with no characters: no record
    // (its stray_cr errors stay).
    if (fields.length === 1 && fields[0] === '' && !quoted) continue;

    if (width < 0) width = fields.length;
    if (header && columns === null) {
      columns = fields;
      continue;
    }
    if (fields.length < width) {
      errors.push({ code: 'short_row', line: recordLine, row: recordRow, fields: fields.length });
      while (fields.length < width) fields.push('');
    } else if (fields.length > width) {
      errors.push({ code: 'long_row', line: recordLine, row: recordRow, extra: fields.splice(width) });
    }
    rows.push(fields);
  }
  return { columns: header ? (columns ?? []) : null, rows, errors };
}
