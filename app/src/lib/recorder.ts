// Microphone recording via MediaRecorder (iOS Safari records audio/mp4).

export interface Recording { blob: Blob; mime: string; durMs: number }

const pickMime = () => {
  const cands = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg'];
  for (const m of cands) if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported?.(m)) return m;
  return '';
};

export class Recorder {
  private rec: MediaRecorder | null = null;
  private stream: MediaStream | null = null;
  private chunks: Blob[] = [];
  private t0 = 0;

  static supported() {
    return typeof MediaRecorder !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;
  }

  async start() {
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mime = pickMime();
    this.rec = new MediaRecorder(this.stream, mime ? { mimeType: mime } : undefined);
    this.chunks = [];
    this.rec.ondataavailable = (e) => e.data.size && this.chunks.push(e.data);
    this.rec.start();
    this.t0 = Date.now();
  }

  get recording() {
    return this.rec?.state === 'recording';
  }

  stop(): Promise<Recording> {
    return new Promise((res) => {
      if (!this.rec) return res({ blob: new Blob(), mime: '', durMs: 0 });
      const mime = this.rec.mimeType || 'audio/mp4';
      this.rec.onstop = () => {
        this.stream?.getTracks().forEach((t) => t.stop());
        res({ blob: new Blob(this.chunks, { type: mime }), mime, durMs: Date.now() - this.t0 });
      };
      this.rec.stop();
    });
  }
}

let el: HTMLAudioElement | null = null;
let url: string | null = null;
export function playBlob(b: Blob) {
  el ??= new Audio();
  if (url) URL.revokeObjectURL(url);
  url = URL.createObjectURL(b);
  el.src = url;
  return el.play();
}
export function stopBlob() {
  el?.pause();
}
