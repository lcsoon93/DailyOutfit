// Web Worker dello scontorno automatico: fa i calcoli pesanti fuori dalla
// pagina, così l'interfaccia resta fluida mentre si elaborano le foto.
importScripts('segment.js');

self.onmessage = (e) => {
  const { id, data, w, h, box } = e.data;
  try {
    const result = box ? Segment.segmentBox(data, w, h) : Segment.segment(data, w, h);
    self.postMessage({ id, result }, result ? [result.fg.buffer] : []);
  } catch (err) {
    self.postMessage({ id, error: String(err && err.message || err) });
  }
};
