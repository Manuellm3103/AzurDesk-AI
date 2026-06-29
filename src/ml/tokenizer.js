import { randomUUID } from 'crypto';
import { safeJson } from '../services/_utils.js';

class ByteBPE {
  constructor(vocabSize = 5000) {
    this.vocabSize = vocabSize;
    this.vocab = {};
    this.merges = [];
    this.inverse = {};
  }

  fromText(texts) {
    const text = Array.isArray(texts) ? texts.join('\n') : (texts || '');
    // Byte-level initial tokens
    const tokens = Array.from(new TextEncoder().encode(text)).map((b) => String.fromCharCode(b));
    this.vocab = {};
    for (const t of tokens) this.vocab[t] = (this.vocab[t] || 0) + 1;

    const getPairs = (word) => {
      const pairs = new Map();
      for (let i = 0; i < word.length - 1; i++) {
        const pair = JSON.stringify([word[i], word[i + 1]]);
        pairs.set(pair, (pairs.get(pair) || 0) + 1);
      }
      return pairs;
    };

    let word = tokens;
    this.merges = [];
    while (Object.keys(this.vocab).length < this.vocabSize) {
      const counts = getPairs(word);
      if (!counts.size) break;
      let best = null, bestScore = 0;
      for (const [pair, c] of counts) {
        if (c > bestScore) { bestScore = c; best = pair; }
      }
      if (!best) break;
      const [a, b] = JSON.parse(best);
      const merged = a + b;
      const newWord = [];
      let i = 0;
      while (i < word.length) {
        const j = word.indexOf(a, i);
        if (j === -1) { newWord.push(...word.slice(i)); break; }
        newWord.push(...word.slice(i, j));
        i = j;
        if (i < word.length - 1 && word[i + 1] === b) {
          newWord.push(merged);
          i += 2;
        } else {
          newWord.push(word[i]);
          i += 1;
        }
      }
      word = newWord;
      this.vocab[merged] = (this.vocab[merged] || 0) + 1;
      this.merges.push([a, b]);
      if (this.merges.length >= this.vocabSize - 256) break;
    }
    this._buildInverse();
    return this;
  }

  _buildInverse() {
    this.inverse = {};
    for (const token of Object.keys(this.vocab)) {
      const bytes = Array.from(token).map((c) => c.charCodeAt(0));
      this.inverse[token] = new Uint8Array(bytes);
    }
  }

  encode(text) {
    const word = Array.from(new TextEncoder().encode(String(text))).map((b) => String.fromCharCode(b));
    for (const [a, b] of this.merges) {
      const merged = a + b;
      const newWord = [];
      let i = 0;
      while (i < word.length) {
        const j = word.indexOf(a, i);
        if (j === -1) { newWord.push(...word.slice(i)); break; }
        newWord.push(...word.slice(i, j));
        i = j;
        if (i < word.length - 1 && word[i + 1] === b) {
          newWord.push(merged);
          i += 2;
        } else {
          newWord.push(word[i]);
          i += 1;
        }
      }
      word.length = 0; word.push(...newWord);
    }
    return word;
  }

  decode(tokens) {
    const bytes = [];
    for (const t of tokens) {
      const b = this.inverse[t];
      if (b) bytes.push(...b);
      else bytes.push(t.charCodeAt(0));
    }
    return new TextDecoder().decode(new Uint8Array(bytes));
  }

  toJSON() {
    return { vocabSize: this.vocabSize, merges: this.merges, vocab: Object.keys(this.vocab) };
  }

  fromJSON(data) {
    this.vocabSize = data.vocabSize;
    this.merges = data.merges || [];
    this.vocab = {};
    for (const k of data.vocab || []) this.vocab[k] = 1;
    this._buildInverse();
    return this;
  }
}

class TokenizerService {
  constructor(db, modelPath = './data/tokenizer.json') {
    this.db = db;
    this.modelPath = modelPath;
    this.tokenizer = null;
    this._ensureTable();
    this.load();
  }

  _ensureTable() {
    this.db.exec(`CREATE TABLE IF NOT EXISTS tokenizer_models (
      id TEXT PRIMARY KEY,
      name TEXT,
      vocab TEXT,
      merges TEXT,
      vocab_size INTEGER,
      trained_on TEXT,
      created_at TEXT
    )`);
  }

  train(name, texts, vocabSize = 4000) {
    const bpe = new ByteBPE(vocabSize);
    bpe.fromText(texts);
    const row = this.db.prepare('SELECT id FROM tokenizer_models WHERE name=?').get(name);
    const id = row?.id || randomUUID();
    this.db.prepare(`INSERT OR REPLACE INTO tokenizer_models (id, name, vocab, merges, vocab_size, trained_on, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run(id, name, JSON.stringify(Object.keys(bpe.vocab)), JSON.stringify(bpe.merges), vocabSize, JSON.stringify(texts.slice(0, 5)), new Date().toISOString());
    this.tokenizer = bpe;
    return { id, name, vocabSize: Object.keys(bpe.vocab).length };
  }

  load(name = 'azurdesk-default') {
    const row = this.db.prepare('SELECT * FROM tokenizer_models WHERE name=?').get(name);
    if (!row) { this.tokenizer = new ByteBPE(4000); return false; }
    this.tokenizer = new ByteBPE(row.vocab_size).fromJSON({ vocabSize: row.vocab_size, merges: safeJson(row.merges, []), vocab: safeJson(row.vocab, []) });
    return true;
  }

  encode(text) {
    if (!this.tokenizer) throw new Error('Tokenizer no entrenado');
    return this.tokenizer.encode(text);
  }

  decode(tokens) {
    if (!this.tokenizer) throw new Error('Tokenizer no entrenado');
    return this.tokenizer.decode(tokens);
  }

  count(text) {
    return this.encode(text).length;
  }
}

export { ByteBPE, TokenizerService };
