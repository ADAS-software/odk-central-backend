// Copyright 2017 ODK Central Developers
// See the NOTICE file at the top-level directory of this distribution and at
// https://github.com/opendatakit/central-backend/blob/master/NOTICE.
// This file is part of ODK Central. It is subject to the license terms in
// the LICENSE file found in the top-level directory of this distribution and at
// https://www.apache.org/licenses/LICENSE-2.0. No part of ODK Central,
// including this file, may be copied, modified, propagated, or distributed
// except according to the terms contained in the LICENSE file.
//
// a little utility to make it easier to merge files from multiple sources into
// a single zip stream. rather than devise a whole eventemitter protocol, we just
// use objectMode streams of streams, which already embody our workflow.

const { Readable } = require('stream');
const { PartialPipe } = require('./stream');
const archiver = require('archiver');

// Returns an object that can add files to an archive, without having that archive
// object directly nor knowing what else is going into it. Call append() to add a
// file, and call finalize() to indicate that no more files will be appended.
const zipPart = () => {
  const streamStream = new Readable({ read() {}, objectMode: true });
  return {
    stream: streamStream,
    append: (stream, options) => { streamStream.push({ stream, options }); },
    finalize: () => { streamStream.push(null); }
  };
};

// Given one or more zipParts (see above), actually supervises the construction of
// an output ZIP stream. Will finalize once all the consituent parts finalize.
//
// n.b. when a PartialPipe pipeline fails, we manually abort the resultStream
// after emitted the error, because otherwise archiver's behaviour is unpredictable:
// if the final component in the pipeline emitted the error, archiver would then
// emit it again, but if it was an intermediate component archiver wouldn't know
// about it. by manually aborting, we always emit the error and archiver never does.
const zipStreamFromParts = (...zipParts) => {
  let completed = 0;
  const resultStream = archiver('zip', { zlib: { level: 9 } });

  for (const part of zipParts) {
    part.stream.on('data', ({ stream, options }) => {
      const s = (stream instanceof PartialPipe)
        ? stream.pipeline((err) => { resultStream.emit('error', err); resultStream.abort(); })
        : stream;
      resultStream.append(s, options);
    });
    part.stream.on('error', (err) => { resultStream.emit('error', err); });
    part.stream.on('end', () => { // eslint-disable-line no-loop-func
      completed += 1;
      if (completed === zipParts.length)
        resultStream.finalize();
    });
  }

  return resultStream;
};

module.exports = { zipPart, zipStreamFromParts };

