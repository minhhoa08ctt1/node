'use strict';

const {
  SymbolAsyncIterator,
  SymbolIterator
} = primordials;
const { Buffer } = require('buffer');

const {
  ERR_INVALID_ARG_TYPE
} = require('internal/errors').codes;

function from(Readable, iterable, opts) {
  let iterator;
  if (typeof iterable === 'string' || iterable instanceof Buffer) {
    return new Readable({
      objectMode: true,
      ...opts,
      read() {
        this.push(iterable);
        this.push(null);
      }
    });
  }

  if (iterable && iterable[SymbolAsyncIterator])
    iterator = iterable[SymbolAsyncIterator]();
  else if (iterable && iterable[SymbolIterator])
    iterator = iterable[SymbolIterator]();
  else
    throw new ERR_INVALID_ARG_TYPE('iterable', ['Iterable'], iterable);

  const readable = new Readable({
    objectMode: true,
    ...opts
  });

  // Reading boolean to protect against _read
  // being called before last iteration completion.
  let reading = false;

  // needToClose boolean if iterator needs to be explicitly closed
  let needToClose = false;

  readable._read = function() {
    if (!reading) {
      reading = true;
      next();
    }
  };

  readable._destroy = function(error, cb) {
    if (needToClose) {
      needToClose = false;
      close().then(
        () => process.nextTick(cb, error),
        (e) => process.nextTick(cb, error || e),
      );
    } else {
      cb(error);
    }
  };

  async function close() {
    if (typeof iterator.return === 'function') {
      const { value } = await iterator.return();
      await value;
    }
  }

  async function next() {
    try {
      needToClose = false;
      const { value, done } = await iterator.next();
      needToClose = !done;
      const resolved = await value;
      if (done) {
        readable.push(null);
      } else if (readable.destroyed) {
        await close();
      } else if (readable.push(resolved)) {
        next();
      } else {
        reading = false;
      }
    } catch (err) {
      readable.destroy(err);
    }
  }
  return readable;
}

module.exports = from;
