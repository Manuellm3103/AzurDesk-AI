export function trainClassifier(samples) {
  const vocab = ['password','vpn','printer','email','slow','error','access','install','update','network','reset','forgot','login','account','drive','file','server','backup','security','wifi'];
  function featurize(text) {
    const t = String(text).toLowerCase();
    return vocab.map(v => t.includes(v) ? 1 : 0);
  }
  const weights = vocab.map((v, i) => {
    const pos = samples.filter((s) => s.label === 1 && featurize(s.text)[i]).length;
    return pos / (samples.length || 1);
  });
  return { weights, vocab };
}

export function predict(model, text) {
  const f = (t) => {
    const txt = String(t).toLowerCase();
    return model.vocab.map((v) => txt.includes(v) ? 1 : 0);
  };
  const features = f(text);
  let score = 0;
  for (let i = 0; i < features.length; i++) score += features[i] * model.weights[i];
  const labels = ['password-reset','vpn','printer','other'];
  return { predicted: labels[Math.min(labels.length - 1, Math.floor(score * labels.length))], score };
}
